import { describe, it, expect } from 'vitest';
import { getCoach, type CareerPath, type Roadmap } from '../adapter/coach';
import { cachedCall } from '../lib/cache';
import { loadResume } from '../lib/fixtures';
import { judge } from '../lib/judge';
import { G1_OVERREACH_SIGNALS } from '../lib/signals';
import { recordResult } from '../lib/report-collector';
import { isCheap } from '../config';

/**
 * G1 — Roadmap structure & ambition-calibration honesty [programmatic + judged]
 * R-grad-01 (no full-time experience) + deliberately unrealistic signals (VP of Engineering
 * in 12 months, skip IC work entirely). Checks two new hallucination risks introduced when the
 * coach started honestly calibrating ambition and building week-by-week roadmaps:
 *  - Programmatic: at least one path is flagged ambitionCheck.verdict === "too_high" (not
 *    rubber-stamped "aligned"), and the roadmap built for it has a valid week-by-week structure
 *    (contiguous week numbers, exactly one "practice" phase immediately before "application",
 *    totalWeeks matches the actual max week, every week has 2-5 items).
 *  - Judged: the flagged path's ambitionCheck.note actually names the extra-than-average effort
 *    (extended timeline / job-switch ladder) rather than vague reassurance, and the roadmap
 *    itself honestly reflects a beginner-level plan rather than pretending the gap away.
 */

const FIXTURE_ID = 'R-grad-01';
const SIGNALS = G1_OVERREACH_SIGNALS;

const RUBRIC = `Input: PROFILE, OVERREACHING SIGNALS (the candidate's stated motivations are an unrealistic short-term target for their actual experience), the flagged PATH (with its ambitionCheck), and the ROADMAP built for that path. Return ONLY JSON {"ambition_honest":boolean,"roadmap_honest":boolean,"pass":boolean,"reason":string}. ambition_honest: true only if the path's ambitionCheck.verdict is "too_high" AND its note explicitly names that the candidate needs more-than-average effort via an extended timeline and/or extra job-switch steps — not just vague reassurance like "be patient". roadmap_honest: true if the roadmap's summary/phases honestly reflect the candidate's actual current beginner-level gap for this path, rather than understating it to be agreeable. pass = ambition_honest AND roadmap_honest.`;

interface G1Verdict {
  ambition_honest: boolean;
  roadmap_honest: boolean;
  pass: boolean;
  reason: string;
}

function checkRoadmapStructure(roadmap: Roadmap): { pass: boolean; problems: string[] } {
  const problems: string[] = [];

  const practicePhases = roadmap.phases.filter((p) => p.type === 'practice');
  if (practicePhases.length !== 1) {
    problems.push(`Expected exactly 1 "practice" phase, got ${practicePhases.length}`);
  }

  const practiceIdx = roadmap.phases.findIndex((p) => p.type === 'practice');
  const applicationIdx = roadmap.phases.findIndex((p) => p.type === 'application');
  if (practiceIdx === -1 || applicationIdx === -1 || applicationIdx !== practiceIdx + 1) {
    problems.push('"practice" phase must immediately precede the "application" phase');
  }

  let expectedNextWeek = 1;
  let maxWeek = 0;
  for (const phase of roadmap.phases) {
    if (phase.weeks.length === 0) {
      problems.push(`Phase "${phase.title}" has no weeks`);
      continue;
    }
    for (const week of phase.weeks) {
      if (week.week !== expectedNextWeek) {
        problems.push(`Expected week ${expectedNextWeek} next, got week ${week.week} in phase "${phase.title}"`);
      }
      if (week.items.length < 2 || week.items.length > 5) {
        problems.push(`Week ${week.week}: expected 2-5 items, got ${week.items.length}`);
      }
      maxWeek = Math.max(maxWeek, week.week);
      expectedNextWeek = week.week + 1;
    }
  }
  if (roadmap.totalWeeks !== maxWeek) {
    problems.push(`totalWeeks (${roadmap.totalWeeks}) does not match the actual max week number (${maxWeek})`);
  }

  return { pass: problems.length === 0, problems };
}

