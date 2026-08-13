import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { type ApiErrorBody, type ErrorCode, ERROR_MESSAGES, httpStatusFor } from './errors';
import { BRAND } from './brand';
import { LIMITS } from './limits';
import { sessionIdFromRequest, UNATTRIBUTED_SESSION_ID } from './session-id';
import { TURNSTILE_HEADER, verifyHumanToken, checkBotSignal } from './bot-protection';

/* =====================================================================================
 * Abuse + spend protection for a public, unauthenticated demo.
 *
 * This app exposes an OpenAI key behind a public URL with no auth, so a single caller in a
 * loop can drain the budget. Three independent layers guard that:
 *
 *   1. session-start — per IP, caps how many NEW coaching sessions one visitor can begin.
 *   2. llm           — per IP, caps total LLM-backed API calls (a session is many calls).
 *   3. budget        — global, not per IP: a running total of estimated USD spent today
 *                      across ALL visitors. This is the only layer that stops a distributed
 *                      or many-IP drain, so it is the real backstop.
 *
 * Deliberately NOT Next.js middleware: the limits differ per route (and per action within
 * the coach route), which middleware can only express by re-parsing the request body it is
 * not supposed to consume.
 *
 * If Upstash is unconfigured (local dev), every check allows the request after one startup
 * warning — see `getRedis`.
 * ===================================================================================== */

const DEFAULT_DAILY_BUDGET_USD = 5.0;

