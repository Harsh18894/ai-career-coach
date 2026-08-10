import { AsyncLocalStorage } from 'node:async_hooks';
import type OpenAI from 'openai';
import { Redis } from '@upstash/redis';
import { RATE_LIMIT_CONFIG, dailySpendKey } from './rate-limit';

/* =====================================================================================
 * Token + cost telemetry.
 *
 * Every OpenAI call in this app goes through `trackedCompletion` / `trackedStream`, which
 * emit exactly one structured JSON line per call to stdout (greppable in Vercel logs) and
 * maintain two Redis counters:
 *
 *   aria:session:{id}:cost  — per-session running cost, 24h TTL. Answers "what does one
 *                             completed coaching session actually cost?"
 *   aria:spend:{YYYY-MM-DD} — global daily total. This is what lib/rate-limit.ts reads for
 *                             the budget cap, so the cap is fed by real measured spend.
 *
 * This module is instrumentation only: it must never change a prompt, model, temperature,
 * output schema, or the success/failure outcome of a call. A telemetry failure is swallowed
 * and logged, never propagated.
 * ===================================================================================== */

/* =====================================================================================
 * Pricing
 * ===================================================================================== */

/**
 * USD per 1M tokens. Source: https://developers.openai.com/api/docs/pricing
 * (the Standard tier table), read on 2026-08-10.
 *
 * `cachedInput` applies to the portion of prompt_tokens that OpenAI reports as cached — those
 * are billed at the discounted rate and are a SUBSET of prompt_tokens, not an addition to it.
 * See `estimateCostUsd`.
 *
 * If a new model is introduced, add it here. An unknown model is costed at 0 and the log line
 * carries `pricingKnown: false` so it is visibly wrong rather than silently undercounted.
 */
export const MODEL_PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2.0 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
};

/** Tokens are per-million-priced; this keeps the arithmetic readable at the call site. */
const PER_MILLION = 1_000_000;

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number
): { estimatedCostUsd: number; pricingKnown: boolean } {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return { estimatedCostUsd: 0, pricingKnown: false };

  // cachedTokens is included in promptTokens, so the full-price portion is the remainder.
  const uncachedPromptTokens = Math.max(0, promptTokens - cachedTokens);

  const cost =
    (uncachedPromptTokens * pricing.input +
      cachedTokens * pricing.cachedInput +
      completionTokens * pricing.output) /
    PER_MILLION;

  return { estimatedCostUsd: cost, pricingKnown: true };
}

/* =====================================================================================
 * Request-scoped context
 * ===================================================================================== */

export type TelemetryContext = {
  /** Client-generated, persisted alongside the conversation. See lib/session.ts. */
  sessionId: string;
  /** The API route the call was made from, e.g. "/api/coach". */
  route: string;
  /** True for sessions started from the "try with a sample resume" button, so demo traffic
   * can be excluded from real usage metrics. */
  isSample: boolean;
};

/**
 * AsyncLocalStorage rather than threading a context parameter through all nine coach
 * functions: those signatures are consumed by the eval adapter and the route handlers, and
 * this is instrumentation that should not reshape them.
 */
const contextStore = new AsyncLocalStorage<TelemetryContext>();

/** Wrap a route handler body so every LLM call inside it is attributed. */
export function withTelemetryContext<T>(context: TelemetryContext, fn: () => Promise<T>): Promise<T> {
  return contextStore.run(context, fn);
}

/** Falls back to an anonymous context so a missing wrapper degrades to unattributed logging
 * rather than throwing. */
function currentContext(): TelemetryContext {
  return contextStore.getStore() ?? { sessionId: 'unattributed', route: 'unknown', isSample: false };
}

/** Reads session identity off the request headers set by lib/session.ts. */
export function telemetryContextFromRequest(request: Request, route: string): TelemetryContext {
  const sessionId = request.headers.get('x-aria-session-id')?.trim();
  return {
    sessionId: sessionId && sessionId.length <= 64 ? sessionId : 'unattributed',
    route,
    isSample: request.headers.get('x-aria-sample') === '1',
  };
}

