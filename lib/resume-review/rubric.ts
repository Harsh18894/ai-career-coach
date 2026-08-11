import type { ReviewDimension, ReviewPersona, Severity } from './schemas';

/* =====================================================================================
 * docs/resume-review-rubric.md, encoded.
 *
 * This is the machine-readable half of the rubric — the parts the prompt builder and
 * post-validation both need to agree on (expected sections, active dimensions, caps). The
 * prose document remains the source of truth for MEANING; if the two ever disagree, the
 * document is right and this file has a bug.
 *
 * Deliberate: only the ACTIVE persona's row is ever sent to the model (see prompt.ts). A
 * review that carries all four bars in its context invites the model to average them.
 * ===================================================================================== */

/** Rubric §1. Ordered most severe first — post-validation relies on this ordering when it
 * applies caps, so a `critical` finding is never dropped to make room for a `polish` one. */
export const SEVERITY_ORDER: Severity[] = ['critical', 'improvement', 'polish'];

export const SEVERITY_DEFINITIONS: Record<Severity, string> = {
  critical:
    'Likely to cost this candidate an interview, at their persona\'s bar, if left unaddressed.',
  improvement:
    'A meaningful lift — makes a stronger case, but its absence alone is unlikely to be the reason a resume is rejected.',
  polish: 'Marginal — the resume is correct without it, better with it.',
};

export const DIMENSION_DEFINITIONS: Record<ReviewDimension, string> = {
  section_completeness:
    'Whether the sections a reader expects at this stage are present. A missing section is read as "this candidate has nothing to put there", even when that is false.',
  quantified_impact:
    'Whether bullets state an outcome (what changed, by how much) rather than a duty (what the person was assigned to do). A number present for another reason — a headcount, a date — does not by itself make a bullet outcome-framed.',
  ats_parse_safety:
    'Artifacts visible in the EXTRACTED TEXT that indicate the document may not survive automated parsing: sentence fragments INTERLEAVED FROM ADJACENT COLUMNS (text from two different bullets alternating), tab/pipe pseudo-tables, icon or private-use-area glyphs, unrecognisable section headings, or a body far shorter than the stated experience implies. You are reading text already extracted from the original file, so you cannot see visual layout — never claim to have assessed layout, columns, or fonts directly, and say what was actually observed in the text. IMPORTANT: ordinary line wrapping is NOT a defect and must never be reported as one. Every resume is hard-wrapped at some column; a bullet continuing onto the next line is normal text, not evidence of a parsing problem. Only flag this dimension when the text is genuinely scrambled, not merely wrapped.',
  action_verb_strength:
    'Whether bullets lead with a strong, specific verb rather than a passive construction or a filler opener ("Responsible for", "Helped with", "Worked on", "Assisted in"). Readers skim first words.',
  signal_to_length:
    'Bullets per role, words per bullet, and how much space recent and relevant work gets versus old or peripheral work. Space is the strongest implicit priority signal a resume sends.',
  narrative_coherence:
    'Whether the sequence of roles reads as a deliberate arc — growing scope, increasing ambiguity handled, a visible thread — or as an unconnected list of jobs. Assessed role-to-role, not bullet-by-bullet.',
  evidence_portfolio:
    'The presence, count, and quality of projects and internships — the primary evidence available to someone with little or no full-time track record. Having no full-time experience is expected at this stage and is not itself the problem; having nothing that substitutes for it is.',
  requirement_coverage:
    'Whether the resume\'s existing content maps to what a specific job description states it wants. This is a SURFACE-MATCH signal only — it never judges whether the candidate is a good hire, is under- or over-qualified, or would enjoy the role.',
};

export type PersonaRubric = {
  label: string;
  definition: string;
  /** The one-line statement of what this persona's resume is being held to. */
  bar: string;
  expectedSections: string[];
  missingSectionSeverity: Severity;
  activeDimensions: ReviewDimension[];
  findingsCap: number;
  /** Rubric §3: senior is asymmetric — the two most recent roles get a higher cap than older
   * ones, which is the same "recent work deserves the most space" claim dimension
   * signal_to_length makes, applied to the review itself. */
  perRoleCap: { recent: number; older: number; recentRoleCount: number };
  /** Persona-specific escalation guidance, sent verbatim in the system prompt. */
  escalation: string;
};

