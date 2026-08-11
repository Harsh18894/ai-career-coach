/**
 * Every abuse ceiling in the app, in one place.
 *
 * These are not tuning knobs for quality — they are the boundary between "a person using the
 * demo" and "a script pointed at it". The app is public, unauthenticated, and spends real money
 * per request, so anything a caller controls the size of has to have a number written next to it
 * here rather than being left to whatever the runtime happens to accept.
 *
 * Kept dependency-free (no next/server, no node builtins, no zod) so the browser can import the
 * same constants it is being held to. A limit the client knows about becomes a character counter
 * instead of a rejected request.
 *
 * Sizing principle: generous enough that no honest user ever meets one, small enough that
 * meeting one repeatedly cannot drain the daily budget. Where those conflict, the budget wins —
 * see lib/rate-limit.ts, which is the layer that actually bounds the damage.
 */

export const LIMITS = {
  /* ---------------------------------------------------------------------------------
   * Text the user types or pastes
   * ------------------------------------------------------------------------------- */

  /** One chat message. Long enough for someone to paste a paragraph about their situation;
   * far short of the 1.4M-token request a 5 MB body would have produced. */
  maxChatMessageChars: 4_000,

  /** Messages in one request's history array. The coach only sends the newest 16 to the model
   * (see streamChatTurn's HISTORY_WINDOW), so this bounds what must be parsed and held, not
   * what is billed. A real session ends long before this. */
  maxMessagesPerRequest: 200,

  /** A resume. Roughly 8-10 pages of dense text — well past any resume worth reviewing, and
   * the point past which the reviewer is being used as a document summariser. */
  maxResumeChars: 40_000,

  /** A job description. Postings are shorter than resumes in practice; the headroom is for
   * sites that wrap the posting in boilerplate. */
  maxJobDescriptionChars: 30_000,

  /** One guided-intake answer, and one free-text field (change requests, roadmap feedback). */
  maxShortAnswerChars: 2_000,

  /** Items in any client-supplied string array (skills, domains, rejected directions, shown
   * path titles). Prevents a 10,000-element array of empty strings reaching a prompt. */
  maxArrayItems: 100,

  /** One element of such an array. */
  maxArrayItemChars: 500,

  /* ---------------------------------------------------------------------------------
   * Transport
   * ------------------------------------------------------------------------------- */

  /** Hard cap on a JSON request body, enforced by reading the stream with a running byte count
   * rather than by trusting Content-Length. Comfortably above the largest legitimate body (a
   * 40k-char resume plus a 30k-char job description, JSON-escaped) and far below what the
   * platform would otherwise buffer. */
  maxJsonBodyBytes: 512 * 1024,

  /** Uploaded PDF. Unchanged from what app/api/parse-resume already enforced — restated here
   * so there is one place to look rather than a magic number in a route. */
  maxUploadBytes: 5 * 1024 * 1024,

  /* ---------------------------------------------------------------------------------
   * Per-session ceilings (see lib/rate-limit.ts)
   *
   * IMPORTANT: the session id is supplied by the client (x-aria-session-id) and is therefore
   * trivially rotated. These two ceilings stop a runaway client, a retry loop, or one person
   * leaving a tab open overnight — they are NOT a control against someone who is deliberately
   * evading them. The per-IP limiters and the global daily budget are what bound that case.
   * ------------------------------------------------------------------------------- */

  /** Total model calls attributable to one session id. A full coaching session is 15-25; a
   * resume review is 3. Reaching 120 means something is looping. */
  maxLlmCallsPerSession: 120,

  /** Total tokens (prompt + completion) attributable to one session id. A full coaching
   * session lands well under 100k. */
  maxTokensPerSession: 400_000,
} as const;

/** Bytes, formatted for a message a person reads. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
