import { AsyncLocalStorage } from 'node:async_hooks';
import type OpenAI from 'openai';
import { Redis } from '@upstash/redis';
import {
  RATE_LIMIT_CONFIG,
  dailySpendKey,
  sessionCallsKey,
  sessionTokensKey,
  SESSION_COUNTER_TTL_SECONDS,
} from './rate-limit';
import { sessionIdFromRequest } from './session-id';
import { classifyUpstreamError } from './errors';

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
  /** Which sample profile was used, when isSample. */
  sampleId?: string;
  /** Resume-review only: the persona the review ran at, and which path it took. Lets cost per
   * review be reported separately from cost per coaching session, and split by both. */
  persona?: string;
  reviewPath?: string;
  /** Running total of estimated spend for THIS request, accumulated by `finish`. A coaching
   * session is one long-lived id, but a review is a bounded unit of work spanning two
   * requests, so its cost needs its own accumulator rather than a session-wide read. */
  accumulatedCostUsd?: number;
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

/**
 * Enriches the active context in place, for facts not known when the handler started.
 *
 * The resume-review pipeline is the motivating case: persona is only determined by stage 2,
 * but stage 3's llm_call record needs to carry it so cost can be split by persona. Mutating
 * the stored object is safe because AsyncLocalStorage hands every call in this request the
 * same object reference, and it is scoped to this request alone.
 *
 * No-op outside a telemetry scope.
 */
export function updateTelemetryContext(patch: Partial<TelemetryContext>): void {
  const store = contextStore.getStore();
  if (store) Object.assign(store, patch);
}

/** Falls back to an anonymous context so a missing wrapper degrades to unattributed logging
 * rather than throwing. */
function currentContext(): TelemetryContext {
  return contextStore.getStore() ?? { sessionId: 'unattributed', route: 'unknown', isSample: false };
}

/** Estimated spend accrued so far in the current request's telemetry scope. */
export function currentContextCostUsd(): number {
  return contextStore.getStore()?.accumulatedCostUsd ?? 0;
}

