#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { config, isCheap } from './config';
import { clearRunCache } from './lib/cache';
import { buildAndPrintReport } from './report';

const resultsDir = new URL('.results/', import.meta.url).pathname;
rmSync(resultsDir, { recursive: true, force: true });
clearRunCache();

if (isCheap()) {
  console.log('=== Career Coach Evals: CHEAP mode ===');
  console.log('Zero API calls. B1 + the programmatic pre-checks of C3/E1/F6/G1/I1, plus H1\'s always-on');
  console.log('canRecommend hard-gate unit test, run with no snapshot dependency at all; B3 and the');
  console.log('judged portions of C3/E1/F6/G1/H1/I1 are skipped by design.\n');
} else {
  // Static estimate of the call graph (coach calls dedupe across evals via the run cache,
  // judge calls run config.voteCount times each):
  //   coach:  B1 generates 3 profiles + 3 openers (6).
  //           C3 reuses R-grow-01's profile, generates 1 deck (1).
  //           E1 reuses R-grow-01's profile, generates 2 decks (2).
  //           F6 generates 1 new profile (R-inject-01) + 1 deck (2).
  //           G1 reuses R-grad-01's profile (from B1), generates 1 deck + 1 roadmap (2).
  //           B3 reuses R-pivot-01's profile+opener from B1 (0).
  //           H1 uses a hand-built fixture (no resume) — 1 streamChatTurn + 1 analyzeSignals (2).
  //           I1 uses a hand-built fixture (no resume) — 1 nextGuidedProfileQuestion (1).
  //           J1 uses a hand-built fixture (no resume) — 1 nextGuidedProfileQuestionFull (1).
  //           K1 reuses R-grad-01's profile (from B1/G1), generates 1 opener (1).
  //           L1 uses a hand-built fixture (no resume) — 1 nextGuidedProfileQuestionFull (1).
  //           -> ~19 coach calls.
  //   judge:  B3 + C3 + E1 + F6 + G1 + H1 + I1 + J1 + K1 + L1 each run 1 judged check x voteCount -> 10 * voteCount.
  const coachCallEstimate = 19;
  const judgeCallEstimate = 10 * config.voteCount;
  console.log('=== Career Coach Evals: FULL mode ===');
  console.log(`Estimated calls this run: ~${coachCallEstimate} coach (OpenAI, model in lib/ai/coach.ts) `);
  console.log(`                          + ~${judgeCallEstimate} judge (OpenAI, ${config.judgeModel}, ${config.voteCount}x majority vote)`);
  console.log(`                          = ~${coachCallEstimate + judgeCallEstimate} total API calls.`);
  console.log('gpt-5-nano is very cheap per call; the larger cost driver is call count, not price/call.\n');
}

const vitestResult = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'evals/vitest.config.ts'],
  { stdio: 'inherit', env: process.env, cwd: new URL('../', import.meta.url).pathname }
);

const exitCode = buildAndPrintReport();
process.exit(Math.max(vitestResult.status ?? 0, exitCode));
