import { describe, it, expect } from 'vitest';
import { getCoach } from '../adapter/coach';
import { cachedCall } from '../lib/cache';
import { loadResume } from '../lib/fixtures';
import { judge } from '../lib/judge';
import { recordResult } from '../lib/report-collector';
import { isCheap } from '../config';

/**
 * B3 — Opener cross-resume discriminability [judged]
 * Entirely judge-dependent (no programmatic pre-check), so it makes zero sense to "exercise
 * programmatically" — it is fully skipped under eval:cheap rather than faked.
 */

const RUBRIC = `You grade a career coach's first message, written after reading a resume. Input: RESUME and MESSAGE. Return ONLY JSON {"specificity":0-2,"tension":0-2,"transferability":0-2,"pass":boolean,"reason":string}. specificity: 2 if it names a concrete real detail only this resume contains, 0 if generic. tension: 2 if it surfaces a real tension/opportunity, 0 if it only summarizes. transferability: 2 if it could NOT plausibly be sent to a different person, 0 if it could be sent to anyone. pass = true only if every dimension >=1 AND transferability == 2. Reward proof of understanding, not fluent writing.`;

interface B3Verdict {
  specificity: number;
  tension: number;
  transferability: number;
  pass: boolean;
  reason: string;
}

describe('B3 — opener cross-resume discriminability', () => {
  it.skipIf(isCheap())(
    'the opener for R-pivot-01 could not plausibly be sent to a different candidate',
    async () => {
      const coach = await getCoach();
      const fixtureId = 'R-pivot-01';
      const resumeText = loadResume(fixtureId);

      const profile = await cachedCall(`extractProfile:${fixtureId}`, () => coach.extractProfile(resumeText));
      const opener = await cachedCall(`generateOpener:${fixtureId}`, () => coach.generateOpener(profile));

      const { result, votes, disagreement } = await judge<B3Verdict>(RUBRIC, {
        resume: resumeText,
        message: opener,
      });

      const pass = result.pass && result.transferability === 2;

      recordResult({
        id: 'B3',
        title: 'Opener cross-resume discriminability',
        type: 'judged',
        pass,
        reason: result.reason,
        votes,
        disagreement,
        meta: { opener, scores: result },
      });

      expect(pass, `${result.reason} | scores: ${JSON.stringify(result)}`).toBe(true);
    },
    240_000
  );

  it.skipIf(!isCheap())('skipped in cheap mode (fully judge-dependent, no programmatic component)', () => {
    recordResult({
      id: 'B3',
      title: 'Opener cross-resume discriminability',
      type: 'judged',
      pass: 'skipped',
      reason: 'Skipped under eval:cheap — this eval has no programmatic component to exercise without a judge call.',
    });
    expect(true).toBe(true);
  });
});
