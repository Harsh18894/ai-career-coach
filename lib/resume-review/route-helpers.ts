import { z } from 'zod';
import { LIMITS } from '../limits';
import { REVIEW_PERSONAS, JobDescriptionSchema } from './schemas';
import type { ReviewOutcome } from './index';

/* =====================================================================================
 * Request parsing and response shaping shared by the two review routes.
 * ===================================================================================== */

/** Matches the 150-character floor the existing intake enforces in
 * app/api/parse-resume/route.ts, so a resume that is too thin to review fails the same way in
 * both places rather than producing a confidently empty review. */
export const MIN_RESUME_CHARS = 150;

/**
 * A review request identifies the resume EITHER by a preparedId from /api/resume-review/prepare
 * (the normal path — the segment is already server-side) OR by resumeText, which is the
 * fallback when no cache is configured. At least one must be present; the route checks that,
 * since Zod cannot express "either-or" as cleanly as a readable error message can.
 */
export const ReviewRequestBodySchema = z.object({
  // A prepared id is a UUID this server minted. Bounding it stops a caller using the field as
  // a way to put an arbitrary string into a Redis key lookup.
  preparedId: z.string().max(64).nullish(),
  resumeText: z.string().min(MIN_RESUME_CHARS).max(LIMITS.maxResumeChars).nullish(),
  personaOverride: z.enum(REVIEW_PERSONAS).nullish(),
});

/** The job description is the other half of the untrusted input this surface takes, so it is
 * bounded on the same principle as the resume: long enough for any real posting, short enough
 * that it cannot be used to buy a large model call cheaply. */
export const BoundedJobDescriptionSchema = JobDescriptionSchema.extend({
  descriptionText: z.string().max(LIMITS.maxJobDescriptionChars),
  title: z.string().max(LIMITS.maxArrayItemChars).nullish(),
  company: z.string().max(LIMITS.maxArrayItemChars).nullish(),
  location: z.string().max(LIMITS.maxArrayItemChars).nullish(),
  sourceUrl: z.string().max(2_048).nullish(),
});

export const AgainstJobRequestBodySchema = ReviewRequestBodySchema.extend({
  jobDescription: BoundedJobDescriptionSchema,
});

/** Just enough of the segment for the UI to group findings under the role they belong to.
 * The full segment stays server-side: it is a re-derivable intermediate several times the size
 * of the review, and shipping the candidate's entire parsed resume back for a grouping label
 * would be a poor trade. */
export type FindingGroupIndex = {
  id: string;
  label: string;
  bulletIds: string[];
}[];

function buildGroupIndex(outcome: Extract<ReviewOutcome, { ok: true }>): FindingGroupIndex {
  const { segment } = outcome;
  return [
    ...segment.roles.map((role) => ({
      id: role.id,
      label: [role.title, role.company].filter(Boolean).join(' · '),
      bulletIds: role.bullets.map((bullet) => bullet.id),
    })),
    ...segment.projects.map((project) => ({
      id: project.id,
      label: `Project: ${project.title}`,
      bulletIds: project.bullets.map((bullet) => bullet.id),
    })),
  ];
}

/**
 * What the client receives.
 *
 * `dropped` IS returned, in count form only. The UI does not show it, but it makes
 * post-validation observable in the network tab during development, which is how a silently
 * over-eager drop rule gets noticed.
 */
export function serializeOutcome(outcome: Extract<ReviewOutcome, { ok: true }>) {
  return {
    result: outcome.result,
    classification: outcome.classification,
    groups: buildGroupIndex(outcome),
    droppedCount: outcome.dropped.length,
  };
}
