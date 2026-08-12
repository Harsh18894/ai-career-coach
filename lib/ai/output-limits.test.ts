import { describe, expect, it, vi, afterEach } from 'vitest';
import { OUTPUT_LIMITS_TABLE, maxCompletionTokensFor } from './output-limits';

/* =====================================================================================
 * The caps are a blast radius. The way they go wrong is not by being slightly off — it is by
 * being derived from the wrong number, so they bind in normal operation and truncate real
 * responses. These pin the properties that stop that.
 * ===================================================================================== */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('maxCompletionTokensFor', () => {
  it('returns the measured cap for a known call site', () => {
    expect(maxCompletionTokensFor('generateRoadmap')).toBe(OUTPUT_LIMITS_TABLE.generateRoadmap);
  });

  it('resolves a :repair suffix to its base call', () => {
    // A repair re-sends the original request plus the failed output — same ceiling question.
    expect(maxCompletionTokensFor('generatePaths:repair')).toBe(OUTPUT_LIMITS_TABLE.generatePaths);
    expect(maxCompletionTokensFor('extractProfile:repair')).toBe(OUTPUT_LIMITS_TABLE.extractProfile);
  });

  it('returns undefined for an unknown call rather than guessing a default', () => {
    // A guessed cap is how a silent truncation ships: the request would just produce short
    // output for reasons no log explains. Uncapped is bounded by the session ceilings and the
    // daily budget instead, so the failure mode is cost, not corruption.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(maxCompletionTokensFor('someBrandNewCall')).toBeUndefined();
  });

  it('warns once, not per request, when a call site has no measured cap', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    maxCompletionTokensFor('anotherUnmeasuredCall');
    maxCompletionTokensFor('anotherUnmeasuredCall');
    maxCompletionTokensFor('anotherUnmeasuredCall');

    const matching = warn.mock.calls.filter((args) =>
      String(args[0]).includes('anotherUnmeasuredCall')
    );
    expect(matching).toHaveLength(1);
  });
});

describe('the table itself', () => {
  it('sizes every cap above the largest completion actually observed', () => {
    // Sourced from the post-B3 six-session run and a full eval run. If a cap ever drops below
    // one of these, it will truncate a response that has already happened at least once.
    const observedMaxCompletionTokens: Record<string, number> = {
      analyzeSignals: 790,
      detectCareerSwitch: 454,
      extractProfile: 1434,
      generateOpeningMessage: 503,
      generatePaths: 3844,
      // The one that mattered: a 5,288-token roadmap really happened. A cap derived from
      // post-B3-step-3 data alone would have been 4,224 and truncated it.
      generateRoadmap: 5288,
      generateUnderstandingTurn: 494,
      nextGuidedProfileQuestion: 270,
      segmentResume: 2681,
      streamChatTurn: 285,
      'resumeReview:independent': 3983,
      'resumeReview:against_job': 3937,
    };

    for (const [call, observed] of Object.entries(observedMaxCompletionTokens)) {
      const cap = OUTPUT_LIMITS_TABLE[call];
      expect(cap, `${call} has no cap`).toBeDefined();
      expect(cap, `${call} cap ${cap} is below the observed max ${observed}`).toBeGreaterThan(observed);
    }
  });

  it('leaves at least 20% headroom over the observed maximum everywhere', () => {
    // P95 + 25%, and at these sample sizes P95 and max coincide for several sites — so the
    // effective headroom over "the biggest response we have ever seen" is what matters.
    const observed: Record<string, number> = {
      generatePaths: 3844,
      generateRoadmap: 5288,
      extractProfile: 1434,
      segmentResume: 2681,
      'resumeReview:independent': 3983,
      'resumeReview:against_job': 3937,
    };
    for (const [call, value] of Object.entries(observed)) {
      // 1.3, not 1.2: the first pass at these caps ran segmentResume to 95% of its ceiling on
      // the next run. P95 is not a reliable tail estimate at n < 100.
      expect(OUTPUT_LIMITS_TABLE[call] / value, call).toBeGreaterThan(1.3);
    }
  });

  it('caps the reasoning-heavy calls well above their visible output', () => {
    // The mistake this guards against: sizing max_completion_tokens off visible outputTokens.
    // generateRoadmap emits ~1,889 visible tokens but consumes ~3,288 completion tokens getting
    // there, so a cap near the visible figure would cut off half of every roadmap.
    expect(OUTPUT_LIMITS_TABLE.generateRoadmap).toBeGreaterThan(1889 * 2);
    expect(OUTPUT_LIMITS_TABLE.generatePaths).toBeGreaterThan(1028 * 2);
  });
});