/** Reads session identity off the request headers set by lib/session.ts. */
export function telemetryContextFromRequest(request: Request, route: string): TelemetryContext {
  const sampleId = request.headers.get('x-aria-sample-id')?.trim();
  return {
    // Shared with lib/rate-limit.ts's session ceilings, so the id this attributes cost to and
    // the id that gets limited are always the same one.
    sessionId: sessionIdFromRequest(request),
    route,
    isSample: request.headers.get('x-aria-sample') === '1',
    ...(sampleId && sampleId.length <= 64 ? { sampleId } : {}),
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
  /** Streamed calls only: milliseconds from issuing the request to the first chunk carrying
   * visible content. This is the number a user feels — `durationMs` on a streamed call is how
   * long the whole answer took to finish arriving, which nobody sits and watches.
   *
   * On a reasoning model this deliberately INCLUDES reasoning time: the model thinks before it
   * emits its first visible token, so reasoning is dead air for the reader and belongs inside
   * the measurement rather than beside it. */
  ttftMs?: number;
  /** completionTokens minus reasoningTokens — the part of the output that was actually text.
   * Logged separately because on gpt-5 extraction calls the two differ by an order of
   * magnitude, and "the model wrote 40 tokens" and "the model was billed for 7,000" are both
   * true and answer different questions. */
  outputTokens: number;
  /** What was actually in force on THIS request, read from the params rather than from a
   * config file — so the log answers "what did we send" and not "what did we intend to send".
   * Undefined means the parameter was not set and the API default applied. */
  reasoningEffort?: string;
  maxOutputTokens?: number;
  /** 'stop' | 'length' | 'content_filter' | … . `length` means the response was cut off, which
   * is the failure Task B4's cap has to avoid producing. */
  finishReason?: string;
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
  sampleId?: string;
  persona?: string;
  reviewPath?: string;
};

/** One line, one object, no pretty-printing — so `vercel logs | grep llm_call` is parseable. */
function emit(record: LlmCallRecord): void {
  console.log(JSON.stringify(record));
}

/** Failed calls are logged with the same codes the user-facing taxonomy uses, so a log line
 * and the message the visitor saw can be lined up. */
function classifyError(error: unknown): string {
  return classifyUpstreamError(error);
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
async function recordSpend(sessionId: string, costUsd: number, tokens: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const sessionKey = sessionCostKey(sessionId);
    const dayKey = dailySpendKey();

    const pipeline = redis.pipeline();

    if (costUsd > 0) {
      pipeline.incrbyfloat(sessionKey, costUsd);
      pipeline.expire(sessionKey, SESSION_COST_TTL_SECONDS);
      // Sample sessions still count against the daily budget — they cost real money — even
      // though they are excluded from usage metrics by the isSample flag on each log line.
      pipeline.incrbyfloat(dayKey, costUsd);
      pipeline.expire(dayKey, DAILY_SPEND_TTL_SECONDS);
    }

    // The per-session ceilings lib/rate-limit.ts enforces. Counted even for a zero-cost call
    // (an unpriced model, a cached completion): the call count is a measure of activity, and a
    // loop that costs nothing per iteration is still a loop.
    const callsKey = sessionCallsKey(sessionId);
    const tokensKey = sessionTokensKey(sessionId);
    pipeline.incr(callsKey);
    pipeline.expire(callsKey, SESSION_COUNTER_TTL_SECONDS);
    if (tokens > 0) {
      pipeline.incrby(tokensKey, tokens);
      pipeline.expire(tokensKey, SESSION_COUNTER_TTL_SECONDS);
    }

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

/**
 * The request-shape fields worth logging, extracted from the params the call actually sent.
 *
 * Read from `params` rather than accepted as arguments so a call site cannot report an effort
 * level it did not use. If someone changes reasoning_effort at a call site and forgets the
 * telemetry, the telemetry still tells the truth.
 */
type RequestShape = {
  reasoningEffort?: string;
  maxOutputTokens?: number;
};

function requestShapeOf(params: {
  reasoning_effort?: unknown;
  max_completion_tokens?: number | null;
  max_tokens?: number | null;
}): RequestShape {
  const effort = typeof params.reasoning_effort === 'string' ? params.reasoning_effort : undefined;
  // gpt-5 uses max_completion_tokens; max_tokens is the older name and is read as a fallback so
  // the field is populated whichever one a call site sets.
  const max = params.max_completion_tokens ?? params.max_tokens ?? undefined;
  return {
    ...(effort ? { reasoningEffort: effort } : {}),
    ...(typeof max === 'number' ? { maxOutputTokens: max } : {}),
  };
}

async function finish(
  call: string,
  model: string,
  usage: Usage,
  startedAt: number,
  streamed: boolean,
  extra: RequestShape & { ttftMs?: number; finishReason?: string } = {}
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
    // Clamped at zero: the two counts come from the same usage block, but a malformed or
    // partial usage payload should not produce a negative token count in a report.
    outputTokens: Math.max(0, completionTokens - reasoningTokens),
    estimatedCostUsd,
    pricingKnown,
    durationMs: Date.now() - startedAt,
    ...(extra.ttftMs !== undefined ? { ttftMs: extra.ttftMs } : {}),
    ...(extra.reasoningEffort ? { reasoningEffort: extra.reasoningEffort } : {}),
    ...(extra.maxOutputTokens !== undefined ? { maxOutputTokens: extra.maxOutputTokens } : {}),
    ...(extra.finishReason ? { finishReason: extra.finishReason } : {}),
    streamed,
    ok: true,
    isSample: context.isSample,
    ...(context.sampleId ? { sampleId: context.sampleId } : {}),
    ...(context.persona ? { persona: context.persona } : {}),
    ...(context.reviewPath ? { reviewPath: context.reviewPath } : {}),
  });

  // A response that stopped on the length limit is a defect, not a statistic. Emitted as its
  // own error-level line, separate from the llm_call record, because the thing an operator
  // needs to find is "which cap was wrong and by how much" — and because a truncated structured
  // response goes on to fail schema validation, which surfaces as INVALID_OUTPUT and looks like
  // a model problem rather than a configuration one.
  //
  // The remedy is always to raise the cap in lib/ai/output-limits.ts after checking why the
  // call grew, never to loosen the schema or swallow the parse failure.
  if (extra.finishReason === 'length') {
    console.error(
      JSON.stringify({
        event: 'llm_truncated',
        timestamp: new Date().toISOString(),
        sessionId: context.sessionId,
        route: context.route,
        call,
        model,
        maxOutputTokens: extra.maxOutputTokens ?? null,
        completionTokens,
        reasoningTokens,
        outputTokens: Math.max(0, completionTokens - reasoningTokens),
        errorCode: 'INVALID_OUTPUT',
        detail:
          'Response stopped on the length limit. The cap for this call site is too low — raise it in lib/ai/output-limits.ts.',
      })
    );
  }

  context.accumulatedCostUsd = (context.accumulatedCostUsd ?? 0) + estimatedCostUsd;

  await recordSpend(context.sessionId, estimatedCostUsd, promptTokens + completionTokens);
}

function finishWithError(
  call: string,
  model: string,
  startedAt: number,
  streamed: boolean,
  error: unknown,
  extra: RequestShape & { ttftMs?: number } = {}
): void {
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
    outputTokens: 0,
    estimatedCostUsd: 0,
    pricingKnown: model in MODEL_PRICING,
    durationMs: Date.now() - startedAt,
    // A stream that produced tokens and THEN failed still has a real TTFT, and losing it
    // would bias the percentiles toward the calls that happened to succeed.
    ...(extra.ttftMs !== undefined ? { ttftMs: extra.ttftMs } : {}),
    ...(extra.reasoningEffort ? { reasoningEffort: extra.reasoningEffort } : {}),
    ...(extra.maxOutputTokens !== undefined ? { maxOutputTokens: extra.maxOutputTokens } : {}),
    streamed,
    ok: false,
    errorCode: classifyError(error),
    isSample: context.isSample,
    ...(context.sampleId ? { sampleId: context.sampleId } : {}),
    ...(context.persona ? { persona: context.persona } : {}),
    ...(context.reviewPath ? { reviewPath: context.reviewPath } : {}),
  });
}