function readDailyBudgetUsd(): number {
  const raw = process.env.DAILY_BUDGET_USD;
  if (!raw) return DEFAULT_DAILY_BUDGET_USD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[rate-limit] DAILY_BUDGET_USD="${raw}" is not a positive number. Falling back to $${DEFAULT_DAILY_BUDGET_USD.toFixed(2)}.`
    );
    return DEFAULT_DAILY_BUDGET_USD;
  }
  return parsed;
}

/** Every tunable in one place — no magic numbers at the call sites.
 * NOTE: `DEFAULT_DAILY_BUDGET_USD` and `readDailyBudgetUsd` must stay declared ABOVE this —
 * `const` bindings are in their temporal dead zone until evaluated, and this initializer runs
 * at module load. */
export const RATE_LIMIT_CONFIG = {
  /** New coaching sessions one IP may start. */
  sessionStart: { limit: 5, window: '1 h' },
  /** Total LLM-backed calls one IP may make. A full session is roughly 15-25 calls. */
  llm: { limit: 60, window: '1 h' },
  /** Server-side fetches of a user-supplied job URL. Tighter than the LLM limit on purpose:
   * this endpoint makes the server issue outbound requests to an address the caller chooses,
   * so it is the most abusable surface in the app even with the SSRF guards in place. Nobody
   * legitimately reviews against more than a handful of postings an hour. */
  jobFetch: { limit: 10, window: '1 h' },
  /** Ceiling on total estimated spend across all users per UTC day, in USD. */
  dailyBudgetUsd: readDailyBudgetUsd(),
  /** Prefix for every Redis key this module and lib/telemetry.ts own. */
  keyPrefix: BRAND.slug,
} as const;

/* =====================================================================================
 * Redis / limiter singletons
 * ===================================================================================== */

type RedisState = { redis: Redis | null };

/** Module-level so the "not configured" warning is logged once per server process, not per
 * request, and so the Redis client + limiters are reused across warm invocations. */
const state: RedisState = { redis: null };
let initialized = false;

function getRedis(): Redis | null {
  if (initialized) return state.redis;
  initialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn(
      '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. ' +
        'Rate limiting and the daily spend cap are DISABLED — every request will be allowed. ' +
        'This is expected for local development; it is not safe for a public deployment.'
    );
    return state.redis;
  }

  state.redis = new Redis({ url, token });
  return state.redis;
}

/** True when Upstash is configured. Used by lib/telemetry.ts to skip its counters silently. */
export function isRateLimitEnabled(): boolean {
  return getRedis() !== null;
}

/** Exposed so telemetry writes its spend counter to the same key this module reads. */
export function dailySpendKey(date: Date = new Date()): string {
  return `${RATE_LIMIT_CONFIG.keyPrefix}:spend:${date.toISOString().slice(0, 10)}`;
}

/* =====================================================================================
 * Per-session ceilings
 *
 * A fourth layer, and the weakest of them by design: the session id comes from a client-set
 * header, so a caller who wants past this only has to send a different one. It is here for the
 * failure mode that actually happens without anybody meaning it — a client stuck in a retry
 * loop, a tab left open, a script someone wrote to "just see what happens" and forgot about.
 * Against deliberate evasion, the per-IP limiters and the daily budget are the real layers.
 *
 * Written by lib/telemetry.ts on every completed model call, read here before the next one.
 * ===================================================================================== */

export function sessionTokensKey(sessionId: string): string {
  return `${RATE_LIMIT_CONFIG.keyPrefix}:session:${sessionId}:tokens`;
}

export function sessionCallsKey(sessionId: string): string {
  return `${RATE_LIMIT_CONFIG.keyPrefix}:session:${sessionId}:calls`;
}

function toCount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whether this session has spent its allowance, and which ceiling it hit.
 *
 * The unattributed bucket is exempt: it is shared by every request that arrives without a
 * usable id, so enforcing a per-session ceiling on it would let one such caller lock out all
 * the others. Those requests are still covered by the per-IP limiters and the daily budget.
 */
async function sessionCeilingReached(
  redis: Redis,
  sessionId: string
): Promise<'calls' | 'tokens' | null> {
  if (sessionId === UNATTRIBUTED_SESSION_ID) return null;

  const [calls, tokens] = await Promise.all([
    redis.get<number | string>(sessionCallsKey(sessionId)),
    redis.get<number | string>(sessionTokensKey(sessionId)),
  ]);

  if (toCount(calls) >= LIMITS.maxLlmCallsPerSession) return 'calls';
  if (toCount(tokens) >= LIMITS.maxTokensPerSession) return 'tokens';
  return null;
}

type LimiterKind = 'sessionStart' | 'llm' | 'jobFetch';

const limiters = new Map<LimiterKind, Ratelimit>();

function getLimiter(kind: LimiterKind): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  const existing = limiters.get(kind);
  if (existing) return existing;

  const { limit, window } = RATE_LIMIT_CONFIG[kind];
  const limiter = new Ratelimit({
    redis,
    // Sliding window rather than fixed: a fixed window lets a caller spend the whole quota at
    // 10:59 and the whole next quota at 11:01.
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `${RATE_LIMIT_CONFIG.keyPrefix}:rl:${kind}`,
    analytics: false,
  });
  limiters.set(kind, limiter);
  return limiter;
}

/* =====================================================================================
 * Client identity
 * ===================================================================================== */

/**
 * Best-effort client IP. On Vercel the trustworthy value is the LEFTMOST entry of
 * `x-forwarded-for` (the proxy appends, so later entries are hop addresses). `NextRequest.ip`
 * no longer exists in this version of Next, hence reading headers directly.
 *
 * Falls back to a shared bucket rather than allowing the request: an unidentifiable caller
 * should be limited alongside other unidentifiable callers, not exempted.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // Vercel also sets this; kept as a last real-value attempt before the shared bucket.
  const vercelIp = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercelIp) return vercelIp;

  return 'unknown';
}

/* =====================================================================================
 * Enforcement
 * ===================================================================================== */

export type GuardOptions = {
  /** Charge this request against the per-IP new-session quota. Only the entry points that
   * genuinely begin a session should set this. */
  sessionStart?: boolean;
  /** Require a verified Turnstile token. Defaults to whatever `sessionStart` is, so the two
   * travel together by default and a new session-start route cannot quietly skip the bot check
   * by forgetting a flag. Set explicitly for entry points that are not sessionStart — the
   * resume review's prepare step is one. */
  requireHumanToken?: boolean;
  /** Charge this request against the per-IP LLM-call quota and check the global budget.
   * Defaults to true — set false only for routes that reach no model. */
  llm?: boolean;
  /** Charge this request against the per-IP outbound-fetch quota. */
  jobFetch?: boolean;
  /**
   * Run the Vercel BotId check.
   *
   * Defaults to "does this request cost anything" — `llm || jobFetch || sessionStart` — which is
   * the honest definition of the surface worth protecting, and means a new expensive route is
   * covered by default rather than by remembering. Set `false` only for a route that reaches no
   * model and makes no outbound call.
   */
  botCheck?: boolean;
};

/**
 * Call at the top of an API route handler:
 *
 *   const limited = await enforceLimits(request, { sessionStart: true });
 *   if (limited) return limited;
 *
 * Returns a fully-formed 429 `NextResponse` when the caller should be turned away, or `null`
 * when the request may proceed. Never throws: if Redis is unreachable mid-request we fail
 * OPEN (log and allow), because a demo that is down is worse than a demo that is briefly
 * unmetered — the budget cap is the layer that actually bounds the damage.
 */
export async function enforceLimits(
  request: NextRequest,
  options: GuardOptions = {}
): Promise<NextResponse<ApiErrorBody> | null> {
  const {
    sessionStart = false,
    llm = true,
    jobFetch = false,
    requireHumanToken = sessionStart,
    botCheck = llm || jobFetch || sessionStart,
  } = options;

  const ip = getClientIp(request);

  // Both bot checks run before the Redis section, and deliberately outside the `if (!redis)`
  // early return below: bot protection and rate limiting are configured independently, and an
  // instance with bot protection but no Upstash key should still turn scripts away.
  //
  // BotId first: it is the cheaper of the two for a caller that is going to be refused anyway
  // (no token round-trip), and it is the one that runs on every costly request rather than only
  // on session creation.
  if (botCheck) {
    const denied = await enforceBotSignal(request);
    if (denied) return denied;
  }

  if (requireHumanToken) {
    const denied = await enforceHumanToken(request, ip);
    if (denied) return denied;
  }

  const redis = getRedis();
  if (!redis) return null;

  try {
    // Budget first: when the demo is closed for the day, saying so is more useful than
    // reporting a per-IP limit, and it costs one cheap read.
    if (llm) {
      const exceeded = await isBudgetExceeded(redis);
      if (exceeded) return budgetExceededResponse();

      // Session ceiling before the per-IP one: it is the more specific explanation, and its
      // remedy (start a new session) is different from "wait an hour".
      const ceiling = await sessionCeilingReached(redis, sessionIdFromRequest(request));
      if (ceiling) return sessionLimitReachedResponse(ceiling);
    }

    if (sessionStart) {
      const result = await getLimiter('sessionStart')?.limit(`ip:${ip}`);
      if (result && !result.success) {
        return rateLimitedResponse(
          retryAfterSeconds(result.reset),
          `You've started ${RATE_LIMIT_CONFIG.sessionStart.limit} sessions in the last hour, which is the limit for this demo. Your existing session still works — try again a little later for a new one.`
        );
      }
    }

    if (jobFetch) {
      const result = await getLimiter('jobFetch')?.limit(`ip:${ip}`);
      if (result && !result.success) {
        return rateLimitedResponse(
          retryAfterSeconds(result.reset),
          `You've fetched ${RATE_LIMIT_CONFIG.jobFetch.limit} job links in the last hour, which is the limit for this demo. You can still paste a job description directly — that has no limit.`
        );
      }
    }

    if (llm) {
      const result = await getLimiter('llm')?.limit(`ip:${ip}`);
      if (result && !result.success) {
        return rateLimitedResponse(
          retryAfterSeconds(result.reset),
          "You've hit this demo's hourly usage limit. Your conversation is saved — check back in a little while to keep going."
        );
      }
    }

    return null;
  } catch (error) {
    console.error('[rate-limit] check failed, allowing request:', error);
    return null;
  }
}

