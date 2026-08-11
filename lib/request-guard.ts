import { NextRequest } from 'next/server';
import { AppError } from './errors';
import { LIMITS, formatBytes } from './limits';

/* =====================================================================================
 * What every JSON route does before it looks at a body.
 *
 * Three checks, in this order, because each one is cheaper than the next and each one makes
 * the next one safe to perform:
 *
 *   1. Origin  — is this plausibly our own page? (a speed bump, see below)
 *   2. Content-Type — is this even claiming to be JSON?
 *   3. Size    — read the stream with a running byte count, aborting the moment it goes over
 *
 * Point 3 is the one that matters. `await request.json()` buffers the entire body before any
 * code of ours runs, so a caller could hand the server megabytes and have them read, parsed,
 * and forwarded into a prompt before a single limit was consulted. Reading the stream manually
 * is the only way to refuse a body rather than merely disapprove of one after the fact.
 * ===================================================================================== */

/**
 * Rejects requests whose Origin is neither this deployment nor localhost.
 *
 * THIS IS NOT A SECURITY CONTROL. The Origin header is set by the caller, so anyone who reads
 * this file — or who types `-H 'Origin: ...'` once — walks straight through it. Nothing else in
 * the app may be built on the assumption that a request reaching a handler came from our page.
 *
 * It is here because it is nearly free and it removes the laziest 90% of scripted traffic: a
 * copy-pasted curl command, a quick Python loop, someone poking the endpoints they found in the
 * network tab. Raising the effort from "zero" to "one flag" is worth four lines when the app is
 * about to be linked publicly. Judge it as a cost filter, not as authentication.
 *
 * Matched against the request's own Host rather than a configured domain, so Vercel preview
 * deployments (whose hostnames vary per commit) work without a list to maintain.
 */
export function assertTrustedOrigin(request: NextRequest): void {
  const origin = request.headers.get('origin');

  // Browsers send Origin on every POST, same-origin included. Its absence means the caller is
  // not a browser — which is exactly the traffic this is here to discourage. Referer is
  // accepted as a fallback for the rare privacy tool that strips Origin but not Referer.
  const referer = request.headers.get('referer');
  const candidate = origin ?? referer;
  if (!candidate) {
    throw new AppError('INVALID_REQUEST', { detail: 'origin check: no Origin or Referer header.' });
  }

  let candidateHost: string;
  try {
    candidateHost = new URL(candidate).host;
  } catch {
    throw new AppError('INVALID_REQUEST', { detail: `origin check: unparseable Origin/Referer "${candidate}".` });
  }

  // x-forwarded-host is what the browser actually addressed when a proxy sits in front; `host`
  // is the direct value. Either matching is enough.
  const expected = [request.headers.get('x-forwarded-host'), request.headers.get('host')].filter(
    (value): value is string => Boolean(value)
  );

  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(candidateHost);
  if (isLocal || expected.includes(candidateHost)) return;

  throw new AppError('INVALID_REQUEST', {
    detail: `origin check: "${candidateHost}" is not among [${expected.join(', ')}].`,
  });
}

function assertJsonContentType(request: NextRequest): void {
  const contentType = request.headers.get('content-type') ?? '';
  // Parameters are allowed (`application/json; charset=utf-8`), the base type is not negotiable.
  if (!contentType.split(';')[0]?.trim().toLowerCase().startsWith('application/json')) {
    throw new AppError('INVALID_REQUEST', {
      detail: `content-type check: expected application/json, got "${contentType || '(none)'}".`,
    });
  }
}

function tooLargeError(seenBytes: number, maxBytes: number): AppError {
  return new AppError('INVALID_REQUEST', {
    message: `That request was larger than the ${formatBytes(maxBytes)} this demo accepts. If you pasted a very long document, try a shorter version.`,
    detail: `body size check: ${seenBytes} bytes exceeds the ${maxBytes}-byte cap.`,
  });
}

/**
 * Reads the body as text, refusing to buffer more than `maxBytes`.
 *
 * Content-Length is checked first as a courtesy — it lets an honest oversized request be
 * refused without transferring it — but it is never trusted as the actual limit: it is absent
 * under chunked encoding and can simply be wrong. The running count over the stream is what
 * enforces the cap.
 */
async function readBoundedText(request: NextRequest, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw tooLargeError(declared, maxBytes);
  }

  const body = request.body;
  if (!body) return '';

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        // Stop pulling. The connection is torn down mid-upload rather than politely receiving
        // the rest of something already known to be refused.
        await reader.cancel();
        throw tooLargeError(total, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(joined);
}

/**
 * The one entry point for reading a JSON request body.
 *
 * Returns `unknown` on purpose: it has proved the body is JSON of a permitted size and nothing
 * more. Proving it is the RIGHT JSON is the caller's Zod schema's job, and typing this as
 * anything friendlier would invite routes to skip that step.
 *
 * Throws AppError('INVALID_REQUEST'), which every route's existing catch block already turns
 * into the standard envelope via errorResponse — so a malformed request produces a typed 400
 * instead of the 500 an unguarded `request.json()` throws.
 */
export async function readJsonBody(
  request: NextRequest,
  options: { maxBytes?: number; checkOrigin?: boolean } = {}
): Promise<unknown> {
  const { maxBytes = LIMITS.maxJsonBodyBytes, checkOrigin = true } = options;

  if (checkOrigin) assertTrustedOrigin(request);
  assertJsonContentType(request);

  const text = await readBoundedText(request, maxBytes);
  if (!text.trim()) {
    throw new AppError('INVALID_REQUEST', { detail: 'body check: empty body.' });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('INVALID_REQUEST', { detail: 'body check: body was not valid JSON.' });
  }
}

/**
 * Multipart equivalent for the one route that takes an upload. The size cap on the file itself
 * still lives in the route, next to the PDF-specific checks it belongs with — this only covers
 * the parts that are the same for every route.
 */
export function guardMultipartRequest(request: NextRequest): void {
  assertTrustedOrigin(request);

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new AppError('INVALID_REQUEST', {
      detail: `content-type check: expected multipart/form-data, got "${contentType || '(none)'}".`,
    });
  }

  const declared = Number(request.headers.get('content-length'));
  // A little headroom over the file cap for the multipart envelope and the other fields.
  const envelopeCap = LIMITS.maxUploadBytes + 64 * 1024;
  if (Number.isFinite(declared) && declared > envelopeCap) {
    throw tooLargeError(declared, LIMITS.maxUploadBytes);
  }
}

/** Zod's `.message` is a JSON dump of every issue. Useful in a log line, far too long and far
 * too internal to be one — this trims it to something greppable. */
export function summarizeZodError(message: string, maxChars = 400): string {
  const collapsed = message.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars)}…` : collapsed;
}