export const PERSONA_RUBRIC: Record<ReviewPersona, PersonaRubric> = {
  student: {
    label: 'Student',
    definition: 'Currently enrolled, or graduated within the last 12 months, with no full-time professional role.',
    bar: 'Section completeness and evidence-building. A clean, specific duty-statement is already a reasonable outcome at this stage.',
    expectedSections: ['Contact', 'Education (with graduation date)', 'Projects or Internships/Experience', 'Skills'],
    missingSectionSeverity: 'critical',
    activeDimensions: [
      'section_completeness',
      'ats_parse_safety',
      'action_verb_strength',
      'signal_to_length',
      'evidence_portfolio',
    ],
    findingsCap: 10,
    perRoleCap: { recent: 4, older: 4, recentRoleCount: 2 },
    escalation:
      'A bullet with no quantified outcome is at most "polish" for this persona — no professional track record is expected to have produced a metric yet. Do NOT raise it higher. Missing expected sections are "critical".',
  },
  early_career: {
    label: 'Early career',
    definition: '0–2 years of full-time professional experience.',
    bar: 'Moving from duties to outcomes.',
    expectedSections: ['Contact', 'Experience', 'Education', 'Skills'],
    missingSectionSeverity: 'critical',
    activeDimensions: [
      'section_completeness',
      'quantified_impact',
      'ats_parse_safety',
      'action_verb_strength',
      'signal_to_length',
      'evidence_portfolio',
    ],
    findingsCap: 12,
    perRoleCap: { recent: 5, older: 5, recentRoleCount: 2 },
    escalation:
      'A bullet with no quantified outcome is "improvement" for this persona — real work now exists to quantify, so not doing so is a missed opportunity rather than a failure.',
  },
  mid_level: {
    label: 'Mid level',
    definition: '2–6 years of full-time professional experience.',
    bar: 'Critical. Ownership, scope, and quantified impact.',
    expectedSections: ['Contact', 'Experience', 'Education', 'Skills'],
    missingSectionSeverity: 'critical',
    activeDimensions: [
      'section_completeness',
      'quantified_impact',
      'ats_parse_safety',
      'action_verb_strength',
      'signal_to_length',
    ],
    findingsCap: 12,
    perRoleCap: { recent: 5, older: 5, recentRoleCount: 2 },
    escalation:
      'A bullet with no quantified outcome at all is "critical" for this persona — it is the single most common reason a mid-level resume reads as junior. Additionally, surface as a finding that a generic resume underperforms one tailored to a specific role, and point to the review-against-a-job path as the concrete next step.',
  },
  senior: {
    label: 'Senior',
    definition: '6+ years of full-time professional experience.',
    bar: 'Most critical. The resume must tell one coherent story, not list jobs.',
    expectedSections: ['Contact', 'Experience', 'Education'],
    // Rubric §3: a senior resume missing e.g. a Skills block is a smaller loss, because scope
    // is demonstrated in Experience rather than declared in a list.
    missingSectionSeverity: 'improvement',
    activeDimensions: [
      'section_completeness',
      'quantified_impact',
      'ats_parse_safety',
      'action_verb_strength',
      'signal_to_length',
      'narrative_coherence',
    ],
    findingsCap: 15,
    perRoleCap: { recent: 6, older: 3, recentRoleCount: 2 },
    escalation:
      'A bullet with no quantified outcome is "critical" — at this level its absence on a role that plausibly had real scope reads as either the scope was not real or the candidate cannot articulate it, and both readings are costly. A senior resume that is merely tidy is not a good senior resume: assess the narrative explicitly and say so when the arc is not there. Being strictest does NOT mean inventing findings — a genuinely excellent senior resume should return few or zero "critical" findings.',
  },
};

/** Rubric §6. The flag modifies the review; the years-based persona still applies. */
export const CAREER_SWITCHER_MODIFIER = `This candidate is a CAREER SWITCHER: their full-time history is in one domain while their recent skills, projects, or stated direction point at a different one.

Apply the modifier as follows:
- Assess writing craft, structure, narrative, and scope articulation at their years-based persona's bar. They know how to write a resume; do not treat them as a beginner at it.
- Assess DOMAIN-SPECIFIC evidence against the target domain's expectations, not their tenure persona's. Years of evidence in the old domain does not satisfy an evidence bar in the new one.
- Do NOT tell them to seek an internship the way you would an 18-year-old. If evidence-building is genuinely the gap, frame it as building a project that demonstrates the new domain.
- Transferable skills are real evidence when they are genuinely transferable — name them specifically rather than dismissing the prior career.`;

/** Rubric §5, sent on every review regardless of persona. */
export const STRONG_RESUME_RULE = `If this resume is genuinely strong at this persona's bar, return few or zero "critical" findings and say so plainly and positively in overallRead. Manufacturing criticism to appear useful is a failure, not thoroughness. A stricter bar means more things count IF they are actually wrong — never that you should find something regardless of whether anything is wrong.`;

/** Rubric §7. */
export const OUT_OF_SCOPE_RULE = `This tool deliberately does NOT: give a score out of 100 or any numeric rating; rank the candidate against others; predict a hire/no-hire outcome; rewrite the whole document; or deliver a fit verdict on the against-job path. Do not produce any of these, and do not imply them in prose.`;

/*
 * NOTE — an approach that was tried and reverted, recorded so it is not retried blindly:
 * forcing every `quantified_impact` finding to the persona's escalation severity in code.
 * The motivation was run-to-run variance in the critical count. Measured across three runs it
 * did NOT reduce that variance (the delta stayed at 4, because the spread comes from which
 * dimensions fire at all, not from how this one is graded), and it made every outcome-less
 * bullet on a senior resume critical — which pushed a genuinely strong senior resume to 2
 * critical findings and broke the strong-resume rule (§5). Severity stayed a model judgement.
 */

export function personaRubric(persona: ReviewPersona): PersonaRubric {
  return PERSONA_RUBRIC[persona];
}

/** Dimensions valid for a given persona and path. Post-validation drops findings on any
 * dimension outside this set, so a mid-level review can never carry an evidence_portfolio
 * finding no matter what the model returns. */
export function activeDimensionsFor(persona: ReviewPersona, path: 'independent' | 'against_job'): ReviewDimension[] {
  const base = PERSONA_RUBRIC[persona].activeDimensions;
  return path === 'against_job' ? [...base, 'requirement_coverage'] : base;
}

/** Rubric §3.2 / §4: project suggestions and internship guidance exist only for the two
 * personas with an evidence-portfolio dimension. Enforced in code, never by prompt alone — a
 * mid-level candidate must never be told to get an internship. */
export function allowsEvidenceGuidance(persona: ReviewPersona): boolean {
  return persona === 'student' || persona === 'early_career';
}

/** Rubric §2.6: narrative assessment is senior-only. mid_level has narrative concerns but
 * they are not yet the primary lens and do not get their own section. */
export function allowsNarrativeAssessment(persona: ReviewPersona): boolean {
  return persona === 'senior';
}
