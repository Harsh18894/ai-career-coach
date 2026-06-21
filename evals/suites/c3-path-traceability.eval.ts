import { describe, it, expect } from 'vitest';
import { getCoach, type CareerPath } from '../adapter/coach';
import { cachedCall } from '../lib/cache';
import { loadResume } from '../lib/fixtures';
import { judge } from '../lib/judge';
import { C3_SIGNALS } from '../lib/signals';
import { recordResult, assertCheapPreCheckResult } from '../lib/report-collector';
import { isCheap } from '../config';

/**
 * C3 — Path traceability [judged, with a programmatic pre-check]
 * extractProfile -> generatePaths for R-grow-01 with a representative signal set, then:
 *  - Programmatic: exactly 3 paths, each with non-empty title/fitRationale/salaryRange and
 *    2-4 upskills.
 *  - Judged: each path must be traceable to a profile fact or stated signal, respect stated
 *    constraints, and have concrete (non-vague) upskills.
 */

const FIXTURE_ID = 'R-grow-01';
const SIGNALS = C3_SIGNALS;

const RUBRIC = `Input: PROFILE, SIGNALS (motivations, constraints, rejections), and 3 PATHS. Return ONLY JSON {"paths":[{"traceable":boolean,"source":string,"constraint_safe":boolean,"upskills_concrete":boolean}],"pass":boolean,"reason":string}. traceable: true only if the rationale cites a specific profile fact or stated signal — quote it in source; generic market claims do not count. constraint_safe: false if a path violates any stated constraint (e.g. requires switching companies when the user wants to grow in place). upskills_concrete: false if any upskill is vague like "learn leadership". pass = true only if all 3 paths are traceable AND constraint_safe AND upskills_concrete.`;

interface C3Verdict {
  paths: { traceable: boolean; source: string; constraint_safe: boolean; upskills_concrete: boolean }[];
  pass: boolean;
  reason: string;
}

const AMBITION_VERDICTS = ['aligned', 'too_high', 'too_low'];

function programmaticPreCheck(paths: CareerPath[]) {
  const problems: string[] = [];
  if (paths.length !== 3) problems.push(`Expected exactly 3 paths, got ${paths.length}`);
  paths.forEach((p, i) => {
    if (!p.title?.trim()) problems.push(`Path ${i}: empty title`);
    if (!p.fitRationale?.trim()) problems.push(`Path ${i}: empty fitRationale`);
    if (!p.salaryRange?.trim()) problems.push(`Path ${i}: empty salaryRange`);
    if (!p.upskills || p.upskills.length < 2 || p.upskills.length > 4) {
      problems.push(`Path ${i}: expected 2-4 upskills, got ${p.upskills?.length ?? 0}`);
    }
    if (!p.ambitionCheck || !AMBITION_VERDICTS.includes(p.ambitionCheck.verdict) || !p.ambitionCheck.note?.trim()) {
      problems.push(`Path ${i}: missing or invalid ambitionCheck`);
    }
  });
  return { pass: problems.length === 0, problems };
}

describe('C3 — path traceability', () => {
  it.skipIf(isCheap())(
    'every recommended path is traceable to a profile fact/signal, constraint-safe, and has concrete upskills',
    async () => {
      const coach = await getCoach();
      const resumeText = loadResume(FIXTURE_ID);

      const profile = await cachedCall(`extractProfile:${FIXTURE_ID}`, () => coach.extractProfile(resumeText));
      const paths = await cachedCall(`generatePaths:${FIXTURE_ID}:c3`, () => coach.generatePaths(profile, SIGNALS, []));

      const preCheck = programmaticPreCheck(paths);

      const { result, votes, disagreement } = await judge<C3Verdict>(RUBRIC, {
        profile,
        signals: SIGNALS,
        paths,
      });

      const judgedPass =
        result.pass &&
        result.paths.length === paths.length &&
        result.paths.every((p) => p.traceable && p.constraint_safe && p.upskills_concrete);

      const pass = preCheck.pass && judgedPass;
      const reason = !pass
        ? [
            !preCheck.pass ? `Programmatic: ${preCheck.problems.join('; ')}` : null,
            !judgedPass ? `Judged: ${result.reason}` : null,
          ]
            .filter(Boolean)
            .join(' | ')
        : 'All 3 paths passed programmatic shape checks and were judged traceable, constraint-safe, and concrete.';

      recordResult({
        id: 'C3',
        title: 'Path traceability',
        type: 'mixed',
        pass,
        reason,
        votes,
        disagreement,
        meta: { preCheck, judged: result, paths },
      });

      expect(pass, reason).toBe(true);
    },
    240_000
  );

  it.skipIf(!isCheap())(
    'programmatic pre-check only (shape of a frozen snapshot deck)',
    async () => {
      const paths = await cachedCall<CareerPath[]>(`generatePaths:${FIXTURE_ID}:c3`, async () => {
        throw new Error('unreachable in cheap mode — snapshot should exist');
      });
      const preCheck = programmaticPreCheck(paths);

      assertCheapPreCheckResult({
        id: 'C3',
        title: 'Path traceability',
        pass: preCheck.pass,
        details: preCheck.problems,
        passMessage: 'Programmatic shape check passed against frozen snapshot; judged portion skipped under eval:cheap.',
        failMessagePrefix: 'Programmatic shape check failed against frozen snapshot',
        meta: { preCheck },
      });
    }
  );
});
