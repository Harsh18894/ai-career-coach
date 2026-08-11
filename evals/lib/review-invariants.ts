import { OPPORTUNITY_PLATFORMS, platformsForRegion } from '../../lib/resume-review/opportunity-platforms';
import { allowsEvidenceGuidance, allowsNarrativeAssessment } from '../../lib/resume-review/rubric';
import type { ReviewResult } from '../../lib/resume-review/schemas';

/* =====================================================================================
 * Deterministic invariants over a finished review. Pure code — no model, no network — which
 * is what lets R1-R6 run under `npm run eval:cheap`.
 *
 * These re-check, on real output, the guarantees lib/resume-review/post-validate.ts is
 * supposed to enforce. That overlap is deliberate and is the point: post-validate's own unit
 * tests prove the checker works on hand-built input, and these prove the checker was actually
 * applied to what the pipeline really produced. A refactor that dropped the post-validation
 * call entirely would pass every unit test and fail these.
 * ===================================================================================== */

export type Violation = { fixture: string; findingId?: string; detail: string };

const PLACEHOLDER_PATTERN = /\[[^\]]*\]/g;
const NUMBER_PATTERN = /\d[\d,.]*\s*%?/g;
const URL_PATTERN = /https?:\/\/[^\s"'<>)\]}]+/g;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/* ---- R1: no fabricated numbers ----------------------------------------------------------- */

/**
 * Every numeric token in a suggested rewrite must either already appear in the text it
 * replaces, or sit inside a bracketed placeholder. Zero tolerance: this is the rule the whole
 * feature is built around, and a single violation shipping means a candidate could walk into
 * an interview defending a number nobody ever gave them.
 */
export function checkNoFabrication(fixtureId: string, result: ReviewResult): Violation[] {
  const violations: Violation[] = [];

  for (const finding of result.findings) {
    if (!finding.suggestedText) continue;

    // Blank out placeholder spans, so "[X%] across [N] services" contributes no numbers.
    const masked = finding.suggestedText.replace(PLACEHOLDER_PATTERN, (match) => ' '.repeat(match.length));
    const numbers = (masked.match(NUMBER_PATTERN) ?? [])
      .map((token) => token.replace(/\D/g, ''))
      .filter(Boolean);

    const originalDigits = finding.originalText.replace(/\D/g, '');

    for (const digits of numbers) {
      if (!originalDigits.includes(digits)) {
        violations.push({
          fixture: fixtureId,
          findingId: finding.id,
          detail: `suggestedText introduces "${digits}" which is absent from originalText and not in a placeholder. suggested="${finding.suggestedText}" original="${finding.originalText}"`,
        });
      }
    }
  }

  return violations;
}

/* ---- R2: verbatim grounding -------------------------------------------------------------- */

/** Every originalText must be findable in the source resume. An empty one is legitimate: a
 * finding about a MISSING section has nothing to quote. */
export function checkVerbatimGrounding(fixtureId: string, result: ReviewResult, sourceText: string): Violation[] {
  const haystack = collapse(sourceText);
  const violations: Violation[] = [];

  for (const finding of result.findings) {
    if (finding.originalText.trim() === '') continue;
    if (!haystack.includes(collapse(finding.originalText))) {
      violations.push({
        fixture: fixtureId,
        findingId: finding.id,
        detail: `originalText is not present in the source resume: "${finding.originalText}"`,
      });
    }
  }

  return violations;
}

/* ---- R3: placeholder correctness ---------------------------------------------------------- */

/** The placeholders in the text and the declared list must match exactly, both directions —
 * the UI's standing explanation of why blanks exist is keyed off the declared list. */
export function checkPlaceholders(fixtureId: string, result: ReviewResult): Violation[] {
  const violations: Violation[] = [];

  for (const finding of result.findings) {
    const inText = new Set(finding.suggestedText?.match(PLACEHOLDER_PATTERN) ?? []);
    const declared = new Set(finding.addedPlaceholders);

    for (const placeholder of inText) {
      if (!declared.has(placeholder)) {
        violations.push({
          fixture: fixtureId,
          findingId: finding.id,
          detail: `"${placeholder}" appears in suggestedText but is not declared in addedPlaceholders`,
        });
      }
    }
    for (const placeholder of declared) {
      if (!inText.has(placeholder)) {
        violations.push({
          fixture: fixtureId,
          findingId: finding.id,
          detail: `"${placeholder}" is declared in addedPlaceholders but does not appear in suggestedText`,
        });
      }
    }
  }

  return violations;
}

/* ---- R4: platform registry integrity ------------------------------------------------------ */

const KNOWN_PLATFORM_IDS = new Set(OPPORTUNITY_PLATFORMS.map((platform) => platform.id));
const KNOWN_PLATFORM_URLS = new Set(OPPORTUNITY_PLATFORMS.map((platform) => platform.url));

/**
 * Three things at once: every returned id is real, every id is valid for the candidate's
 * region, and NO url anywhere in the result is one the model produced. The last is the one
 * that matters most — the Phase 0 baseline exists because model-generated links are how
 * hallucinated resources reach a user.
 */
export function checkPlatformIntegrity(
  fixtureId: string,
  result: ReviewResult,
  region: string | null,
  sourceText: string
): Violation[] {
  const violations: Violation[] = [];
  const allowed = new Set(platformsForRegion(region).map((platform) => platform.id));

  for (const id of result.internshipGuidance?.platformIds ?? []) {
    if (!KNOWN_PLATFORM_IDS.has(id)) {
      violations.push({ fixture: fixtureId, detail: `platform id "${id}" is not in the registry` });
    } else if (!allowed.has(id)) {
      violations.push({
        fixture: fixtureId,
        detail: `platform id "${id}" is not valid for region "${region ?? 'unknown'}"`,
      });
    }
  }

  for (const platform of result.resolvedPlatforms ?? []) {
    if (!KNOWN_PLATFORM_URLS.has(platform.url)) {
      violations.push({ fixture: fixtureId, detail: `resolved platform URL "${platform.url}" is not a registry URL` });
    }
  }

  // Any URL anywhere in the serialised result — including inside prose — must be one the model
  // did not invent. Two sources are legitimate: the curated registry, and the candidate's own
  // resume (a finding quoting a bullet that contains their GitHub link has not generated
  // anything). Anything else is a model-produced link, which is the failure the Phase 0
  // baseline was built to measure.
  // Compared without scheme or "www.": resumes routinely write a link bare ("github.com/x")
  // and the model normalises it to https:// when quoting. That is transcription, not
  // generation, and flagging it would make this check fire on every resume with a portfolio
  // link — the kind of false positive that gets a real guard switched off.
  const bareForm = (url: string) => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase();
  const sourceHaystack = sourceText.toLowerCase();

  const urls = JSON.stringify(result).match(URL_PATTERN) ?? [];
  for (const url of urls) {
    const cleaned = url.replace(/[.,;:!?)\]}]+$/, '');
    if (KNOWN_PLATFORM_URLS.has(cleaned)) continue;
    if (sourceHaystack.includes(bareForm(cleaned))) continue;
    violations.push({ fixture: fixtureId, detail: `model-generated URL found in output: "${cleaned}"` });
  }

  return violations;
}