/* =====================================================================================
 * The log record
 * ===================================================================================== */

export type LlmCallRecord = {
  event: 'llm_call';
  timestamp: string;
  sessionId: string;
  route: string;
  /** Which coach function made the call, e.g. "generateRoadmap" — `route` alone can't
   * distinguish the eight actions multiplexed through /api/coach. */
  call: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  /** Subset of completionTokens spent on reasoning. The gpt-5 family bills these as output
   * tokens, so they are already inside completionTokens and inside estimatedCostUsd — broken
   * out because on structured-extraction calls they dominate the bill. */
  reasoningTokens: number;
  estimatedCostUsd: number;
  pricingKnown: boolean;
  durationMs: number;
  streamed: boolean;
  ok: boolean;
  errorCode?: string;
  isSample: boolean;
};

/** One line, one object, no pretty-printing — so `vercel logs | grep llm_call` is parseable. */
function emit(record: LlmCallRecord): void {
  console.log(JSON.stringify(record));
}

/**
 * Coarse classification of a failed call. Task 3 owns the real taxonomy in lib/errors.ts;
 * this exists so a failed call's log line is still useful before that lands.
 */
function classifyError(error: unknown): string {
  const err = error as { status?: number; name?: string; code?: string };
  if (err?.name === 'AbortError' || err?.code === 'ETIMEDOUT') return 'UPSTREAM_TIMEOUT';
  if (typeof err?.status === 'number') {
    if (err.status === 429) return 'RATE_LIMITED';
    if (err.status >= 500) return 'UPSTREAM_ERROR';
    return 'UPSTREAM_ERROR';
  }
  return 'UNKNOWN';
}

/* =====================================================================================
 * Redis aggregation
 * ===================================================================================== */

let redisClient: Redis | null = null;
let redisInitialized = false;

function getRedis(): Redis | null {
  if (redisInitialized) return redisClient;
  redisInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  // Deliberately silent: lib/rate-limit.ts already warns once about the same missing vars,
  // and two warnings for one cause is noise.
  if (!url || !token) return redisClient;

  redisClient = new Redis({ url, token });
  return redisClient;
}

const SESSION_COST_TTL_SECONDS = 60 * 60 * 24; // 24h
const DAILY_SPEND_TTL_SECONDS = 60 * 60 * 48; // 48h — outlives the UTC day it keys, then reaps itself

export function sessionCostKey(sessionId: string): string {
  return `${RATE_LIMIT_CONFIG.keyPrefix}:session:${sessionId}:cost`;
}

/**
 * Adds this call's cost to the per-session and global-daily counters.
 *
 * Awaited rather than fire-and-forget: an Upstash REST round trip is ~20ms against multi-second
 * model calls, and a dropped increment would understate the budget the cap depends on. Any
 * failure is logged and swallowed — telemetry must not break a request.
 */
async function recordSpend(sessionId: string, costUsd: number): Promise<void> {
  if (costUsd <= 0) return;
  const redis = getRedis();
  if (!redis) return;

  try {
    const sessionKey = sessionCostKey(sessionId);
    const dayKey = dailySpendKey();

    const pipeline = redis.pipeline();
    pipeline.incrbyfloat(sessionKey, costUsd);
    pipeline.expire(sessionKey, SESSION_COST_TTL_SECONDS);
    // Sample sessions still count against the daily budget — they cost real money — even
    // though they are excluded from usage metrics by the isSample flag on each log line.
    pipeline.incrbyfloat(dayKey, costUsd);
    pipeline.expire(dayKey, DAILY_SPEND_TTL_SECONDS);
    await pipeline.exec();
  } catch (error) {
    console.error('[telemetry] failed to record spend:', error);
  }
}