/**
 * Vercel BotId gate for every request that costs money.
 *
 * Returns a response when the caller should be turned away, or null to continue. The fail-open
 * / fail-closed split lives in lib/bot-protection.ts — this only translates the verdict into
 * the app's error envelope, and records it where the funnel can see it.
 */
async function enforceBotSignal(
  request: NextRequest
): Promise<NextResponse<ApiErrorBody> | null> {
  const result = await checkBotSignal();
  if (result.ok) return null;

  console.warn(
    JSON.stringify({
      event: 'bot_check_failed',
      timestamp: new Date().toISOString(),
      provider: 'botid',
      reason: result.reason,
      // The path is worth having: BotId's client-side protection is per-route, so a refusal
      // concentrated on one endpoint usually means that route is missing from the protect list
      // rather than that the traffic is hostile.
      path: new URL(request.url).pathname,
      ...(result.verifiedBotName ? { verifiedBotName: result.verifiedBotName } : {}),
    })
  );

  return NextResponse.json<ApiErrorBody>(
    { error: { code: 'BOT_CHECK_FAILED', message: ERROR_MESSAGES.BOT_CHECK_FAILED } },
    { status: httpStatusFor('BOT_CHECK_FAILED') }
  );
}

/**
 * Turnstile gate for session-creation entry points.
 *
 * Returns a response when the caller should be turned away, or null to continue. The fail-open
 * / fail-closed split lives in lib/bot-protection.ts — this only translates the verdict into
 * the app's error envelope.
 */
