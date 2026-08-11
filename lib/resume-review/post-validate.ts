import { createHash } from 'node:crypto';
import { resolvePlatformIds } from './opportunity-platforms';
import {
  SEVERITY_ORDER,
  activeDimensionsFor,
  allowsEvidenceGuidance,
  allowsNarrativeAssessment,
  personaRubric,
} from './rubric';
import type {
  Finding,
  JobDescription,
  ResumeSegment,
  ReviewModelOutput,
  ReviewPath,
  ReviewPersona,
  ReviewResult,
} from './schemas';

/* =====================================================================================
 * Programmatic post-validation.
 *
 * docs/resume-review-rubric.md §8.4: "A prompt instruction is a request; a candidate's
 * interview is a consequence. This rule gets code, not good intentions."
 *
 * Everything here runs on the complete model output BEFORE anything reaches the user. The
 * consistent posture is DROP, never correct: a finding that breaks an invariant is discarded
 * and logged, not quietly patched into something that looks acceptable. Silently repairing a
 * fabrication would hide exactly the failure this stage exists to catch.
 * ===================================================================================== */

export type DropReason =
  | 'unknown-dimension'
  | 'dimension-not-active-for-persona'
  | 'original-text-not-verbatim'
  | 'unknown-bullet-id'
  | 'no-target'
  | 'fabricated-number'
  | 'placeholder-mismatch'
  | 'requirement-not-traceable'
  | 'over-cap'
  | 'over-role-cap';

export type DroppedItem = {
  kind: 'finding' | 'requirement' | 'platform';
  reason: DropReason | 'unknown-id' | 'wrong-region';
  detail: string;
};

export type PostValidationReport = {
  result: ReviewResult;
  dropped: DroppedItem[];
};

/* ---- text helpers -------------------------------------------------------------------- */

/** Whitespace-insensitive comparison. The rubric says "character for character", and the
 * canonicalisation below preserves that in the OUTPUT — but a model that re-wraps a bullet
 * across lines has not fabricated anything, and dropping its finding over a newline would be
 * pedantry that costs the candidate real advice. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Finds `needle` inside `source` ignoring whitespace differences, and returns the EXACT
 * substring of `source` that matched — so the value stored on the finding is always real
 * source text, character for character, even when the model re-wrapped or re-spaced its quote.
 *
 * Returns null when the text genuinely is not present, which is the fabricated-quote case.
 *
 * A partial quote is legitimate and common: a model fixing one clause of a long bullet quotes
 * that clause, not the whole line. Requiring equality with the entire bullet rejected those,
 * which cost real findings — observed live, where one review lost every bullet-level finding
 * this way. The anti-fabrication guarantee is unchanged: the text must still genuinely appear.
 */
export function findVerbatimSpan(source: string, needle: string): string | null {
  const collapsedNeedle = collapse(needle);
  if (!collapsedNeedle) return null;

  // Collapse `source` while recording, for each collapsed character, its index in the original.
  let collapsedSource = '';
  const indexMap: number[] = [];
  let inWhitespace = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (/\s/.test(char)) {
      if (!inWhitespace && collapsedSource.length > 0) {
        collapsedSource += ' ';
        indexMap.push(i);
      }
      inWhitespace = true;
      continue;
    }
    inWhitespace = false;
    collapsedSource += char.toLowerCase();
    indexMap.push(i);
  }

  const at = collapsedSource.indexOf(collapsedNeedle);
  if (at < 0) return null;

  const start = indexMap[at];
  const end = indexMap[at + collapsedNeedle.length - 1] + 1;
  return source.slice(start, end);
}

/** Bracketed placeholder spans, e.g. "[X%]". */
const PLACEHOLDER_PATTERN = /\[[^\]]*\]/g;

export function extractPlaceholders(text: string): string[] {
  return text.match(PLACEHOLDER_PATTERN) ?? [];
}

/** Numeric tokens: bare integers/decimals, percentages, and figures with thousands
 * separators. Deliberately greedy — a false positive costs one finding, a false negative
 * ships a fabricated metric. */
const NUMBER_PATTERN = /\d[\d,.]*\s*%?/g;

function numbersOutsidePlaceholders(text: string): string[] {
  // Blank out placeholder spans first, so "[X%] across [N] services" contributes no numbers.
  const masked = text.replace(PLACEHOLDER_PATTERN, (match) => ' '.repeat(match.length));
  return (masked.match(NUMBER_PATTERN) ?? []).map((n) => n.trim().replace(/[.,]$/, '')).filter(Boolean);
}