/* ---- R5: persona gating -------------------------------------------------------------------- */

/** Enforced in post-validation precisely so it cannot depend on the model behaving. A
 * mid-level candidate told to get an internship is the failure this guards. */
export function checkPersonaGating(fixtureId: string, result: ReviewResult): Violation[] {
  const violations: Violation[] = [];
  const evidenceAllowed = allowsEvidenceGuidance(result.persona);
  const narrativeAllowed = allowsNarrativeAssessment(result.persona);

  if (!evidenceAllowed) {
    if (result.projectSuggestions?.length) {
      violations.push({ fixture: fixtureId, detail: `projectSuggestions present for persona "${result.persona}"` });
    }
    if (result.internshipGuidance) {
      violations.push({ fixture: fixtureId, detail: `internshipGuidance present for persona "${result.persona}"` });
    }
    if (result.resolvedPlatforms?.length) {
      violations.push({ fixture: fixtureId, detail: `resolvedPlatforms present for persona "${result.persona}"` });
    }
  }

  if (!narrativeAllowed && result.narrativeAssessment) {
    violations.push({ fixture: fixtureId, detail: `narrativeAssessment present for persona "${result.persona}"` });
  }

  if (result.path === 'independent') {
    if (result.recruiterScan) {
      violations.push({ fixture: fixtureId, detail: 'recruiterScan present on the independent path' });
    }
    if (result.requirementCoverage?.length) {
      violations.push({ fixture: fixtureId, detail: 'requirementCoverage present on the independent path' });
    }
  }

  // Rubric §7: no numeric score, on either path.
  if (/"score"|"rating"|"outOf"/.test(JSON.stringify(result))) {
    violations.push({ fixture: fixtureId, detail: 'result contains a numeric score field' });
  }

  return violations;
}

/* ---- R6: requirement traceability ---------------------------------------------------------- */

/**
 * Every requirement must be traceable to the job description. Matched word-by-word rather
 * than as an exact substring because a requirement is legitimately a condensed restatement —
 * but every significant word in it has to come from the JD, which catches wholly invented
 * requirements without demanding a verbatim quote.
 */
export function checkRequirementTraceability(
  fixtureId: string,
  result: ReviewResult,
  jobText: string
): Violation[] {
  const violations: Violation[] = [];
  const haystack = collapse(jobText);

  for (const coverage of result.requirementCoverage ?? []) {
    const core = collapse(coverage.requirement).replace(/\([^)]*\)/g, ' ').trim();
    const words = (core || collapse(coverage.requirement))
      .split(/[^a-z0-9+#.]+/i)
      .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9+#]+$/gi, ''))
      .filter((word) => word.length > 3);

    if (words.length === 0) {
      violations.push({ fixture: fixtureId, detail: `requirement has no matchable content: "${coverage.requirement}"` });
      continue;
    }

    const present = words.filter((word) => haystack.includes(word)).length;
    if (present / words.length < 0.6) {
      violations.push({
        fixture: fixtureId,
        detail: `requirement is not traceable to the job description (${present}/${words.length} words matched): "${coverage.requirement}"`,
      });
    }
  }

  return violations;
}

/** Formats violations for an assertion message, capped so a broad failure stays readable. */
export function describeViolations(violations: Violation[], limit = 6): string {
  const shown = violations.slice(0, limit).map((v) => `[${v.fixture}] ${v.detail}`);
  const extra = violations.length > limit ? ` (+${violations.length - limit} more)` : '';
  return shown.join(' | ') + extra;
}
