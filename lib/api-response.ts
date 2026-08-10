import { NextResponse } from 'next/server';
import { AppError, type ApiErrorBody, type ErrorCode, httpStatusFor, toAppError } from './errors';

/**
 * The one way an API route reports failure.
 *
 * Kept apart from lib/errors.ts because that module is imported by client components, and
 * pulling `next/server` into the browser bundle for the sake of a message map is not a trade
 * worth making.
 *
 * Every route's catch block ends here, so an upstream message (an OpenAI error string, a Zod
 * issue dump) can never reach the browser: only a taxonomy code and its vetted copy do. The
 * original detail is logged server-side for debugging.
 */
export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  const appError = toAppError(error);

  const logLine = {
    event: 'api_error',
    timestamp: new Date().toISOString(),
    code: appError.code,
    detail: appError.detail ?? appError.message,
  };
  console.error(JSON.stringify(logLine));

  const headers: Record<string, string> = {};
  if (appError.retryAfterSeconds !== undefined) {
    headers['Retry-After'] = String(appError.retryAfterSeconds);
  }

  return NextResponse.json<ApiErrorBody>(appError.toBody(), {
    status: httpStatusFor(appError.code),
    headers,
  });
}

/** For failures a route detects itself (bad input, an unreadable PDF) rather than catching. */
export function failWith(code: ErrorCode, message?: string): NextResponse<ApiErrorBody> {
  return errorResponse(new AppError(code, { message }));
}
