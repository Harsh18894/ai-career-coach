import { z } from 'zod';
import { TIER_ORDER, type PathTier } from './tiers';

export const RoleHistorySchema = z.object({
  title: z.string(),
  company: z.string().nullish(),
  durationMonths: z.number().nullish(),
});

export const ProfileSchema = z.object({
  name: z.string().nullish(),
  yearsExperience: z.number(),
  currentRole: z.string().nullish(),
  currentLevel: z.enum(['IC', 'senior_IC', 'manager', 'unknown']),
  roleHistory: z.array(RoleHistorySchema),
  skills: z.array(z.string()),
  domains: z.array(z.string()),
  region: z.string().nullish(),
  // Single best-guess country for the candidate (from locations, addresses, phone code, education).
  // Null if it cannot be determined or the resume is ambiguous across countries.
  country: z.string().nullish(),
  // Distinct countries that appear ANYWHERE in the resume (role locations, education, address).
  // Used to detect ambiguity: if more than one, the coach must ask which market to target.
  countriesDetected: z.array(z.string()),
  notableTransitions: z.array(z.string()),
  tensions: z.array(z.string()),
  inferredPersona: z.enum(['pivot', 'grow', 'early_career', 'unknown']),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const AmbitionCheckSchema = z.object({
  verdict: z.enum(['aligned', 'too_high', 'too_low']), // honest calibration of the candidate's stated ambition against their actual profile
  note: z.string(), // specific, evidence-cited explanation. If 'too_high': must name the extra-than-average effort required (extended timeline and/or additional job-switch steps). If 'too_low': must name the evidence that justifies aiming higher.
});

export const CareerPathSchema = z.object({
  title: z.string(),
  tier: z.enum(TIER_ORDER as [PathTier, ...PathTier[]]), // difficulty/effort-timeline classification — exactly one path per tier among the 3 in a deck
  fitRationale: z.string(), // MUST cite a profile fact or a user statement
  salaryRange: z.string(),  // indicative, region-aware, labeled (local currency for the resolved market)
  upskills: z.array(z.string()), // 2-4 concrete skills to acquire
  firstMove: z.string().nullish(),
  ambitionCheck: AmbitionCheckSchema, // realism calibration vs. the candidate's stated/implied ambition
});

export const PathDeckSchema = z.object({
  paths: z.array(CareerPathSchema).length(3),
});

export type AmbitionCheck = z.infer<typeof AmbitionCheckSchema>;
export type CareerPath = z.infer<typeof CareerPathSchema>;

export const RoadmapWeekSchema = z.object({
  week: z.number(), // sequential week number across the WHOLE roadmap (continues incrementing across phases, starts at 1)
  focus: z.string(), // one-line theme for this specific week, specific to the candidate/path
  items: z.array(z.string()).min(2).max(5), // concrete action items to complete that week
});

export const RoadmapPhaseSchema = z.object({
  type: z.enum(['course', 'project', 'practice', 'application']), // practice always sits after course/project prep and before application
  title: z.string(), // e.g. "Foundational + advanced courses", "Portfolio project", "Mock interviews & case practice", "Apply to target roles"
  description: z.string().nullish(), // why this phase matters for this candidate specifically
  weeks: z.array(RoadmapWeekSchema).min(1), // contiguous week-by-week breakdown for this phase
});

export const RoadmapSchema = z.object({
  skillLevel: z.enum(['beginner', 'basic', 'good', 'experienced']), // candidate's readiness for the CHOSEN PATH specifically, not their overall seniority
  summary: z.string(), // 1-2 sentences explaining the classification, citing a profile fact
  weeklyHoursCommitment: z.string(), // e.g. "8-10 hours/week" — persona default (student vs. working professional) or the candidate's explicit override
  totalWeeks: z.number(), // the highest "week" number used across all phases (not a sum)
  totalDuration: z.string(), // human label derived from totalWeeks, e.g. "16 weeks (~4 months)"
  phases: z.array(RoadmapPhaseSchema).min(1),
});

export type RoadmapWeek = z.infer<typeof RoadmapWeekSchema>;
export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;

// A dynamically-generated coach question paired with optional quick-reply choices — used for
// turns where the question text itself varies every time (ongoing UNDERSTANDING-phase follow-ups,
// the no-resume guided intake's adaptive questions), so options can't be hardcoded client-side.
export const AdaptiveQuestionSchema = z.object({
  message: z.string(), // the coach's question/message, in natural mentor voice
  // 2-5 short quick-reply choices covering the most likely answers to THIS question; omit/null
  // if the question is genuinely too open-ended for a good small fixed set (the UI then falls
  // back to plain free text, same as today).
  options: z.array(z.string()).min(2).max(5).nullish(),
  allowMultiple: z.boolean(), // true if multiple options can sensibly apply together (renders as multi-select)
});

export type AdaptiveQuestion = z.infer<typeof AdaptiveQuestionSchema>;