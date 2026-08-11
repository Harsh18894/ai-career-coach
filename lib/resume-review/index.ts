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
 * ===================================================================================== */

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

export async function runResumeReview(request: ReviewRequest): Promise<ReviewOutcome> {
  const { resumeText, path, personaOverride, jobDescription } = request;

  const segment = await segmentResume(resumeText);
  if (!segment) return { ok: false, reason: 'not_a_resume' };

  const classification = await classifyPersona(segment);

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
      messages: [
        { role: 'system', content: buildSystemPrompt(promptInput) },
        { role: 'user', content: buildUserPrompt(promptInput) },
      ],
      response_format: { type: 'json_object' },
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

export { segmentResume } from './segment';
export { classifyPersona, needsPersonaConfirmation } from './persona';
export * from './schemas';
