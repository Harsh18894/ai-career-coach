import { describe, it, expect } from 'vitest';
import { getCoach } from '../adapter/coach';
import { cachedCall } from '../lib/cache';
import { loadResume } from '../lib/fixtures';
import { groundingTokens, containsToken, GENERIC_OPENER_BLOCKLIST } from '../lib/tokens';
import { recordResult } from '../lib/report-collector';

/**
 * B1 — Opener entity grounding [programmatic]
 * For each persona fixture: extractProfile -> generateOpener.
 * PASS if the opener contains >=1 grounding token AND matches none of the generic blocklist.
 */

const FIXTURE_IDS = ['R-pivot-01', 'R-grow-01', 'R-grad-01'] as const;

describe('B1 — opener entity grounding', () => {
  it('every persona opener cites a real, specific detail and avoids generic phrasing', async () => {
    const coach = await getCoach();
    const perFixture: Record<string, { pass: boolean; reason: string; matchedTokens: string[] }> = {};

    for (const fixtureId of FIXTURE_IDS) {
      const resumeText = loadResume(fixtureId);

      // Keyed by function+fixture (not by eval id) so other evals that need the same
      // profile/opener for the same fixture reuse this generation instead of re-requesting it.
      const profile = await cachedCall(`extractProfile:${fixtureId}`, () => coach.extractProfile(resumeText));
      const opener = await cachedCall(`generateOpener:${fixtureId}`, () => coach.generateOpener(profile));

      const candidateTokens = groundingTokens(profile);
      const matchedTokens = candidateTokens.filter((t) => containsToken(opener, t));
      const hitsGenericBlocklist = GENERIC_OPENER_BLOCKLIST.some((re) => re.test(opener));

      const pass = matchedTokens.length >= 1 && !hitsGenericBlocklist;
      const reason = !pass
        ? hitsGenericBlocklist
          ? `Opener matched a generic-phrasing blocklist pattern. Opener: "${opener}"`
          : `Opener matched zero of ${candidateTokens.length} grounding tokens. Opener: "${opener}". Tokens tried: ${candidateTokens.join(', ')}`
        : `Matched tokens: ${matchedTokens.join(', ')}`;

      perFixture[fixtureId] = { pass, reason, matchedTokens };
    }

    const allPass = Object.values(perFixture).every((f) => f.pass);
    const failing = Object.entries(perFixture).filter(([, f]) => !f.pass);

    recordResult({
      id: 'B1',
      title: 'Opener entity grounding',
      type: 'programmatic',
      pass: allPass,
      reason: allPass
        ? 'All persona openers cite a real grounding detail and avoid generic phrasing.'
        : `Failing fixtures: ${failing.map(([id, f]) => `${id} (${f.reason})`).join('; ')}`,
      meta: { perFixture },
    });

    expect(allPass, JSON.stringify(perFixture, null, 2)).toBe(true);
  });
});
