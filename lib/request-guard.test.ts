import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from './errors';
import { LIMITS } from './limits';
import { assertTrustedOrigin, readJsonBody, summarizeZodError } from './request-guard';

/* =====================================================================================
 * The guard is the only thing standing between a public URL and an unbounded prompt, so its
 * failure modes are worth pinning down rather than assuming.
 *
 * The case that motivated most of this: before the byte-counting reader, a 5.7 MB body was
 * accepted with a 200. Not "rejected slowly" — accepted.
 * ===================================================================================== */

const ORIGIN = 'http://localhost:3000';

function jsonRequest(
  body: string | Uint8Array,
  init: { origin?: string | null; contentType?: string | null; contentLength?: string } = {}
): NextRequest {
  const { origin = ORIGIN, contentType = 'application/json', contentLength } = init;

  const headers = new Headers({ host: 'localhost:3000' });
  if (origin !== null) headers.set('origin', origin);
  if (contentType !== null) headers.set('content-type', contentType);
  if (contentLength !== undefined) headers.set('content-length', contentLength);

  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;

  // `duplex` is required by undici whenever a body is present on a manually constructed
  // Request, but it is absent from the DOM RequestInit type — hence the assertion rather than
  // an intersection type, which trips over RequestInit's stricter `signal`.
  const requestInit = { method: 'POST', headers, body: bytes, duplex: 'half' } as unknown as
    ConstructorParameters<typeof NextRequest>[1];
  return new NextRequest(`${ORIGIN}/api/test`, requestInit);
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no-error';
  } catch (error) {
    return error instanceof AppError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe('readJsonBody', () => {
  it('parses a well-formed body', async () => {
    const body = await readJsonBody(jsonRequest(JSON.stringify({ hello: 'world' })));
    expect(body).toEqual({ hello: 'world' });
  });

  it('accepts a content-type with parameters', async () => {
    const request = jsonRequest(JSON.stringify({ ok: true }), {
      contentType: 'application/json; charset=utf-8',
    });
    await expect(readJsonBody(request)).resolves.toEqual({ ok: true });
  });

  it('rejects a non-JSON content type', async () => {
    const request = jsonRequest('hello', { contentType: 'text/plain' });
    expect(await codeOf(readJsonBody(request))).toBe('INVALID_REQUEST');
  });

  it('rejects a missing content type', async () => {
    const request = jsonRequest('{}', { contentType: null });
    expect(await codeOf(readJsonBody(request))).toBe('INVALID_REQUEST');
  });

  it('rejects a body that is not valid JSON', async () => {
    const request = jsonRequest('{ not json');
    expect(await codeOf(readJsonBody(request))).toBe('INVALID_REQUEST');
  });

  it('rejects an empty body', async () => {
    const request = jsonRequest('   ');
    expect(await codeOf(readJsonBody(request))).toBe('INVALID_REQUEST');
  });

  it('rejects a body over the cap', async () => {
    const oversized = JSON.stringify({ pad: 'A'.repeat(2_048) });
    const request = jsonRequest(oversized);
    expect(await codeOf(readJsonBody(request, { maxBytes: 1_024 }))).toBe('INVALID_REQUEST');
  });

  it('rejects on a lying Content-Length, because the count over the stream is what enforces the cap', async () => {
    // Content-Length claims the body is tiny. Trusting it was the bug this test exists for.
    const oversized = JSON.stringify({ pad: 'A'.repeat(4_096) });
    const request = jsonRequest(oversized, { contentLength: '10' });
    expect(await codeOf(readJsonBody(request, { maxBytes: 1_024 }))).toBe('INVALID_REQUEST');
  });

  it('refuses an oversized body without buffering it, via Content-Length, when one is declared honestly', async () => {
    const request = jsonRequest('{}', { contentLength: String(LIMITS.maxJsonBodyBytes + 1) });
    expect(await codeOf(readJsonBody(request))).toBe('INVALID_REQUEST');
  });

  it('accepts a body exactly at the cap', async () => {
    // Exercises the boundary in the direction that would break real users if it were wrong.
    const payload = JSON.stringify({ pad: 'A'.repeat(900) });
    const size = new TextEncoder().encode(payload).byteLength;
    await expect(readJsonBody(jsonRequest(payload), { maxBytes: size })).resolves.toBeTruthy();
  });
});

describe('assertTrustedOrigin', () => {
  it('accepts the deployment\'s own origin', () => {
    expect(() => assertTrustedOrigin(jsonRequest('{}'))).not.toThrow();
  });

  it('accepts localhost', () => {
    expect(() => assertTrustedOrigin(jsonRequest('{}', { origin: 'http://127.0.0.1:3000' }))).not.toThrow();
  });

  it('rejects a foreign origin', () => {
    expect(() => assertTrustedOrigin(jsonRequest('{}', { origin: 'https://evil.example' }))).toThrow(AppError);
  });

  it('rejects a request with no Origin or Referer — the shape a bare curl has', () => {
    expect(() => assertTrustedOrigin(jsonRequest('{}', { origin: null }))).toThrow(AppError);
  });

  it('rejects an unparseable Origin', () => {
    expect(() => assertTrustedOrigin(jsonRequest('{}', { origin: 'not-a-url' }))).toThrow(AppError);
  });

  it('is defeated by one header, which is the point of documenting it as a speed bump', () => {
    // This test asserts the LIMIT of the control, so nobody later reads the check above and
    // concludes that reaching a handler means the request came from our page.
    const spoofed = jsonRequest('{}', { origin: 'http://localhost:3000' });
    expect(() => assertTrustedOrigin(spoofed)).not.toThrow();
  });
});

describe('summarizeZodError', () => {
  it('collapses whitespace and truncates', () => {
    const summary = summarizeZodError('a\n\n  b'.padEnd(600, 'x'), 50);
    expect(summary.length).toBeLessThanOrEqual(51);
    expect(summary).not.toContain('\n');
  });
});
