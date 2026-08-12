import { getOpenAIClient } from '../ai/client';
import { structuredCompletion, TIMEOUTS } from '../ai/resilience';
import { updateTelemetryContext } from '../telemetry';
import { segmentResume } from './segment';
import { classifyPersona, type PersonaClassification } from './persona';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { postValidateReview, type DroppedItem } from './post-validate';
import {
  ReviewModelOutputSchema,
  type JobDescription,
  type ResumeSegment,
  type ReviewPath,
  type ReviewPersona,
  type ReviewResult,
} from './schemas';

/* =====================================================================================
 * The review pipeline, end to end.
 *
 *   1. segmentResume        gpt-5-nano   structured extraction, no judgement
 *   2. classifyPersona      gpt-5-nano   arithmetic in code + one judgement call
 *   3. review               gpt-5-mini   the review itself
 *   4. postValidateReview   code         the no-fabrication rule and persona gating
 *
 * Stage 3 is NOT streamed, deliberately. Post-validation runs on the complete object and
 * drops fabricated findings before anything is shown; streaming findings to the UI as they
 * arrive would put unvalidated — possibly fabricated — rewrites in front of the candidate,
 * which is precisely what docs/resume-review-rubric.md §8 forbids. The rubric's load-bearing
 * rule wins over the nicer loading experience.
 *
 * The pipeline is exposed in two halves so it can span two HTTP requests:
 *
 *   prepareReview()  stages 1-2   ~18s   also gives the UI the persona to confirm or override
 *   reviewPrepared() stages 3-4   ~40-50s
 *
 * Run back to back in one request they total 60-68s against a 60s serverless ceiling, so the
 * split is what keeps the heavy call inside its budget. runResumeReview() still composes both
 * for scripts and evals, where no such ceiling applies.
 * ===================================================================================== */

/** Arbitrary but fixed. The value does not matter; holding it constant does. */
const REVIEW_SEED = 20260811;

export type ReviewRequest = {
  resumeText: string;
  path: ReviewPath;
  /** Set when the caller has already classified (e.g. the user overrode the persona in the
   * UI). Skips stage 2 entirely and reviews at the given bar. */
  personaOverride?: ReviewPersona;
  jobDescription?: JobDescription | null;
};

export type ReviewOutcome =
  | { ok: true; result: ReviewResult; classification: PersonaClassification; segment: ResumeSegment; dropped: DroppedItem[] }
  | { ok: false; reason: 'not_a_resume' };

/** Stages 1-2. Cheap enough to run in its own request, and its output is what the UI needs to
 * show the detected persona before committing to a review. */
export async function prepareReview(
  resumeText: string
): Promise<{ ok: true; segment: ResumeSegment; classification: PersonaClassification } | { ok: false; reason: 'not_a_resume' }> {
  const segment = await segmentResume(resumeText);
  if (!segment) return { ok: false, reason: 'not_a_resume' };
  const classification = await classifyPersona(segment);
  return { ok: true, segment, classification };
}

export type PreparedReviewInput = {
  rawResumeText: string;
  segment: ResumeSegment;
  classification: PersonaClassification;
  path: ReviewPath;
  personaOverride?: ReviewPersona;
  jobDescription?: JobDescription | null;
};

/** Stages 3-4, against an already-segmented resume. */
export async function reviewPrepared(
  input: PreparedReviewInput
): Promise<Extract<ReviewOutcome, { ok: true }>> {
  const { rawResumeText, segment, classification, path, personaOverride, jobDescription } = input;
  const resumeText = rawResumeText;

  // An explicit override is the user telling us we got it wrong. Trust it completely for the
  // bar, but keep the derived signals and region — those are observations about the document,
  // not the classification decision itself.
  const persona = personaOverride ?? classification.persona;
  const effective: PersonaClassification =
    personaOverride && personaOverride !== classification.persona
      ? {
          ...classification,
          persona: personaOverride,
          confidence: 1,
          signals: [...classification.signals, `Persona set to "${personaOverride}" by the candidate, overriding the detected value.`],
        }
      : classification;

  // Persona is only known now, but stage 3's llm_call record must carry it so cost per review
  // can be split by persona and path.
  updateTelemetryContext({ persona, reviewPath: path });

  const promptInput = {
    segment,
    persona,
    careerSwitcher: effective.careerSwitcher,
    path,
    region: effective.inferredRegion,
    jobDescription: jobDescription ?? null,
  };

  const openai = getOpenAIClient();
  const output = await structuredCompletion(
    openai,
    {
      model: 'gpt-5-mini',
      // The rubric in the system prompt already carries the reasoning this task needs — which
      // dimensions apply, how severity escalates, what counts as fabrication. At default
      // effort this call timed out twice at 60s without returning a token. The structure is
      // supplied; the model's job is to apply it, not to rediscover it.
      reasoning_effort: 'low',
      // A fixed seed is a product decision before it is an eval one: a candidate who re-runs a
      // review on an unchanged resume should not be told something different the second time,
      // and "the tool contradicted itself" destroys trust faster than any single weak finding.
      // Best-effort on OpenAI's side rather than a guarantee — measured stability is reported
      // by the R10 eval rather than assumed here.
      seed: REVIEW_SEED,
      messages: [
        { role: 'system', content: buildSystemPrompt(promptInput) },
        { role: 'user', content: buildUserPrompt(promptInput) },
      ],
    },
    { call: `resumeReview:${path}`, schema: ReviewModelOutputSchema, timeoutMs: TIMEOUTS.roadmap }
  );

  const { result, dropped } = postValidateReview({
    output,
    segment,
    rawResumeText: resumeText,
    persona,
    careerSwitcher: effective.careerSwitcher,
    path,
    region: effective.inferredRegion,
    jobDescription: jobDescription ?? null,
  });

  return { ok: true, result, classification: effective, segment, dropped };
}

/** Both halves in one call. Used by scripts and evals, which have no request timeout to fit
 * inside; the API routes use the two halves separately. */
export async function runResumeReview(request: ReviewRequest): Promise<ReviewOutcome> {
  const prepared = await prepareReview(request.resumeText);
  if (!prepared.ok) return prepared;

  return reviewPrepared({
    rawResumeText: request.resumeText,
    segment: prepared.segment,
    classification: prepared.classification,
    path: request.path,
    personaOverride: request.personaOverride,
    jobDescription: request.jobDescription,
  });
}

export { segmentResume } from './segment';
export { classifyPersona, needsPersonaConfirmation } from './persona';
export * from './schemas';