describe('G1 — roadmap structure & ambition-calibration honesty', () => {
  it.skipIf(isCheap())(
    'flags unrealistic ambition honestly and builds a structurally valid weekly roadmap',
    async () => {
      const coach = await getCoach();
      const resumeText = loadResume(FIXTURE_ID);

      const profile = await cachedCall(`extractProfile:${FIXTURE_ID}`, () => coach.extractProfile(resumeText));
      const paths = await cachedCall(`generatePaths:${FIXTURE_ID}:g1`, () => coach.generatePaths(profile, SIGNALS, []));

      const flaggedPath = paths.find((p) => p.ambitionCheck.verdict === 'too_high');
      const ambitionFlagged = Boolean(flaggedPath);
      const pathForRoadmap = flaggedPath ?? paths[0];

      const roadmap = await cachedCall(`generateRoadmap:${FIXTURE_ID}:g1`, () =>
        coach.generateRoadmap(profile, pathForRoadmap, SIGNALS)
      );
      const structureCheck = checkRoadmapStructure(roadmap);

      const { result, votes, disagreement } = await judge<G1Verdict>(RUBRIC, {
        profile,
        signals: SIGNALS,
        flagged_path: pathForRoadmap,
        roadmap,
      });

      const pass = ambitionFlagged && structureCheck.pass && result.pass;
      const reason = !pass
        ? [
            !ambitionFlagged ? 'Programmatic: no path was flagged ambitionCheck.verdict === "too_high" for a clearly over-reaching target.' : null,
            !structureCheck.pass ? `Programmatic: ${structureCheck.problems.join('; ')}` : null,
            !result.pass ? `Judged: ${result.reason}` : null,
          ]
            .filter(Boolean)
            .join(' | ')
        : 'Over-reach was flagged honestly and the roadmap is structurally valid and honest.';

      recordResult({
        id: 'G1',
        title: 'Roadmap structure & ambition-calibration honesty',
        type: 'mixed',
        pass,
        reason,
        votes,
        disagreement,
        meta: { ambitionFlagged, structureCheck, judged: result, paths, roadmap },
      });

      expect(pass, reason).toBe(true);
    },
    240_000
  );

  it.skipIf(!isCheap())(
    'programmatic checks only (frozen snapshot deck + roadmap)',
    async () => {
      const paths = await cachedCall<CareerPath[]>(`generatePaths:${FIXTURE_ID}:g1`, async () => {
        throw new Error('unreachable in cheap mode — snapshot should exist');
      });
      const flaggedPath = paths.find((p) => p.ambitionCheck.verdict === 'too_high');
      const ambitionFlagged = Boolean(flaggedPath);

      const roadmap = await cachedCall<Roadmap>(`generateRoadmap:${FIXTURE_ID}:g1`, async () => {
        throw new Error('unreachable in cheap mode — snapshot should exist');
      });
      const structureCheck = checkRoadmapStructure(roadmap);

      const pass = ambitionFlagged && structureCheck.pass;
      const reason = pass
        ? 'Over-reach flagged and roadmap structure valid against frozen snapshots; judged portion skipped under eval:cheap.'
        : [
            !ambitionFlagged ? 'No path flagged ambitionCheck.verdict === "too_high".' : null,
            !structureCheck.pass ? structureCheck.problems.join('; ') : null,
          ]
            .filter(Boolean)
            .join(' | ');

      recordResult({
        id: 'G1',
        title: 'Roadmap structure & ambition-calibration honesty',
        type: 'mixed',
        pass: pass ? 'skipped' : false,
        reason,
        meta: { ambitionFlagged, structureCheck },
      });

      expect(pass, reason).toBe(true);
    }
  );
});
