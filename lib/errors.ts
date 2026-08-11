/**
 * The single error taxonomy for the app — shared by server and client.
 *
 * Rules this file exists to enforce:
 *  - Every failure that can reach a user has a code, and every code has one specific,
 *    non-technical message. No raw stack traces, no model output, no "Something went wrong."
 *  - Every API route returns the same JSON envelope, so the client never has to guess.
 *
 * Kept dependency-free (no next/server, no node builtins) so client components can import the
 * message map without pulling server code into the bundle.
 */

export const ERROR_CODES = [
  'RATE_LIMITED',
  'BUDGET_EXCEEDED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'INVALID_OUTPUT',
  'RESUME_PARSE_FAILED',
  'JOB_FETCH_FAILED',
  'INVALID_REQUEST',
  'SESSION_LIMIT_REACHED',
  'BOT_CHECK_FAILED',
  'UNKNOWN',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** The envelope every API route returns on failure. */
export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
};

/* =====================================================================================
 * User-facing copy
 *
 * Written for a candidate mid-conversation, not for a developer. Each one says what
 * happened in plain terms and what they can do next. "Your conversation is saved" is
 * literally true — state is persisted to localStorage on every change.
 * ===================================================================================== */

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  RATE_LIMITED:
    "You've hit this demo's hourly usage limit. Your conversation is saved — check back in a little while to pick up where you left off.",
  BUDGET_EXCEEDED:
    'This demo has reached its spending limit for today. It runs on a personal API budget — please check back tomorrow.',
  UPSTREAM_TIMEOUT:
    'Aria took too long to answer and the request timed out. Nothing was lost — you can try that again.',
  UPSTREAM_ERROR:
    'Aria could not be reached just now. This is usually brief — your conversation is saved, so try that again.',
  INVALID_OUTPUT:
    "Aria's answer came back malformed twice in a row, so it was discarded rather than shown to you. Trying again usually works.",
  RESUME_PARSE_FAILED:
    "We couldn't read any text from that PDF. If it's a scan or an image, paste your resume text instead.",
  JOB_FETCH_FAILED:
    "We couldn't read that link. Many job sites block automated access — paste the job description text instead and everything else works the same.",
  // Deliberately vague about WHICH rule was broken. A malformed request is almost always this
  // app's own client having a bug, and the one case where a person caused it — pasting
  // something enormous — is given specific copy at the call site via failWith's `message`.
  INVALID_REQUEST:
    "That request couldn't be processed as sent. If you were typing or pasting something very long, try trimming it; otherwise reloading the page usually clears it.",
  SESSION_LIMIT_REACHED:
    'This session has reached the usage ceiling for the demo. Everything so far is saved — start a new session to keep going.',
  // Written for the person this misjudges, not for the bots it is aimed at — so it says what
  // to do (reload) rather than accusing them of being a script.
  BOT_CHECK_FAILED:
    "We couldn't verify that this is a regular browser session. Reload the page and try once more — if it keeps happening, a privacy extension or a strict network may be blocking the check.",
  UNKNOWN: 'Aria ran into an unexpected problem on that step. Your conversation is saved — try that again.',
};

/** HTTP status per code. Kept here so routes never pick a status by hand. */
const HTTP_STATUS: Record<ErrorCode, number> = {
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 429,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  INVALID_OUTPUT: 502,
  RESUME_PARSE_FAILED: 422,
  // 422, not 502: the request was well-formed and the server worked correctly — the remote
  // site simply cannot be read from. Treating it as an upstream error would imply something
  // is broken here, and would invite the client to retry rather than to paste.
  JOB_FETCH_FAILED: 422,
  // 400 covers the lot — wrong content type, unparseable JSON, a body over the cap, a field
  // over its cap. Splitting these into 415/413/422 would tell an abusive caller exactly which
  // wall they hit and tells a legitimate client nothing it can act on differently.
  INVALID_REQUEST: 400,
  SESSION_LIMIT_REACHED: 429,
  // 403, not 429: nothing about waiting changes this outcome.
  BOT_CHECK_FAILED: 403,
  UNKNOWN: 500,
};

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code];
}

/** Whether the UI should offer the paste-your-text fallback as the next action. Both of these
 * have the same shape: something could not be read, and typing it in always works. */
export function offersPasteFallback(code: ErrorCode): boolean {
  return code === 'RESUME_PARSE_FAILED' || code === 'JOB_FETCH_FAILED';
}

/** Whether the UI should offer a Retry button. A budget or rate limit will not clear on a
 * second click, so offering one there would be a lie. */
export function isRetryable(code: ErrorCode): boolean {
  return code === 'UPSTREAM_TIMEOUT' || code === 'UPSTREAM_ERROR' || code === 'INVALID_OUTPUT' || code === 'UNKNOWN';
}

/* =====================================================================================
 * AppError
 * ===================================================================================== */

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterSeconds?: number;
  /** Operator-facing detail. Logged, never sent to the client. */
  readonly detail?: string;

  constructor(
    code: ErrorCode,
    options: { message?: string; retryAfterSeconds?: number; detail?: string; cause?: unknown } = {}
  ) {
    super(options.message ?? ERROR_MESSAGES[code], { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.detail = options.detail;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfterSeconds !== undefined ? { retryAfterSeconds: this.retryAfterSeconds } : {}),
      },
    };
  }
}

