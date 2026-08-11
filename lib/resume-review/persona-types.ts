import type { ReviewPersona } from './schemas';

/* =====================================================================================
 * The client-safe half of persona classification.
 *
 * Separated from ./persona.ts because that module reaches the OpenAI SDK, Redis and
 * node:async_hooks through its imports. A client component only needs the shape and the
 * confidence threshold, and importing them from ./persona.ts would pull the entire server
 * pipeline into the browser bundle — which is exactly how the first build of the review page
 * failed.
 * ===================================================================================== */

export type PersonaClassification = {
  persona: ReviewPersona;
  /** 0–1. See PERSONA_CONFIDENCE_THRESHOLD and needsPersonaConfirmation. */
  confidence: number;
  /** Plain-language reasons for the classification, meant to be shown verbatim next to the
   * detected persona in the UI — not an internal debug log. */
  signals: string[];
  careerSwitcher: boolean;
  inferredRegion: string | null;
};

/** Below this, the UI should treat the detected persona as a guess needing confirmation, not a
 * settled fact. Chosen, not measured — revisit once real classifications have been observed
 * across a wider set of resumes than the fixtures available at build time. */
export const PERSONA_CONFIDENCE_THRESHOLD = 0.55;

export function needsPersonaConfirmation(classification: PersonaClassification): boolean {
  return classification.confidence < PERSONA_CONFIDENCE_THRESHOLD;
}
