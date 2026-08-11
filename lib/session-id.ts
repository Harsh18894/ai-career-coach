/**
 * Reading the client's session id off a request.
 *
 * Its own module, with no imports, because both lib/telemetry.ts (which writes the per-session
 * counters) and lib/rate-limit.ts (which reads them) need it, and telemetry already imports
 * rate-limit for the shared key prefix. Putting this in either one would close that into a
 * cycle.
 *
 * The id is client-supplied and unauthenticated. It is an attribution key, never an identity:
 * anything gated on it is gated against accident, not against intent. See the note on the
 * per-session ceilings in lib/limits.ts.
 */

export const SESSION_ID_HEADER = 'x-aria-session-id';

/** The fallback bucket for requests that carry no usable id. Shared deliberately — an
 * unattributed caller should be counted alongside other unattributed callers rather than
 * escaping the counters entirely by omitting a header. */
export const UNATTRIBUTED_SESSION_ID = 'unattributed';

const MAX_SESSION_ID_CHARS = 64;

export function sessionIdFromRequest(request: { headers: Headers }): string {
  const raw = request.headers.get(SESSION_ID_HEADER)?.trim();
  if (!raw || raw.length > MAX_SESSION_ID_CHARS) return UNATTRIBUTED_SESSION_ID;
  return raw;
}
