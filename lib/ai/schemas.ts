import { z } from 'zod';

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
  notableTransitions: z.array(z.string()),
  tensions: z.array(z.string()),
  inferredPersona: z.enum(['pivot', 'grow_in_place', 'early_career', 'unknown']),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const CareerPathSchema = z.object({
  title: z.string(),
  fitRationale: z.string(), // MUST cite a profile fact or a user statement
  salaryRange: z.string(),  // indicative, region-aware, labeled
  upskills: z.array(z.string()), // 2-4 concrete skills to acquire
  firstMove: z.string().nullish(),
});

export const PathDeckSchema = z.object({
  paths: z.array(CareerPathSchema).length(3),
});


export type CareerPath = z.infer<typeof CareerPathSchema>;

export const RoadmapPhaseSchema = z.object({
  type: z.enum(['course', 'project', 'application']),
  title: z.string(), // e.g. "Foundational + advanced courses", "Portfolio project", "Apply to target roles"
  timeline: z.string(), // realistic relative timeframe, e.g. "Weeks 1-6" or "Month 2-3"
  items: z.array(z.string()), // concrete, profile/domain-relevant action items for this phase
  description: z.string().nullish(), // why this phase matters for this candidate specifically
});

export const RoadmapSchema = z.object({
  skillLevel: z.enum(['beginner', 'basic', 'good', 'experienced']), // candidate's readiness for the CHOSEN PATH specifically, not their overall seniority
  summary: z.string(), // 1-2 sentences explaining the classification, citing a profile fact
  totalDuration: z.string(), // overall realistic timeframe, e.g. "3-5 months"
  phases: z.array(RoadmapPhaseSchema).min(1),
});

export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;