/* =====================================================================================
 * Classification
 * ===================================================================================== */

type UpstreamErrorShape = { status?: number; name?: string; code?: string; message?: string };

/**
 * Whether a thrown value came from the OpenAI SDK.
 *
 * The SDK does NOT set `.name` on its error classes — an APIConnectionTimeoutError reports
 * `name === 'Error'` — so name matching silently fails. It does always define `status` and
 * `headers` (both undefined for connection-level failures), which is a reliable structural
 * marker and does not require importing the SDK into a module the client bundles.
 */
function isSdkError(error: unknown): error is UpstreamErrorShape {
  return error instanceof Error && 'status' in error && 'headers' in error;
}

/** Connection-level SDK failures carry no HTTP status; the SDK distinguishes them by message. */
function isConnectionLevel(error: UpstreamErrorShape): boolean {
  return error.status === undefined;
}

function isTimeoutMessage(error: UpstreamErrorShape): boolean {
  return /timed out|timeout/i.test(error.message ?? '');
}

/**
 * Maps a thrown OpenAI SDK error to a taxonomy code.
 *
 * A 400 is deliberately classified as UPSTREAM_ERROR and never retried: a bad request is our
 * bug (a malformed prompt or param), and retrying it just burns budget to fail identically.
 */
export function classifyUpstreamError(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;

  const err = error as UpstreamErrorShape;

  if (err?.name === 'AbortError' || err?.code === 'ETIMEDOUT') return 'UPSTREAM_TIMEOUT';
  if (err?.code === 'ECONNRESET') return 'UPSTREAM_ERROR';

  if (isSdkError(error)) {
    if (isConnectionLevel(error)) {
      return isTimeoutMessage(error) ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR';
    }
    if (error.status === 429) return 'RATE_LIMITED';
    return 'UPSTREAM_ERROR';
  }

  if (typeof err?.status === 'number') {
    if (err.status === 429) return 'RATE_LIMITED';
    return 'UPSTREAM_ERROR';
  }

  return 'UNKNOWN';
}

/**
 * Whether a failed upstream call is worth one more attempt: transient conditions only.
 * 429 and 5xx are; 400-class request errors are not.
 */
export function isRetryableUpstream(error: unknown): boolean {
  const err = error as UpstreamErrorShape;

  if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET') return true;

  if (isSdkError(error)) {
    // Timeouts and dropped connections are the canonical transient case.
    if (isConnectionLevel(error)) return true;
    if (error.status === 429) return true;
    return (error.status ?? 0) >= 500;
  }

  if (typeof err?.status === 'number') {
    if (err.status === 429) return true;
    return err.status >= 500;
  }

  // Anything that is not recognisably an upstream failure is our own bug. Retrying it would
  // just run the same broken code path again.
  return false;
}

/** Normalises anything thrown into an AppError, so a route never leaks an upstream message. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const code = classifyUpstreamError(error);
  return new AppError(code, {
    detail: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}

/* =====================================================================================
 * Client-side reading
 * ===================================================================================== */

export type ClientError = {
  code: ErrorCode;
  message: string;
  retryAfterSeconds?: number;
};

/**
 * Reads an API error response body into a ClientError.
 *
 * Tolerates the pre-taxonomy `{ error: "some string" }` shape that a few paths may still
 * produce, mapping it to UNKNOWN with the canonical copy rather than surfacing whatever
 * string the server happened to send.
 */
export function clientErrorFrom(data: unknown, fallbackCode: ErrorCode = 'UNKNOWN'): ClientError {
  if (data && typeof data === 'object') {
    const { error } = data as { error?: unknown };
    if (error && typeof error === 'object') {
      const { code, message, retryAfterSeconds } = error as {
        code?: unknown;
        message?: unknown;
        retryAfterSeconds?: unknown;
      };
      if (isErrorCode(code)) {
        return {
          code,
          // Prefer the server's message (it may be more specific, e.g. which PDF problem
          // occurred) but never render an empty string.
          message: typeof message === 'string' && message ? message : ERROR_MESSAGES[code],
          ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
        };
      }
    }
  }
  return { code: fallbackCode, message: ERROR_MESSAGES[fallbackCode] };
}

/**
 * A client-side thrown value carrying a code, so the fetch helpers can keep using
 * throw/catch while preserving the taxonomy.
 */
export class ClientApiError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(clientError: ClientError) {
    super(clientError.message);
    this.name = 'ClientApiError';
    this.code = clientError.code;
    this.retryAfterSeconds = clientError.retryAfterSeconds;
  }

  toClientError(): ClientError {
    return {
      code: this.code,
      message: this.message,
      ...(this.retryAfterSeconds !== undefined ? { retryAfterSeconds: this.retryAfterSeconds } : {}),
    };
  }
}

/** Anything caught in a client handler → a ClientError with real copy. */
export function asClientError(error: unknown): ClientError {
  if (error instanceof ClientApiError) return error.toClientError();
  return { code: 'UNKNOWN', message: ERROR_MESSAGES.UNKNOWN };
}
