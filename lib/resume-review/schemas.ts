import { z } from 'zod';

/* =====================================================================================
 * Shared types for resume review — schemas mirror docs/resume-review-rubric.md exactly; if
 * they ever disagree, the rubric wins and the mismatch should be flagged, not silently
 * resolved in code.
 *
 * This file has no model calls and does no judgement. See lib/resume-review/segment.ts (the
 * extraction stage) and lib/resume-review/persona.ts (classification) for the pipeline stages
 * that populate these shapes. Task 4 adds Finding/ProjectSuggestion/InternshipGuidance/
 * RecruiterScan/RequirementCoverage/ReviewResult on top of ResumeSegment defined here.
 * ===================================================================================== */

export const REVIEW_PERSONAS = ['student', 'early_career', 'mid_level', 'senior'] as const;
export type ReviewPersona = (typeof REVIEW_PERSONAS)[number];

export const BulletSchema = z.object({
  // Stable, content-derived id assigned in code after extraction (see segment.ts's
  // makeStableId) — never produced by the model, which cannot guarantee an id is unique or
  // stays the same across two runs of the same resume.
  id: z.string(),
  text: z.string(), // verbatim, exactly as it appears in the source resume
});
export type Bullet = z.infer<typeof BulletSchema>;

export const RoleSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string().nullish(),
  location: z.string().nullish(),
  startDate: z.string().nullish(), // verbatim as written, e.g. "August 2019"
  endDate: z.string().nullish(), // verbatim as written, e.g. "Present"
  // Normalized by the extraction model — same class of work as ProfileSchema.roleHistory's
  // durationMonths in lib/ai/schemas.ts. The arithmetic happens once, during extraction; it is
  // never recomputed by a second model call. Null when the dates can't be resolved.
  durationMonths: z.number().nullish(),
  // Judgement call (gpt-5-nano, made during segmentation): distinguishes an internship from a
  // full-time role. Persona classification (persona.ts) excludes internship months from
  // "total full-time experience" using this flag, with no separate model call needed for the
  // split itself.
  isInternship: z.boolean(),
  bullets: z.array(BulletSchema),
});
export type Role = z.infer<typeof RoleSchema>;

export const EducationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string().nullish(),
  fieldOfStudy: z.string().nullish(),
  location: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(), // verbatim, e.g. "2021", "Expected 2026", "June 2025"
  // Judgement call (gpt-5-nano): a bare year doesn't say whether the candidate graduated or is
  // still enrolled toward a date the resume never spells out — the model reads surrounding
  // phrasing ("Expected", tense, adjacent resume content) to decide.
  isOngoing: z.boolean(),
});
export type Education = z.infer<typeof EducationSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  bullets: z.array(BulletSchema),
  technologies: z.array(z.string()),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ContactSchema = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  location: z.string().nullish(),
  links: z.array(z.string()), // verbatim as written — not validated/normalized as URLs here
});
export type Contact = z.infer<typeof ContactSchema>;

export const OtherSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
});
export type OtherSection = z.infer<typeof OtherSectionSchema>;

export const ResumeSegmentSchema = z.object({
  contact: ContactSchema,
  summary: z.string().nullish(),
  roles: z.array(RoleSchema),
  education: z.array(EducationSchema),
  projects: z.array(ProjectSchema),
  skills: z.array(z.string()),
  // Anything real that doesn't fit the sections above (certifications, activities,
  // publications) — kept as labeled free text rather than forced into the wrong shape.
  other: z.array(OtherSectionSchema),
});
export type ResumeSegment = z.infer<typeof ResumeSegmentSchema>;

/* =====================================================================================
 * Review output — mirrors docs/resume-review-rubric.md. Where the two disagree, the rubric
 * is right and this file has a bug.
 *
 * There is deliberately NO numeric score field on either path. See rubric §7: a single number
 * invites false precision and a comparability this review cannot honestly provide. Do not add
 * one.
 * ===================================================================================== */

export const REVIEW_DIMENSIONS = [
  'section_completeness',
  'quantified_impact',
  'ats_parse_safety',
  'action_verb_strength',
  'signal_to_length',
  'narrative_coherence',   // mid_level + senior only
  'evidence_portfolio',    // student + early_career only
  'requirement_coverage',  // against-job path only
] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

