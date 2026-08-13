/**
 * "Is there a person on the other end of this?" — two independent answers.
 *
 * Why any of this exists: the per-IP limiters assume a caller has one IP. A link on Reddit
 * attracts scripted traffic that does not — a residential proxy pool turns "5 sessions per hour"
 * into "5 sessions per hour, per address, times ten thousand addresses". These are the layers
 * that ask whether there is a browser on the other end at all, which is the question IP counting
 * cannot answer.
 *
 * ============================== THE TWO SIGNALS ==============================
 *
 * VERCEL BOTID — the primary, on every request that costs money.
 *   Invisible and interaction-free: no token to mint, no challenge to solve, nothing on the
 *   critical path of a conversation. That is what makes it affordable to run on EVERY
 *   cost-bearing route rather than only on session creation, which is the whole reason it was
 *   worth adding a dependency for. Runs on Vercel only (it needs the platform's request context
 *   and an OIDC token); everywhere else it degrades, see below.
 *
 * TURNSTILE — kept, on session creation only.
 *   Not redundant: it is the layer that still works when the app is not running on Vercel, and
 *   two independent classifiers disagree in useful ways. It stays session-creation-only because
 *   a token IS single-use and does take a moment to mint — gating every chat turn with it would
 *   put that between a person and their next sentence.
 *
 * ========================== THE FAILURE MODES ==========================
 *
 * Deliberately asymmetric, and the asymmetry is the design:
 *
 *   Classified as a BOT       -> reject. Fail CLOSED. This is the signal both layers exist for.
 *   Provider UNREACHABLE, or  -> allow, and log it. Fail OPEN, degrading to the per-IP limiters
 *   not deployed on Vercel       and the daily budget. An outage on someone else's service must
 *                                not take this app down; the layers underneath still bound the
 *                                damage, which is what makes failing open affordable here.
 *   Not configured            -> skipped entirely, exactly as lib/rate-limit.ts skips when
 *                                Upstash is absent, so local development needs no accounts.
 *
 * In development BotId returns `isHuman: true, bypassed: true` by design, so `npm run dev` is
 * unaffected and nothing here needs a local escape hatch.
 * ==============================================================================
 */

import { checkBotId } from 'botid/server';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Sent by the browser on gated requests. A header rather than a body field so the multipart
 * resume upload carries it too, matching how session identity already travels. */
export const TURNSTILE_HEADER = 'x-hachi-turnstile';

/** Cloudflare's own test keys, which always pass. Not used here — noted so that if someone
 * copies them into .env thinking they have enabled protection, the grep finds this comment:
 * site key 1x00000000000000000000AA / secret 1x0000000000000000000000000000000AA always
 * succeed and provide no protection whatsoever. */

/** Beyond this, treat Cloudflare as unreachable rather than making a person wait. Session start
 * is already a slow moment (a PDF is being parsed); adding seconds to it for a check that is
 * going to fail open anyway would be the worst of both. */
const VERIFY_TIMEOUT_MS = 3_000;

export function isBotProtectionConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export type BotCheckResult =
  | { ok: true; reason: 'verified' | 'not-configured' | 'provider-unreachable' }
  | { ok: false; reason: 'missing-token' | 'rejected'; codes?: string[] };

type SiteverifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
};

/**
 * Verifies a Turnstile token.
 *
 * `remoteIp` is passed to Cloudflare when known — it lets them correlate the token with the
 * address that solved the challenge, which is the difference between a token being single-use
 * and a token being single-use *by the client that earned it*.
 */
export async function verifyHumanToken(
  token: string | null | undefined,
  remoteIp?: string
): Promise<BotCheckResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, reason: 'not-configured' };

  const trimmed = token?.trim();
  if (!trimmed) return { ok: false, reason: 'missing-token' };

  // A token is a bounded opaque string. Refusing an absurd one here avoids posting it onward.
  if (trimmed.length > 2_048) return { ok: false, reason: 'rejected', codes: ['token-too-long'] };

  const body = new URLSearchParams({ secret, response: trimmed });
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);

  let data: SiteverifyResponse;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cache: 'no-store',
    });

    // A non-2xx from Cloudflare is Cloudflare having a problem, not the caller having a bad
    // token. Treated as an outage, not as a rejection.
    if (!response.ok) {
      logDegraded(`siteverify returned HTTP ${response.status}`);
      return { ok: true, reason: 'provider-unreachable' };
    }

    data = (await response.json()) as SiteverifyResponse;
  } catch (error) {
    logDegraded(error instanceof Error ? error.message : String(error));
    return { ok: true, reason: 'provider-unreachable' };
  }

  if (data.success === true) return { ok: true, reason: 'verified' };

  return { ok: false, reason: 'rejected', codes: data['error-codes'] ?? [] };
}

/** Logged at warn level because it means protection is off right now, which an operator should
 * be able to find later when the traffic graph looks strange. */
function logDegraded(detail: string): void {
  console.warn(
    JSON.stringify({
      event: 'bot_check_degraded',
      timestamp: new Date().toISOString(),
      detail,
    })
  );
}

/* =====================================================================================
 * Vercel BotId
 * ===================================================================================== */

export type BotIdResult =
  | { ok: true; reason: 'human' | 'bypassed' | 'unavailable' }
  | { ok: false; reason: 'bot'; verifiedBotName?: string };

/**
 * Classifies the CURRENT request. Takes no argument: BotId reads the request out of the
 * platform's own context (falling back to `next/headers`), so it only works inside a request
 * scope — which every caller here is.
 *
 * Verified good bots are refused alongside bad ones. That is not an oversight: this runs only on
 * routes that spend money, all of them POST, and Googlebot has no business POSTing a resume.
 * Refusing them costs nothing in crawlability, because the pages worth crawling are GETs that
 * never reach this code.
 */
export async function checkBotSignal(): Promise<BotIdResult> {
  try {
    const result = await checkBotId();

    // Development, and any environment BotId decided not to judge. It said so explicitly rather
    // than failing, so this is a pass, not a degradation.
    if (result.bypassed) return { ok: true, reason: 'bypassed' };

    if (result.isBot || result.isVerifiedBot) {
      return {
        ok: false,
        reason: 'bot',
        verifiedBotName: 'verifiedBotName' in result ? result.verifiedBotName : undefined,
      };
    }

    return { ok: true, reason: 'human' };
  } catch (error) {
    // Thrown when there is no OIDC token — i.e. not deployed on Vercel, or the project's OIDC
    // setting is off. Also covers the API being unreachable. Fail open and say so loudly; the
    // rate limiters and the daily budget are still underneath.
    logDegraded(
      `botid unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ok: true, reason: 'unavailable' };
  }
}