/** A number is grounded if its digits appear in the original. Compared digits-only so "18%"
 * in a suggestion matches "18 %" or "18" in the source — the concern is inventing a
 * MAGNITUDE, not reformatting one that was already there. */
function isNumberGrounded(candidate: string, originalText: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (!digits) return true;
  return originalText.replace(/\D/g, '').includes(digits);
}

/* ---- finding validation --------------------------------------------------------------- */

function makeFindingId(finding: Omit<Finding, 'id'>): string {
  const hash = createHash('sha1')
    .update(`${finding.dimension}|${finding.targetBulletId ?? finding.targetSection ?? ''}|${finding.originalText}`)
    .digest('hex')
    .slice(0, 10);
  return `find-${hash}`;
}

/** Every bullet id in the segment, mapped to its canonical verbatim text. */
function bulletIndex(segment: ResumeSegment): Map<string, string> {
  const index = new Map<string, string>();
  for (const role of segment.roles) for (const b of role.bullets) index.set(b.id, b.text);
  for (const project of segment.projects) for (const b of project.bullets) index.set(b.id, b.text);
  return index;
}

/** Every piece of text a structural finding could legitimately quote. */
function sectionHaystack(segment: ResumeSegment, rawResumeText: string): string {
  const parts = [
    rawResumeText,
    segment.summary ?? '',
    segment.skills.join(' '),
    ...segment.roles.flatMap((r) => [r.title, r.company ?? '', ...r.bullets.map((b) => b.text)]),
    ...segment.education.map((e) => `${e.institution} ${e.degree ?? ''} ${e.endDate ?? ''}`),
    ...segment.projects.flatMap((p) => [p.title, p.description ?? '', ...p.bullets.map((b) => b.text)]),
    ...segment.other.flatMap((o) => [o.heading, o.content]),
  ];
  return collapse(parts.join(' \n '));
}

/** Which role a bullet belongs to, and whether that role is among the N most recent. Resume
 * convention is most-recent-first, and segmentation preserves the source ordering, so array
 * position is the recency signal available. */
function roleRecencyIndex(segment: ResumeSegment, recentRoleCount: number): Map<string, { roleId: string; isRecent: boolean }> {
  const index = new Map<string, { roleId: string; isRecent: boolean }>();
  segment.roles.forEach((role, position) => {
    for (const bullet of role.bullets) {
      index.set(bullet.id, { roleId: role.id, isRecent: position < recentRoleCount });
    }
  });
  return index;
}

/* ---- main ------------------------------------------------------------------------------ */

export type PostValidateInput = {
  output: ReviewModelOutput;
  segment: ResumeSegment;
  rawResumeText: string;
  persona: ReviewPersona;
  careerSwitcher: boolean;
  path: ReviewPath;
  region: string | null;
  jobDescription?: JobDescription | null;
};

