/**
 * Cloudflare Turnstile verification, applied to session creation only.
 *
 * Why this exists: the per-IP limiters assume a caller has one IP. A link on Reddit attracts
 * scripted traffic that does not — a residential proxy pool turns "5 sessions per hour" into
 * "5 sessions per hour, per address, times ten thousand addresses". Turnstile is the layer that
 * asks whether there is a browser on the other end at all, which is the question IP counting
 * cannot answer.
 *
 * Why Turnstile and not Vercel BotID: BotID needs the `botid` package, and adding a dependency
 * needed asking first. Turnstile needs a script tag and one fetch — no package, no build step.
 *
 * WHY SESSION CREATION ONLY: a token is single-use and takes a moment to mint. Gating every
 * chat turn would put that on the critical path of a conversation, which is the interaction
 * this whole app is. Gating the start bounds how many conversations can be created, and the
 * per-session ceilings from A2 bound what each one can then spend — so the expensive surface is
 * covered without a challenge sitting between a user and their next sentence.
 *
 * ============================ THE TWO FAILURE MODES ============================
 *
 * These are deliberately different, and the difference is the whole design:
 *
 *   Verification says NO      -> reject. Fail CLOSED. A token that Cloudflare rejects is the
 *                                signal this is here to act on.
 *   Cloudflare is UNREACHABLE -> allow, and log it. Fail OPEN, degrading to the per-IP limiters
 *                                and the daily budget. An outage on someone else's service must
 *                                not take this app down; the layers underneath still bound the
 *                                damage, which is what makes failing open affordable here.
 *
 * Unconfigured (no secret key) is a third state: the check is skipped entirely, exactly as
 * lib/rate-limit.ts skips when Upstash is absent, so local development needs no accounts.
 * ==============================================================================
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Sent by the browser on gated requests. A header rather than a body field so the multipart
 * resume upload carries it too, matching how session identity already travels. */
export const TURNSTILE_HEADER = 'x-aria-turnstile';

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
