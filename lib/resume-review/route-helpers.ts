import { z } from 'zod';
import { REVIEW_PERSONAS, JobDescriptionSchema } from './schemas';
import type { ReviewOutcome } from './index';

/* =====================================================================================
 * Request parsing and response shaping shared by the two review routes.
 * ===================================================================================== */

/** Matches the 150-character floor the existing intake enforces in
 * app/api/parse-resume/route.ts, so a resume that is too thin to review fails the same way in
 * both places rather than producing a confidently empty review. */
export const MIN_RESUME_CHARS = 150;

export const ReviewRequestBodySchema = z.object({
  resumeText: z.string().min(MIN_RESUME_CHARS),
  personaOverride: z.enum(REVIEW_PERSONAS).nullish(),
});

export const AgainstJobRequestBodySchema = ReviewRequestBodySchema.extend({
  jobDescription: JobDescriptionSchema,
});

/**
 * What the client receives. The full segment is deliberately NOT returned: it is a
 * re-derivable intermediate several times the size of the review, and shipping it would put
 * the candidate's entire parsed resume back over the wire for no use the UI has.
 *
 * `dropped` IS returned, in count form only. The UI does not show it, but it makes
 * post-validation observable in the network tab during development, which is how a silently
 * over-eager drop rule gets noticed.
 */
export function serializeOutcome(outcome: Extract<ReviewOutcome, { ok: true }>) {
  return {
    result: outcome.result,
    classification: outcome.classification,
    droppedCount: outcome.dropped.length,
  };
}
