/**
 * Reads a human-readable message out of an API error body, tolerating both shapes currently
 * in flight:
 *
 *   { error: "some string" }                       — the original ad-hoc shape
 *   { error: { code, message, retryAfterSeconds } } — the typed envelope (lib/rate-limit.ts)
 *
 * Without this, a client doing `data.error || fallback` renders "[object Object]" the moment a
 * route returns the typed envelope. Task 3 folds this into the full error taxonomy, where the
 * `code` — not the message — drives what the UI shows; until then the server-supplied message
 * is already user-facing text, so surfacing it directly is correct.
 */
export function errorMessageFrom(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;

  const { error } = data as { error?: unknown };
  if (typeof error === 'string') return error || null;

  if (error && typeof error === 'object') {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string' && message) return message;
  }

  return null;
}
