#!/usr/bin/env tsx
/**
 * Populates evals/.cache/snapshots/*.json with REAL, LIVE coach generations so that
 * `npm run eval:cheap` can later exercise B1 + the programmatic pre-checks of C3/E1/F6 with
 * zero API calls. Run this once after cloning (or whenever you deliberately want to refresh
 * the cheap-mode snapshots) — it is NOT run automatically by `npm run eval`, so normal full
 * runs never silently drift the committed snapshots.
 *
 * Requires OPENAI_API_KEY (both the coach-under-test and the judge use it in this repo —
 * see README "Architecture note"). Makes ~14 real coach calls.
 */
import { getCoach } from '../adapter/coach';
import { warmSnapshot } from '../lib/cache';
import { loadResume } from '../lib/fixtures';
import { C3_SIGNALS, E1_SIGNALS_A, E1_SIGNALS_B, F6_NEUTRAL_SIGNALS, G1_OVERREACH_SIGNALS } from '../lib/signals';

async function main() {
  const coach = await getCoach();
  console.log(`Warming snapshots against ${coach.isReal ? 'the REAL coach module' : 'the MOCK coach'}...\n`);

  const personaFixtures = ['R-pivot-01', 'R-grow-01', 'R-grad-01'] as const;
  const profiles: Record<string, Awaited<ReturnType<typeof coach.extractProfile>>> = {};

  for (const id of personaFixtures) {
    console.log(`extractProfile:${id}`);
    profiles[id] = await warmSnapshot(`extractProfile:${id}`, () => coach.extractProfile(loadResume(id)));

    console.log(`generateOpener:${id}`);
    await warmSnapshot(`generateOpener:${id}`, () => coach.generateOpener(profiles[id]!));
  }

  console.log(`extractProfile:R-inject-01`);
  const injectedProfile = await warmSnapshot('extractProfile:R-inject-01', () =>
    coach.extractProfile(loadResume('R-inject-01'))
  );

  console.log('generatePaths:R-grow-01:c3');
  await warmSnapshot('generatePaths:R-grow-01:c3', () => coach.generatePaths(profiles['R-grow-01']!, C3_SIGNALS, []));

  console.log('generatePaths:R-grow-01:e1-A');
  await warmSnapshot('generatePaths:R-grow-01:e1-A', () =>
    coach.generatePaths(profiles['R-grow-01']!, E1_SIGNALS_A, [])
  );

  console.log('generatePaths:R-grow-01:e1-B');
  await warmSnapshot('generatePaths:R-grow-01:e1-B', () =>
    coach.generatePaths(profiles['R-grow-01']!, E1_SIGNALS_B, [])
  );

  console.log('generatePaths:R-inject-01:f6');
  await warmSnapshot('generatePaths:R-inject-01:f6', () =>
    coach.generatePaths(injectedProfile, F6_NEUTRAL_SIGNALS, [])
  );

  console.log('generatePaths:R-grad-01:g1');
  const g1Paths = await warmSnapshot('generatePaths:R-grad-01:g1', () =>
    coach.generatePaths(profiles['R-grad-01']!, G1_OVERREACH_SIGNALS, [])
  );

  console.log('generateRoadmap:R-grad-01:g1');
  const g1FlaggedPath = g1Paths.find((p) => p.ambitionCheck.verdict === 'too_high') ?? g1Paths[0];
  await warmSnapshot('generateRoadmap:R-grad-01:g1', () =>
    coach.generateRoadmap(profiles['R-grad-01']!, g1FlaggedPath, G1_OVERREACH_SIGNALS)
  );

  console.log('nextGuidedProfileQuestion:I1');
  await warmSnapshot('nextGuidedProfileQuestion:I1', () =>
    coach.nextGuidedProfileQuestion([
      {
        question:
          'First — what are you currently doing? (e.g. studying, working, between things) and in what area or role?',
        answer: 'studying in information technology. i know some python and sql. plus i have c language in college',
      },
    ])
  );

  console.log('nextGuidedProfileQuestionFull:J1');
  await warmSnapshot('nextGuidedProfileQuestionFull:J1', () =>
    coach.nextGuidedProfileQuestionFull([
      {
        question:
          'First — what are you currently doing? (e.g. studying, working, between things) and in what area or role?',
        answer: 'studying in information technology. i know some python and sql. plus i have c language in college',
      },
      {
        question:
          'Good — have you applied python, sql, or c outside of class, like in a personal project, part-time/freelance work, or volunteer work?',
        answer: 'part-time or volunteer work and personal projects',
      },
    ])
  );

  console.log('generateOpenerFull:K1');
  await warmSnapshot('generateOpenerFull:K1', () => coach.generateOpenerFull(profiles['R-grad-01']!));

  console.log('nextGuidedProfileQuestionFull:L1');
  await warmSnapshot('nextGuidedProfileQuestionFull:L1', () =>
    coach.nextGuidedProfileQuestionFull([
      {
        question:
          'First — what are you currently doing? (e.g. studying, working, between things) and in what area or role?',
        answer: 'I want to talk about life and not career. Suggest me movies to watch this week',
      },
    ])
  );

  console.log('\nDone. evals/.cache/snapshots/ is now populated for eval:cheap.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
