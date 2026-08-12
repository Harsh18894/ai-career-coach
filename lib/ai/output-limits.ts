/**
 * Per-call-site output ceilings.
 *
 * ================================ THE IMPORTANT PART ================================
 * `max_completion_tokens` on the gpt-5 family bounds REASONING + VISIBLE OUTPUT, not just the
 * text. So these numbers are derived from measured `completionTokens`, NOT from the visible
 * `outputTokens` in the same telemetry.
 *
 * Sizing them off visible output would have been the natural reading of "P95 output tokens",
 * and it would have truncated nearly every call: generateRoadmap emits ~1,889 visible tokens at
 * P95 but consumes ~3,288 completion tokens getting there. A cap of 2,361 would have cut off
 * roughly half of every roadmap — and a truncated roadmap fails schema validation, burns a
 * repair attempt, and then fails again.
 * ====================================================================================
 *
 * Each cap is `max(P95 x 1.25, observed max x 1.35)`, rounded up to a multiple of 128.
 *
 * The second term is not decoration. A first pass sized purely on P95 + 25% put segmentResume
 * at 95% of its ceiling and two review calls above 80% on the very next run — no truncation,
 * but one longer resume away from one. At these sample sizes (n = 9 to 100) P95 is not a
 * reliable tail estimate, so the cap is also held above the largest response ever actually
 * seen, with margin.
 *
 * WHICH RUNS EACH NUMBER IS DRAWN FROM MATTERS, because reasoning effort moved during B3 and
 * completion tokens moved with it. Every call site is measured only from runs in which its
 * CURRENT effort setting was in force:
 *   - extraction/classification: from B3 step 1 onward
 *   - conversational turns:      from B3 step 2 onward
 *   - generatePaths / generateRoadmap / review: every run, since their effort never changed
 *     (B3 step 3 set `medium` explicitly and measured no difference — `medium` is the default)
 *
 * That last window is what caught the real risk here. generateRoadmap produced a 5,288-token
 * completion during B3 step 1's run. Sizing from post-step-3 data alone would have missed it
 * and set a cap of 4,224 — which would have truncated a roadmap that has genuinely occurred.
 *
 * These are a blast radius, not a target. They exist so a model that starts looping cannot bill
 * for it, and so a prompt regression that makes a call generate forever fails fast and loudly
 * instead of quietly costing money. They are not expected to bind in normal operation — if one
 * starts binding, that is a signal about the prompt, and the answer is to investigate, not to
 * raise the number reflexively.
 */

/**
 * Keyed by the `call` label used in telemetry. A `:repair` suffix resolves to its base call —
 * a repair re-sends the original request plus the failed output, so its ceiling is the same
 * question as the original's.
 */
const OUTPUT_LIMITS: Record<string, number> = {
  // --- Coaching: extraction and classification (gpt-5-nano) ---
  extractProfile: 2048,
  analyzeSignals: 1152,
  detectCareerSwitch: 640,

  // --- Coaching: conversational turns (gpt-5-mini) ---
  streamChatTurn: 512,
  generateOpeningMessage: 768,
  generateUnderstandingTurn: 768,
  nextGuidedProfileQuestion: 384,
  // No measurement of its own: the guided-intake path is not exercised by the eval suite or by
  // the session harness. It produces the same ProfileSchema object as extractProfile from a
  // shorter input, so it inherits that cap. Inferred, not measured — flagged here rather than
  // presented as data.
  buildProfileFromAnswers: 2048,

  // --- Coaching: the two generative call sites the product is judged on (gpt-5-mini) ---
  generatePaths: 5248,
  generateRoadmap: 7168,

  // --- Resume review ---
  segmentResume: 3712,
  'resumeReview:independent': 5504,
  'resumeReview:against_job': 5376,
};

/**
 * The cap for a call site, or undefined when there is no measurement behind one.
 *
 * Deliberately returns undefined rather than a default number for an unrecognised call. A
 * guessed cap is exactly how a silent truncation gets shipped, and the guess would be invisible
 * — the request would simply produce short output for reasons no log explains. An uncapped call
 * is still bounded by the per-session ceilings and the daily budget from Pass A, so the failure
 * mode of having no entry is cost, which is already handled, rather than corruption, which is
 * not.
 *
 * The warning fires once per call site per process so a new one is noticed and measured.
 */
const warned = new Set<string>();

export function maxCompletionTokensFor(call: string): number | undefined {
  const base = call.endsWith(':repair') ? call.slice(0, -':repair'.length) : call;
  const limit = OUTPUT_LIMITS[base];

  if (limit === undefined && !warned.has(base)) {
    warned.add(base);
    console.warn(
      JSON.stringify({
        event: 'output_limit_missing',
        timestamp: new Date().toISOString(),
        call: base,
        detail:
          'No measured output ceiling for this call site; it will run uncapped. Add one to lib/ai/output-limits.ts once its completionTokens P95 is known.',
      })
    );
  }

  return limit;
}

/** Exposed for the unit tests, which assert the table stays internally sensible. */
export const OUTPUT_LIMITS_TABLE: Readonly<Record<string, number>> = OUTPUT_LIMITS;
