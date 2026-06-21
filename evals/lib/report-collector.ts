import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';

/**
 * Cross-file result aggregation. Vitest runs each suite file in its own worker context, so we
 * can't share an in-memory array across files + a final reporting step. Instead each `it()`
 * writes its own result file to evals/.results/<id>.json (in a `finally`, so it's written even
 * if the test's own `expect()` later throws), and evals/report.ts reads them all back after
 * the vitest process exits.
 */

export type EvalResultType = 'programmatic' | 'judged' | 'mixed';

export interface EvalResult {
  id: string;
  title: string;
  type: EvalResultType;
  pass: boolean | 'skipped';
  reason?: string;
  votes?: boolean[];
  disagreement?: boolean;
  meta?: Record<string, unknown>;
}

const resultsDir = new URL('../.results/', import.meta.url).pathname;

export function recordResult(result: EvalResult): void {
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, `${result.id}.json`), JSON.stringify(result, null, 2) + '\n', 'utf-8');
}

export function resultsDirPath(): string {
  return resultsDir;
}

/**
 * Shared by eval:cheap's "programmatic pre-check against a frozen snapshot" tests (the shape
 * C3/F6/I1 all share verbatim: skip the judge, record+assert pass/fail off a single
 * boolean + a details list). Not used by every suite — E1/G1/H1/B3's cheap-mode tests compute
 * their pass/reason differently and are left as-is rather than forced into this shape.
 */
export function assertCheapPreCheckResult(params: {
  id: string;
  title: string;
  pass: boolean;
  details: string[];
  passMessage: string;
  failMessagePrefix: string;
  meta?: Record<string, unknown>;
}): void {
  const { id, title, pass, details, passMessage, failMessagePrefix, meta } = params;
  const reason = pass ? passMessage : `${failMessagePrefix}: ${details.join('; ')}`;
  recordResult({ id, title, type: 'mixed', pass: pass ? 'skipped' : false, reason, meta });
  expect(pass, details.join('; ')).toBe(true);
}
