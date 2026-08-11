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
