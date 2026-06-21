import { describe, it, expect } from 'vitest';
import { getCoach, type CareerPath } from '../adapter/coach';
import { cachedCall } from '../lib/cache';
import { loadResume } from '../lib/fixtures';
import { judge } from '../lib/judge';
import { countDivergentTitles } from '../lib/similarity';
import { E1_SIGNALS_A, E1_SIGNALS_B } from '../lib/signals';
import { recordResult } from '../lib/report-collector';
import { config, isCheap } from '../config';

/**
 * E1 — Counterfactual divergence [programmatic + judged]
 * Same profile (R-grow-01), two contrasting signal sets -> two decks. The decks must differ
 * in >=2 of 3 titles (programmatic, fuzzy-matched), and a judge must confirm the differences
 * plausibly track the differing signals rather than looking random.
 */

const FIXTURE_ID = 'R-grow-01';
const SIGNALS_A = E1_SIGNALS_A;
const SIGNALS_B = E1_SIGNALS_B;

const RUBRIC = `Input: SIGNALS_A, DECK_A, SIGNALS_B, DECK_B. Return ONLY JSON {"tracks_signals":boolean,"pass":boolean,"reason":string}. pass = true only if the differences between the two decks plausibly follow from the differences between the two signal sets, rather than appearing random.`;

interface E1Verdict {
  tracks_signals: boolean;
  pass: boolean;
  reason: string;
}

describe('E1 — counterfactual divergence', () => {
  it.skipIf(isCheap())(
    'contrasting signal sets produce meaningfully different decks that track the signals',
    async () => {
      const coach = await getCoach();
      const resumeText = loadResume(FIXTURE_ID);

      const profile = await cachedCall(`extractProfile:${FIXTURE_ID}`, () => coach.extractProfile(resumeText));
      const deckA = await cachedCall(`generatePaths:${FIXTURE_ID}:e1-A`, () => coach.generatePaths(profile, SIGNALS_A, []));
      const deckB = await cachedCall(`generatePaths:${FIXTURE_ID}:e1-B`, () => coach.generatePaths(profile, SIGNALS_B, []));

      const titlesA = deckA.map((p) => p.title);
      const titlesB = deckB.map((p) => p.title);
      const divergentCount = countDivergentTitles(titlesA, titlesB, config.thresholds.titleSimilaritySame);
      const programmaticPass = divergentCount >= 2;

      const { result, votes, disagreement } = await judge<E1Verdict>(RUBRIC, {
        signals_a: SIGNALS_A,
        deck_a: deckA,
        signals_b: SIGNALS_B,
        deck_b: deckB,
      });

      const pass = programmaticPass && result.pass;
      const reason = !pass
        ? [
            !programmaticPass ? `Programmatic: only ${divergentCount}/3 titles diverged (need >=2). A=${titlesA.join(' | ')} B=${titlesB.join(' | ')}` : null,
            !result.pass ? `Judged: ${result.reason}` : null,
          ]
            .filter(Boolean)
            .join(' | ')
        : `${divergentCount}/3 titles diverged and the judge confirmed differences track the signals.`;

      recordResult({
        id: 'E1',
        title: 'Counterfactual divergence',
        type: 'mixed',
        pass,
        reason,
        votes,
        disagreement,
        meta: { divergentCount, titlesA, titlesB, judged: result },
      });

      expect(pass, reason).toBe(true);
    },
    240_000
  );

  it.skipIf(!isCheap())(
    'programmatic divergence check only (frozen snapshot decks)',
    async () => {
      const deckA = await cachedCall<CareerPath[]>(`generatePaths:${FIXTURE_ID}:e1-A`, async () => {
        throw new Error('unreachable in cheap mode — snapshot should exist');
      });
      const deckB = await cachedCall<CareerPath[]>(`generatePaths:${FIXTURE_ID}:e1-B`, async () => {
        throw new Error('unreachable in cheap mode — snapshot should exist');
      });

      const titlesA = deckA.map((p) => p.title);
      const titlesB = deckB.map((p) => p.title);
      const divergentCount = countDivergentTitles(titlesA, titlesB, config.thresholds.titleSimilaritySame);
      const programmaticPass = divergentCount >= 2;

      recordResult({
        id: 'E1',
        title: 'Counterfactual divergence',
        type: 'mixed',
        pass: programmaticPass ? 'skipped' : false,
        reason: programmaticPass
          ? `Programmatic divergence check passed (${divergentCount}/3) against frozen snapshots; judged portion skipped under eval:cheap.`
          : `Programmatic divergence check failed against frozen snapshots: only ${divergentCount}/3 titles diverged.`,
        meta: { divergentCount, titlesA, titlesB },
      });

      expect(programmaticPass, `only ${divergentCount}/3 titles diverged`).toBe(true);
    }
  );
});