export function postValidateReview(input: PostValidateInput): PostValidationReport {
  const { output, segment, rawResumeText, persona, careerSwitcher, path, region, jobDescription } = input;

  const dropped: DroppedItem[] = [];
  const rubric = personaRubric(persona);
  const allowedDimensions = new Set(activeDimensionsFor(persona, path));
  const bullets = bulletIndex(segment);
  const haystack = sectionHaystack(segment, rawResumeText);

  /* -- findings ------------------------------------------------------------------------ */

  const surviving: Finding[] = [];

  for (const raw of output.findings) {
    const label = `${raw.dimension}/${raw.targetBulletId ?? raw.targetSection ?? 'untargeted'}`;

    if (!allowedDimensions.has(raw.dimension)) {
      dropped.push({
        kind: 'finding',
        reason: 'dimension-not-active-for-persona',
        detail: `${label}: dimension is not active for persona "${persona}" on path "${path}".`,
      });
      continue;
    }

    if (!raw.targetBulletId && !raw.targetSection) {
      dropped.push({ kind: 'finding', reason: 'no-target', detail: `${label}: finding targets neither a bullet nor a section.` });
      continue;
    }

    // Canonicalise originalText to the segment's stored text so the OUTPUT is exact even when
    // the model re-wrapped whitespace. Anything that isn't a whitespace-level difference is a
    // fabricated quote and gets dropped.
    let originalText = raw.originalText;

    if (raw.targetBulletId) {
      const canonical = bullets.get(raw.targetBulletId);
      if (canonical === undefined) {
        dropped.push({ kind: 'finding', reason: 'unknown-bullet-id', detail: `${label}: bullet id not present in the segmented resume.` });
        continue;
      }
      const span = findVerbatimSpan(canonical, raw.originalText);
      if (span === null) {
        dropped.push({
          kind: 'finding',
          reason: 'original-text-not-verbatim',
          detail:
            `${label}: originalText is not present in the referenced bullet. ` +
            `quoted="${raw.originalText.slice(0, 120)}" bullet="${canonical.slice(0, 120)}"`,
        });
        continue;
      }
      originalText = span;
    } else if (raw.originalText.trim() !== '') {
      // Structural findings about something ABSENT legitimately carry an empty originalText.
      // When one does quote, it must be resume text — not the section labels or formatting of
      // the rendered data block in the prompt, which the model has been observed quoting.
      const span = findVerbatimSpan(rawResumeText, raw.originalText);
      if (span !== null) {
        originalText = span;
      } else if (!haystack.includes(collapse(raw.originalText))) {
        dropped.push({
          kind: 'finding',
          reason: 'original-text-not-verbatim',
          detail: `${label}: originalText was not found in the resume. quoted="${raw.originalText.slice(0, 120)}"`,
        });
        continue;
      }
    }

    if (raw.suggestedText) {
      // THE fabrication check. Any number in the suggestion that is neither present in the
      // original nor safely inside a placeholder is an invented metric.
      const fabricated = numbersOutsidePlaceholders(raw.suggestedText).filter(
        (n) => !isNumberGrounded(n, originalText)
      );
      if (fabricated.length > 0) {
        dropped.push({
          kind: 'finding',
          reason: 'fabricated-number',
          detail: `${label}: suggestedText introduces number(s) absent from the original and not in a placeholder: ${fabricated.join(', ')}`,
        });
        continue;
      }

      // Placeholders must be declared exactly, both directions — the UI's standing explanation
      // of why the tool refuses to invent figures is keyed off addedPlaceholders.
      const inText = new Set(extractPlaceholders(raw.suggestedText));
      const declared = new Set(raw.addedPlaceholders);
      const same = inText.size === declared.size && [...inText].every((p) => declared.has(p));
      if (!same) {
        dropped.push({
          kind: 'finding',
          reason: 'placeholder-mismatch',
          detail: `${label}: placeholders in suggestedText [${[...inText].join(', ')}] do not match addedPlaceholders [${[...declared].join(', ')}].`,
        });
        continue;
      }
    }

    surviving.push({ ...raw, originalText, id: makeFindingId({ ...raw, originalText }) });
  }

  /* -- caps: highest severity first, so a critical is never dropped for a polish -------- */

  const bySeverity = [...surviving].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
  const recency = roleRecencyIndex(segment, rubric.perRoleCap.recentRoleCount);
  const perRoleCounts = new Map<string, number>();
  const capped: Finding[] = [];

  for (const finding of bySeverity) {
    if (capped.length >= rubric.findingsCap) {
      dropped.push({
        kind: 'finding',
        reason: 'over-cap',
        detail: `${finding.dimension}: dropped, persona cap of ${rubric.findingsCap} findings reached.`,
      });
      continue;
    }

    const role = finding.targetBulletId ? recency.get(finding.targetBulletId) : undefined;
    if (role) {
      const limit = role.isRecent ? rubric.perRoleCap.recent : rubric.perRoleCap.older;
      const used = perRoleCounts.get(role.roleId) ?? 0;
      if (used >= limit) {
        dropped.push({
          kind: 'finding',
          reason: 'over-role-cap',
          detail: `${finding.dimension}: dropped, per-role cap of ${limit} reached for role ${role.roleId}.`,
        });
        continue;
      }
      perRoleCounts.set(role.roleId, used + 1);
    }

    capped.push(finding);
  }

  /* -- persona gating, enforced in code, never by prompt -------------------------------- */

  const evidenceAllowed = allowsEvidenceGuidance(persona);

  let projectSuggestions = evidenceAllowed ? output.projectSuggestions ?? null : null;
  if (projectSuggestions && projectSuggestions.length > 3) projectSuggestions = projectSuggestions.slice(0, 3);
  if (!evidenceAllowed && output.projectSuggestions?.length) {
    dropped.push({
      kind: 'finding',
      reason: 'dimension-not-active-for-persona',
      detail: `projectSuggestions stripped: persona "${persona}" must never receive them.`,
    });
  }

  const internshipGuidance = evidenceAllowed ? output.internshipGuidance ?? null : null;
  if (!evidenceAllowed && output.internshipGuidance) {
    dropped.push({
      kind: 'finding',
      reason: 'dimension-not-active-for-persona',
      detail: `internshipGuidance stripped: persona "${persona}" must never be told to seek an internship.`,
    });
  }

  let resolvedPlatforms = null;
  let guidance = internshipGuidance;
  if (guidance) {
    const { platforms, dropped: droppedPlatforms } = resolvePlatformIds(guidance.platformIds, region);
    for (const drop of droppedPlatforms) {
      dropped.push({ kind: 'platform', reason: drop.reason, detail: `platform id "${drop.id}" dropped (${drop.reason}).` });
    }
    resolvedPlatforms = platforms.map((p) => ({ id: p.id, name: p.name, url: p.url, notes: p.notes }));
    guidance = { ...guidance, platformIds: platforms.map((p) => p.id) };
  }

  const narrativeAssessment = allowsNarrativeAssessment(persona) ? output.narrativeAssessment ?? null : null;

  /* -- against-job: requirements must be traceable to the JD --------------------------- */

  let requirementCoverage = path === 'against_job' ? output.requirementCoverage ?? null : null;
  if (requirementCoverage && jobDescription) {
    const jdHaystack = collapse(jobDescription.descriptionText);
    const traceable = requirementCoverage.filter((coverage) => {
      // Word-level containment rather than exact substring: a requirement is legitimately a
      // condensed restatement ("3+ years with production Kubernetes"), but every significant
      // word in it must actually come from the JD. This catches wholly invented requirements
      // without demanding the model quote a full sentence verbatim.
      // Parenthetical asides are the model's own annotation ("(Nice to have)", "(preferred)"),
      // not part of the requirement, and judging them for traceability is what dropped
      // "Go experience. (Nice to have)" live even though "Go experience" is verbatim in the JD.
      // Strip them, then strip punctuation, then match on what the requirement actually says.
      const core = collapse(coverage.requirement).replace(/\([^)]*\)/g, ' ').trim();
      const words = (core || collapse(coverage.requirement))
        .split(/[^a-z0-9+#.]+/i)
        .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9+#]+$/gi, ''))
        .filter((w) => w.length > 3);
      if (words.length === 0) return false;
      const present = words.filter((w) => jdHaystack.includes(w)).length;
      const ok = present / words.length >= 0.6;
      if (!ok) {
        dropped.push({
          kind: 'requirement',
          reason: 'requirement-not-traceable',
          detail: `requirement "${coverage.requirement}" is not traceable to the job description text.`,
        });
      }
      return ok;
    });
    requirementCoverage = traceable;
  }

  const result: ReviewResult = {
    persona,
    careerSwitcher,
    path,
    overallRead: output.overallRead,
    dimensionNotes: output.dimensionNotes.filter((n) => allowedDimensions.has(n.dimension)),
    findings: capped,
    projectSuggestions,
    internshipGuidance: guidance,
    resolvedPlatforms,
    narrativeAssessment,
    recruiterScan: path === 'against_job' ? output.recruiterScan ?? null : null,
    requirementCoverage,
  };

  logDrops(dropped, persona, path);

  return { result, dropped };
}

/** One structured line per drop, matching the telemetry convention in lib/telemetry.ts so
 * these are greppable alongside llm_call and api_error records. Fabrications are logged at
 * error level with INVALID_OUTPUT: they are the failure this whole stage exists to catch, and
 * they are evidence worth keeping. */
function logDrops(dropped: DroppedItem[], persona: ReviewPersona, path: ReviewPath): void {
  for (const drop of dropped) {
    const record = {
      event: 'review_item_dropped',
      timestamp: new Date().toISOString(),
      kind: drop.kind,
      reason: drop.reason,
      persona,
      path,
      detail: drop.detail,
      ...(drop.reason === 'fabricated-number' ? { errorCode: 'INVALID_OUTPUT' } : {}),
    };
    if (drop.reason === 'fabricated-number') console.error(JSON.stringify(record));
    else console.warn(JSON.stringify(record));
  }
}