/**
 * Drop-in replacement for `openai.chat.completions.create(params)` on non-streaming calls.
 * Params pass through untouched.
 */
export async function trackedCompletion(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  call: string,
  requestOptions?: { timeout?: number; maxRetries?: number }
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const startedAt = Date.now();
  const shape = requestShapeOf(params);
  try {
    const response = await openai.chat.completions.create(params, requestOptions);
    await finish(call, params.model, response.usage, startedAt, false, {
      ...shape,
      finishReason: response.choices[0]?.finish_reason,
    });
    return response;
  } catch (error) {
    finishWithError(call, params.model, startedAt, false, error, shape);
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
  call: string,
  requestOptions?: { timeout?: number; maxRetries?: number }
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const startedAt = Date.now();
  const capturedContext = currentContext();
  const shape = requestShapeOf(params);

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    stream = await openai.chat.completions.create(
      { ...params, stream_options: { ...params.stream_options, include_usage: true } },
      requestOptions
    );
  } catch (error) {
    finishWithError(call, params.model, startedAt, true, error, shape);
    throw error;
  }

  return wrapStream(stream, call, params.model, startedAt, capturedContext, shape);
}

async function* wrapStream(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  call: string,
  model: string,
  startedAt: number,
  context: TelemetryContext,
  shape: RequestShape
): AsyncGenerator<OpenAI.Chat.Completions.ChatCompletionChunk> {
  let usage: Usage;
  let failed = false;
  let failure: unknown;
  let ttftMs: number | undefined;
  let finishReason: string | undefined;

  try {
    for await (const chunk of stream) {
      // With include_usage the final chunk carries usage and an empty choices array.
      if (chunk.usage) usage = chunk.usage;

      // TTFT is measured at the first chunk carrying VISIBLE content, not the first chunk of
      // any kind: the opening chunk typically carries only `role: 'assistant'` with an empty
      // delta, and counting that would report a TTFT of a few hundred milliseconds for a call
      // whose first readable word arrives seconds later. On a reasoning model that gap is the
      // whole story.
      if (ttftMs === undefined && chunk.choices[0]?.delta?.content) {
        ttftMs = Date.now() - startedAt;
      }

      const reason = chunk.choices[0]?.finish_reason;
      if (reason) finishReason = reason;

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
      if (failed) finishWithError(call, model, startedAt, true, failure, { ...shape, ttftMs });
      else await finish(call, model, usage, startedAt, true, { ...shape, ttftMs, finishReason });
    });
  }
}