/** Reads a session's accumulated cost. Used to verify the aggregate against the log lines. */
export async function readSessionCost(sessionId: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  const value = await redis.get<number | string>(sessionCostKey(sessionId));
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/* =====================================================================================
 * The wrappers
 * ===================================================================================== */

type Usage = OpenAI.Completions.CompletionUsage | undefined;

function tokensFrom(usage: Usage): {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
} {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

async function finish(
  call: string,
  model: string,
  usage: Usage,
  startedAt: number,
  streamed: boolean
): Promise<void> {
  const context = currentContext();
  const { promptTokens, completionTokens, cachedTokens, reasoningTokens } = tokensFrom(usage);
  const { estimatedCostUsd, pricingKnown } = estimateCostUsd(
    model,
    promptTokens,
    completionTokens,
    cachedTokens
  );

  emit({
    event: 'llm_call',
    timestamp: new Date().toISOString(),
    sessionId: context.sessionId,
    route: context.route,
    call,
    model,
    promptTokens,
    completionTokens,
    cachedTokens,
    reasoningTokens,
    estimatedCostUsd,
    pricingKnown,
    durationMs: Date.now() - startedAt,
    streamed,
    ok: true,
    isSample: context.isSample,
  });

  await recordSpend(context.sessionId, estimatedCostUsd);
}

function finishWithError(call: string, model: string, startedAt: number, streamed: boolean, error: unknown): void {
  const context = currentContext();
  emit({
    event: 'llm_call',
    timestamp: new Date().toISOString(),
    sessionId: context.sessionId,
    route: context.route,
    call,
    model,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    estimatedCostUsd: 0,
    pricingKnown: model in MODEL_PRICING,
    durationMs: Date.now() - startedAt,
    streamed,
    ok: false,
    errorCode: classifyError(error),
    isSample: context.isSample,
  });
}

/**
 * Drop-in replacement for `openai.chat.completions.create(params)` on non-streaming calls.
 * Params pass through untouched.
 */
export async function trackedCompletion(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  call: string
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const startedAt = Date.now();
  try {
    const response = await openai.chat.completions.create(params);
    await finish(call, params.model, response.usage, startedAt, false);
    return response;
  } catch (error) {
    finishWithError(call, params.model, startedAt, false, error);
    throw error;
  }
}

/**
 * Drop-in replacement for a streaming `create`. Two things happen here that cannot happen at
 * the call site:
 *
 *  1. `stream_options: { include_usage: true }` is forced on. Without it the usage block never
 *     arrives and every streamed call would log zero tokens.
 *  2. The returned iterable is wrapped so the final usage-bearing chunk is captured and the
 *     record is emitted when the stream ends — including when the consumer stops early or the
 *     stream errors mid-flight, which is the case Task 3 cares about.
 *
 * The telemetry context is captured eagerly here, while still inside the route's
 * AsyncLocalStorage scope: the stream is pumped after the handler returns, so reading the
 * context lazily at stream end would lose it.
 */
export async function trackedStream(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
  call: string
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const startedAt = Date.now();
  const capturedContext = currentContext();

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    stream = await openai.chat.completions.create({
      ...params,
      stream_options: { ...params.stream_options, include_usage: true },
    });
  } catch (error) {
    finishWithError(call, params.model, startedAt, true, error);
    throw error;
  }

  return wrapStream(stream, call, params.model, startedAt, capturedContext);
}

async function* wrapStream(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  call: string,
  model: string,
  startedAt: number,
  context: TelemetryContext
): AsyncGenerator<OpenAI.Chat.Completions.ChatCompletionChunk> {
  let usage: Usage;
  let failed = false;
  let failure: unknown;

  try {
    for await (const chunk of stream) {
      // With include_usage the final chunk carries usage and an empty choices array.
      if (chunk.usage) usage = chunk.usage;
      yield chunk;
    }
  } catch (error) {
    failed = true;
    failure = error;
    throw error;
  } finally {
    // `finally` rather than after the loop so an aborted or errored stream still emits a
    // record — a half-finished stream cost real tokens.
    await contextStore.run(context, async () => {
      if (failed) finishWithError(call, model, startedAt, true, failure);
      else await finish(call, model, usage, startedAt, true);
    });
  }
}