async function enforceHumanToken(
  request: NextRequest,
  ip: string
): Promise<NextResponse<ApiErrorBody> | null> {
  const result = await verifyHumanToken(request.headers.get(TURNSTILE_HEADER), ip);
  if (result.ok) return null;

  console.warn(
    JSON.stringify({
      event: 'bot_check_failed',
      timestamp: new Date().toISOString(),
      reason: result.reason,
      ...(result.codes?.length ? { codes: result.codes } : {}),
    })
  );

  // BOT_CHECK_FAILED rather than RATE_LIMITED: a person who has genuinely been misjudged needs
  // to be told to reload, not to wait an hour for a limit that will never clear.
  return NextResponse.json<ApiErrorBody>(
    { error: { code: 'BOT_CHECK_FAILED', message: ERROR_MESSAGES.BOT_CHECK_FAILED } },
    { status: httpStatusFor('BOT_CHECK_FAILED') }
  );
}

/** Reads the running daily spend total written by lib/telemetry.ts. */
async function isBudgetExceeded(redis: Redis): Promise<boolean> {
  const spent = await redis.get<number | string>(dailySpendKey());
  if (spent === null || spent === undefined) return false;
  const total = typeof spent === 'number' ? spent : Number(spent);
  if (!Number.isFinite(total)) return false;
  return total >= RATE_LIMIT_CONFIG.dailyBudgetUsd;
}

/** Whole seconds until the limit resets, floored at 1 so `Retry-After: 0` never ships. */
function retryAfterSeconds(resetEpochMs: number): number {
  return Math.max(1, Math.ceil((resetEpochMs - Date.now()) / 1000));
}

/** Seconds until the next UTC midnight, when the daily spend key rolls over. */
function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

function errorResponse(
  code: Extract<ErrorCode, 'RATE_LIMITED' | 'BUDGET_EXCEEDED' | 'SESSION_LIMIT_REACHED'>,
  message: string,
  retryAfterSeconds: number
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, retryAfterSeconds } },
    { status: httpStatusFor(code), headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

function rateLimitedResponse(retryAfter: number, message: string): NextResponse<ApiErrorBody> {
  return errorResponse('RATE_LIMITED', message, retryAfter);
}

/**
 * Ends a session that has run past its ceiling.
 *
 * `Retry-After` is the session's TTL rather than a short wait, because waiting is not the
 * remedy — this counter does not decay in any useful sense, and the message says so. It is
 * sent only because the envelope carries it for every 429 and omitting it here would make the
 * shape inconsistent.
 */
function sessionLimitReachedResponse(reason: 'calls' | 'tokens'): NextResponse<ApiErrorBody> {
  console.warn(
    JSON.stringify({
      event: 'session_ceiling_reached',
      timestamp: new Date().toISOString(),
      reason,
    })
  );
  return errorResponse('SESSION_LIMIT_REACHED', ERROR_MESSAGES.SESSION_LIMIT_REACHED, SESSION_COUNTER_TTL_SECONDS);
}

/** Matches the TTL telemetry sets on the counters it writes. Declared here because this module
 * owns the key names; telemetry imports it so the two cannot drift. */
export const SESSION_COUNTER_TTL_SECONDS = 60 * 60 * 24;

function budgetExceededResponse(): NextResponse<ApiErrorBody> {
  return errorResponse(
    'BUDGET_EXCEEDED',
    "This demo has reached its spending limit for today. It runs on a personal API budget — please check back tomorrow.",
    secondsUntilUtcMidnight()
  );
}
