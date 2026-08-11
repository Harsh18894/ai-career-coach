import { cachedCall } from './cache';
import { getReview, jobDescription, loadReviewResume } from '../adapter/review';
import type { PersonaClassification } from '../../lib/resume-review/persona-types';
import type { ReviewResult } from '../../lib/resume-review/schemas';

/* =====================================================================================
 * One definition of every review the eval suites need, so the suites and the warm script
 * cannot drift apart on cache keys — a mismatch there would silently make cheap mode read a
 * snapshot of something other than what full mode generates.
 *
 * The full outcome is stored, not just the result: R2 needs the source text (loaded from the
 * fixture) and R4 needs the inferred region, which lives on the classification.
 * ===================================================================================== */

export type StoredReview = {
  result: ReviewResult;
  classification: PersonaClassification;
};

export type ReviewRunSpec = {
  key: string;
  fixtureId: string;
  /** Job fixture id for the against-job path, or null for the independent path. */
  jobId: string | null;
  personaOverride?: 'student' | 'early_career' | 'mid_level' | 'senior';
};

/** Every review that gets a committed snapshot, i.e. everything R1-R6 read in cheap mode. */
export const SNAPSHOT_RUNS: ReviewRunSpec[] = [
  { key: 'review:student-nothing:independent', fixtureId: 'student-nothing', jobId: null },
  { key: 'review:student-both:independent', fixtureId: 'student-both', jobId: null },
  { key: 'review:mid-level-generic:independent', fixtureId: 'mid-level-generic', jobId: null },
  { key: 'review:senior-tidy-but-flat:independent', fixtureId: 'senior-tidy-but-flat', jobId: null },
  { key: 'review:senior-strong:independent', fixtureId: 'senior-strong', jobId: null },
  { key: 'review:resume-injection:independent', fixtureId: 'resume-injection', jobId: null },
  {
    key: 'review:mid-level-generic:against:poorly-matched',
    fixtureId: 'mid-level-generic',
    jobId: 'poorly-matched',
  },
];

/** Additional runs only full mode needs (R7-R13). Not snapshotted — they exist to exercise
 * live behaviour, and freezing them would defeat the point. */
export const LIVE_ONLY_RUNS: ReviewRunSpec[] = [
  { key: 'review:student-projects-only:independent', fixtureId: 'student-projects-only', jobId: null },
  { key: 'review:student-internships-only:independent', fixtureId: 'student-internships-only', jobId: null },
  { key: 'review:resume-injection:against:injection-in-jd', fixtureId: 'resume-injection', jobId: 'injection-in-jd' },
  // R10 runs the same resume twice under different keys, so the run cache cannot collapse them
  // into one call — measuring variance requires two genuinely separate generations.
  { key: 'review:stability:run-a', fixtureId: 'mid-level-generic', jobId: null },
  { key: 'review:stability:run-b', fixtureId: 'mid-level-generic', jobId: null },
];

export async function runReviewSpec(spec: ReviewRunSpec): Promise<StoredReview> {
  const review = await getReview();
  const resumeText = loadReviewResume(spec.fixtureId);

  const outcome = await review.runResumeReview({
    resumeText,
    path: spec.jobId ? 'against_job' : 'independent',
    personaOverride: spec.personaOverride,
    jobDescription: spec.jobId ? await jobDescription(spec.jobId) : null,
  });

  if (!outcome.ok) {
    throw new Error(
      `[review-runs] "${spec.fixtureId}" was refused as not-a-resume; it is not a valid fixture for this run.`
    );
  }

  return { result: outcome.result, classification: outcome.classification };
}

/** Cheap mode reads the committed snapshot; full mode generates once per invocation. */
export function getReviewRun(spec: ReviewRunSpec): Promise<StoredReview> {
  return cachedCall(spec.key, () => runReviewSpec(spec));
}

export function specFor(key: string): ReviewRunSpec {
  const found = [...SNAPSHOT_RUNS, ...LIVE_ONLY_RUNS].find((spec) => spec.key === key);
  if (!found) throw new Error(`[review-runs] unknown run key "${key}"`);
  return found;
}
