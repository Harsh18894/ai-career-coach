import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';
import type { EvalResult } from './lib/report-collector';

const REQUIRED_EVAL_IDS = ['B1', 'B3', 'C3', 'E1', 'F6', 'G1', 'H1', 'I1'] as const;
const resultsDir = new URL('.results/', import.meta.url).pathname;
const reportPath = new URL('report.json', import.meta.url).pathname;

function loadResults(): EvalResult[] {
  if (!existsSync(resultsDir)) return [];
  return readdirSync(resultsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(resultsDir, f), 'utf-8')) as EvalResult);
}

function statusLabel(pass: EvalResult['pass']): string {
  if (pass === true) return 'PASS';
  if (pass === 'skipped') return 'SKIP';
  return 'FAIL';
}

function typeLabel(type: EvalResult['type']): string {
  if (type === 'programmatic') return '[P]';
  if (type === 'judged') return '[J]';
  return '[P+J]';
}

/** Reads recorded per-eval results, prints the table + summary, writes report.json. */
export function buildAndPrintReport(): number {
  const results = loadResults();
  const byId = new Map(results.map((r) => [r.id, r] as const));

  console.log('\n=== Career Coach Eval Report ===\n');
  console.log(`coachModelVersion: ${config.coachModelVersion}`);
  console.log(`judgeModel:        ${config.judgeModel}`);
  console.log(`mode:              ${config.mode}\n`);

  console.log('ID    Type   Status   Title');
  console.log('----  -----  -------  -----');
  for (const id of REQUIRED_EVAL_IDS) {
    const r = byId.get(id);
    if (!r) {
      console.log(`${id.padEnd(4)}  ${'?'.padEnd(5)}  ${'MISSING'.padEnd(7)}  (no result recorded — did the suite throw before recording?)`);
      continue;
    }
    console.log(`${id.padEnd(4)}  ${typeLabel(r.type).padEnd(5)}  ${statusLabel(r.pass).padEnd(7)}  ${r.title}`);
    if (r.pass !== true) {
      console.log(`      -> ${r.reason ?? '(no reason recorded)'}`);
    }
  }

  const disagreements = results.filter((r) => r.disagreement);
  console.log('\n--- Judge vote disagreements (flagged for human review) ---');
  if (disagreements.length === 0) {
    console.log('None.');
  } else {
    for (const r of disagreements) {
      console.log(`${r.id}: votes=${JSON.stringify(r.votes)} -> majority verdict pass=${r.pass}`);
    }
  }

  // Hard gate: every required eval must have an on-record TRUE pass in full mode.
  // In cheap mode, a deliberate 'skipped' (judged evals with no programmatic component, or
  // the judged half of mixed evals) does not fail the gate — only an actual `false` does.
  const gateFailures = REQUIRED_EVAL_IDS.filter((id) => {
    const r = byId.get(id);
    if (!r) return true;
    if (r.pass === true) return false;
    if (r.pass === 'skipped' && config.mode === 'cheap') return false;
    return true;
  });

  const hardGatePassed = gateFailures.length === 0;
  console.log(`\nHard gate (all eight must pass): ${hardGatePassed ? 'PASSED' : 'FAILED'}`);
  if (!hardGatePassed) {
    console.log(`Failing: ${gateFailures.join(', ')}`);
  }

  mkdirSync(new URL('.', import.meta.url).pathname, { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        coachModelVersion: config.coachModelVersion,
        judgeModel: config.judgeModel,
        mode: config.mode,
        voteCount: config.voteCount,
        hardGatePassed,
        gateFailures,
        results,
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );
  console.log(`\nFull report written to evals/report.json\n`);

  return hardGatePassed ? 0 : 1;
}
