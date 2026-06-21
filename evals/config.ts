/**
 * Central config for the eval harness. Read once at process start.
 *
 * Provider split (kept strict on purpose — see README "Architecture note"):
 *   - judgeModel runs on OpenAI (`openai` SDK, OPENAI_API_KEY).
 *   - coachModelVersion documents whichever provider/model the coach-under-test
 *     actually used for this run. In THIS repo, lib/ai/coach.ts also calls OpenAI
 *     (model 'gpt-5-nano') — there is no Anthropic usage anywhere in the codebase,
 *     despite the original eval spec assuming an Anthropic-backed coach. The
 *     adapter binds to the real module as-is rather than inventing a Claude path.
 */

// Load .env.local the same way `next dev` does, so OPENAI_API_KEY is available to these
// standalone tsx scripts without adding a `dotenv` dependency. Safe to call from any entry
// point (run.ts, warm.ts, or vitest itself importing config.ts) — no-ops if already loaded
// or the file doesn't exist.
try {
  process.loadEnvFile(new URL('../.env.local', import.meta.url).pathname);
} catch {
  // No .env.local (e.g. CI providing env vars directly) — fine.
}

export type EvalMode = 'cheap' | 'full';

function readMode(): EvalMode {
  return process.env.EVAL_CHEAP === '1' ? 'cheap' : 'full';
}

export const config = {
  // Judge model: OpenAI, used only by evals/lib/judge.ts.
  judgeModel: process.env.JUDGE_MODEL ?? 'gpt-5-nano',

  // Documents the model/provider actually used by the coach app under test.
  // Read from env so CI can stamp the report with whatever was really exercised;
  // defaults to what lib/ai/coach.ts hardcodes today.
  coachModelVersion: process.env.COACH_MODEL ?? 'openai:gpt-5-nano',

  voteCount: 3,

  thresholds: {
    titleSimilaritySame: 0.6,
  },

  // 'cheap': adapter calls are served from committed snapshots in evals/fixtures,
  // zero network calls. 'full': adapter calls hit the real coach module live.
  mode: readMode(),

  // Where warmed snapshots / within-run generation caches live.
  cacheDir: new URL('.cache/', import.meta.url).pathname,
  fixturesDir: new URL('fixtures/', import.meta.url).pathname,
} as const;

export function isCheap(): boolean {
  return config.mode === 'cheap';
}
