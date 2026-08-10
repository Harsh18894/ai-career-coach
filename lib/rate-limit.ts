import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { type ApiErrorBody, type ErrorCode, httpStatusFor } from './errors';

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
  /** Ceiling on total estimated spend across all users per UTC day, in USD. */
  dailyBudgetUsd: readDailyBudgetUsd(),
  /** Prefix for every Redis key this module and lib/telemetry.ts own. */
  keyPrefix: 'aria',
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

type LimiterKind = 'sessionStart' | 'llm';

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
  /** Charge this request against the per-IP LLM-call quota and check the global budget.
   * Defaults to true — set false only for routes that reach no model. */
  llm?: boolean;
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
  const { sessionStart = false, llm = true } = options;

  const redis = getRedis();
  if (!redis) return null;

  const ip = getClientIp(request);

  try {
    // Budget first: when the demo is closed for the day, saying so is more useful than
    // reporting a per-IP limit, and it costs one cheap read.
    if (llm) {
      const exceeded = await isBudgetExceeded(redis);
      if (exceeded) return budgetExceededResponse();
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
  code: Extract<ErrorCode, 'RATE_LIMITED' | 'BUDGET_EXCEEDED'>,
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

function budgetExceededResponse(): NextResponse<ApiErrorBody> {
  return errorResponse(
    'BUDGET_EXCEEDED',
    "This demo has reached its spending limit for today. It runs on a personal API budget — please check back tomorrow.",
    secondsUntilUtcMidnight()
  );
}