/** Rubric §1: defined by consequence at this persona's bar, not by how the finding feels. */
export const SEVERITIES = ['critical', 'improvement', 'polish'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const REVIEW_PATHS = ['independent', 'against_job'] as const;
export type ReviewPath = (typeof REVIEW_PATHS)[number];

export const FindingSchema = z.object({
  // Content-derived, assigned in code after validation (same reasoning as bullet ids above).
  id: z.string(),
  dimension: z.enum(REVIEW_DIMENSIONS),
  severity: z.enum(SEVERITIES),
  // Exactly one of these locates the finding. A bullet-level finding carries the bullet's id;
  // a structural one (a missing section, an ordering problem) names the section instead.
  targetBulletId: z.string().nullish(),
  targetSection: z.string().nullish(),
  // Must appear verbatim in the source. Enforced in post-validate.ts, not by the prompt.
  originalText: z.string(),
  // Null is legitimate: structural findings often have no single-line rewrite.
  suggestedText: z.string().nullish(),
  reason: z.string(),
  // Every bracketed placeholder introduced in suggestedText, e.g. "[X%]". The candidate fills
  // these in themselves — the tool never invents the number. Rubric §8.
  addedPlaceholders: z.array(z.string()),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ProjectSuggestionSchema = z.object({
  title: z.string(),
  scope: z.string(),
  skillDemonstrated: z.string(),
  // The specific resume element this was derived from — a course, the degree, a listed
  // language, a stated interest. Rubric §3.2: a suggestion that could be pasted into another
  // student's review unedited has failed the grounding bar.
  groundedIn: z.string(),
  estimatedEffort: z.string(),
});
export type ProjectSuggestion = z.infer<typeof ProjectSuggestionSchema>;

export const InternshipGuidanceSchema = z.object({
  // Ids only, resolved to URLs in code against the curated registry. The model never sees or
  // writes a URL. See lib/resume-review/opportunity-platforms.ts.
  platformIds: z.array(z.string()),
  approach: z.array(z.string()),
  leverageExisting: z.string(),
});
export type InternshipGuidance = z.infer<typeof InternshipGuidanceSchema>;

export const RecruiterScanSchema = z.object({
  whatLandsFirst: z.string(),
  whatIsMissingUpTop: z.string(),
  fifteenSecondVerdict: z.string(),
  worksWell: z.array(z.string()),
  worksAgainst: z.array(z.string()),
});
export type RecruiterScan = z.infer<typeof RecruiterScanSchema>;

export const RequirementCoverageSchema = z.object({
  // Must be traceable to the job description text — enforced in post-validate.ts. The model is
  // not free to invent requirements the JD never stated.
  requirement: z.string(),
  status: z.enum(['covered', 'partial', 'absent']),
  evidenceInResume: z.string().nullish(),
  howToAddress: z.string(),
});
export type RequirementCoverage = z.infer<typeof RequirementCoverageSchema>;

export const DimensionNoteSchema = z.object({
  dimension: z.enum(REVIEW_DIMENSIONS),
  note: z.string(),
});
export type DimensionNote = z.infer<typeof DimensionNoteSchema>;

/** Rubric §2.6 — senior only, and the more important output at that level. */
export const NarrativeAssessmentSchema = z.object({
  progression: z.string(),
  scopeGrowth: z.string(),
  spaceAllocation: z.string(),
  influenceBeyondDelivery: z.string(),
  overall: z.string(),
});
export type NarrativeAssessment = z.infer<typeof NarrativeAssessmentSchema>;

/** What the model returns. persona/careerSwitcher are NOT here — they are set by code from
 * the classification stage, never echoed back by the review model. */
export const ReviewModelOutputSchema = z.object({
  overallRead: z.string(),
  dimensionNotes: z.array(DimensionNoteSchema),
  findings: z.array(FindingSchema.omit({ id: true })),
  projectSuggestions: z.array(ProjectSuggestionSchema).nullish(),
  internshipGuidance: InternshipGuidanceSchema.nullish(),
  narrativeAssessment: NarrativeAssessmentSchema.nullish(),
  recruiterScan: RecruiterScanSchema.nullish(),
  requirementCoverage: z.array(RequirementCoverageSchema).nullish(),
});
export type ReviewModelOutput = z.infer<typeof ReviewModelOutputSchema>;

/** A platform resolved from the registry, ready for the UI. Built in code; the model only ever
 * supplied the id. */
export const ResolvedPlatformSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  notes: z.string(),
});
export type ResolvedPlatform = z.infer<typeof ResolvedPlatformSchema>;

export const ReviewResultSchema = z.object({
  persona: z.enum(REVIEW_PERSONAS),
  careerSwitcher: z.boolean(),
  path: z.enum(REVIEW_PATHS),
  overallRead: z.string(),
  dimensionNotes: z.array(DimensionNoteSchema),
  findings: z.array(FindingSchema),
  projectSuggestions: z.array(ProjectSuggestionSchema).nullish(),
  internshipGuidance: InternshipGuidanceSchema.nullish(),
  /** URLs looked up in code from internshipGuidance.platformIds. */
  resolvedPlatforms: z.array(ResolvedPlatformSchema).nullish(),
  narrativeAssessment: NarrativeAssessmentSchema.nullish(),
  recruiterScan: RecruiterScanSchema.nullish(),
  requirementCoverage: z.array(RequirementCoverageSchema).nullish(),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/** Normalised job description for the against-job path. Task 5 populates this from a URL or
 * pasted text; Task 4 only consumes it. */
export const JobDescriptionSchema = z.object({
  title: z.string().nullish(),
  company: z.string().nullish(),
  location: z.string().nullish(),
  descriptionText: z.string(),
  sourceUrl: z.string().nullish(),
  retrievalMethod: z.enum(['paste', 'structured_api', 'html_extraction']),
});
export type JobDescription = z.infer<typeof JobDescriptionSchema>;
