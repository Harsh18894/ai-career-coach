import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, isCheap } from '../config';

/**
 * Two distinct on-disk caches (NOT in-memory — vitest gives each suite *file* its own
 * isolated module registry even when files run sequentially, so a module-level Map would
 * NOT be shared across the five eval files, only within one file):
 *
 *  - snapshots/  — committed, long-lived. ONLY read by `cachedCall` in cheap mode, ONLY
 *    written by `warmSnapshot` (via `npm run eval:warm`). Never touched during a normal run.
 *  - run/        — ephemeral, cleared at the start of every invocation by evals/run.ts.
 *    Used by `cachedCall` in full mode as a write-through cache so the same generation
 *    (e.g. the R-grow-01 profile, requested by both C3 and E1) is only requested once per
 *    `npm run eval` invocation, regardless of which suite file asks for it first.
 */

const snapshotDir = join(config.cacheDir, 'snapshots');
const runCacheDir = join(config.cacheDir, 'run');

function pathFor(dir: string, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_:-]/g, '_');
  return join(dir, `${safe}.json`);
}

export function readSnapshot<T>(key: string): T {
  const path = pathFor(snapshotDir, key);
  if (!existsSync(path)) {
    throw new Error(
      `[cache] No snapshot for "${key}" at ${path}. ` +
        `Run "npm run eval:warm" once (requires OPENAI_API_KEY) to generate it, ` +
        `or run "npm run eval" (full mode) which generates live instead of reading snapshots.`
    );
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function writeSnapshot<T>(key: string, value: T): void {
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(pathFor(snapshotDir, key), JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

export function hasSnapshot(key: string): boolean {
  return existsSync(pathFor(snapshotDir, key));
}

/** Called once by evals/run.ts before each invocation so stale generations don't leak in. */
export function clearRunCache(): void {
  rmSync(runCacheDir, { recursive: true, force: true });
  mkdirSync(runCacheDir, { recursive: true });
}

/**
 * Used by eval suites for every coach-adapter call they make.
 * - cheap mode: reads the committed snapshot only. Throws (clear, catchable error) if absent.
 * - full mode: reads/writes the ephemeral run cache, calling fn() live only on a miss.
 */
export async function cachedCall<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (isCheap()) {
    return readSnapshot<T>(key);
  }

  const path = pathFor(runCacheDir, key);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  }

  const value = await fn();
  mkdirSync(runCacheDir, { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  return value;
}

/** Only used by the explicit warm script — always live, always overwrites the snapshot. */
export async function warmSnapshot<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const value = await fn();
  writeSnapshot(key, value);
  return value;
}
