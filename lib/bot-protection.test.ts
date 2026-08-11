import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBotProtectionConfigured, verifyHumanToken } from './bot-protection';

/* =====================================================================================
 * The whole value of this module is in WHICH failure fails closed and which fails open, so
 * that is what these test. Getting it backwards would either lock every user out during a
 * Cloudflare incident, or wave through every bot that sends a junk token.
 * ===================================================================================== */

const SECRET = 'test-secret-key';

function mockSiteverify(response: { status?: number; body?: unknown } | Error) {
  // Params are declared (rather than inferred from an empty signature) so the assertions
  // below can read what was posted to Cloudflare.
  const fetchMock = vi.fn(async (_url: string, _init?: { body?: unknown }) => {
    if (response instanceof Error) throw response;
    return {
      ok: (response.status ?? 200) < 400,
      status: response.status ?? 200,
      json: async () => response.body ?? {},
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv('TURNSTILE_SECRET_KEY', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('when unconfigured', () => {
  it('skips the check entirely, so local development needs no Cloudflare account', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    const fetchMock = mockSiteverify({ body: { success: false } });

    const result = await verifyHumanToken(null);

    expect(result).toEqual({ ok: true, reason: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports itself as unconfigured', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    expect(isBotProtectionConfigured()).toBe(false);
  });
});

describe('fail closed', () => {
  it('rejects a missing token — the shape a bare curl has', async () => {
    mockSiteverify({ body: { success: true } });
    expect(await verifyHumanToken(null)).toEqual({ ok: false, reason: 'missing-token' });
  });

  it('rejects an empty-string token', async () => {
    mockSiteverify({ body: { success: true } });
    expect(await verifyHumanToken('   ')).toEqual({ ok: false, reason: 'missing-token' });
  });

  it('rejects a token Cloudflare says is invalid', async () => {
    mockSiteverify({ body: { success: false, 'error-codes': ['invalid-input-response'] } });

    const result = await verifyHumanToken('forged-token');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'rejected', codes: ['invalid-input-response'] });
  });

  it('rejects an absurdly long token without calling out to Cloudflare', async () => {
    const fetchMock = mockSiteverify({ body: { success: true } });

    const result = await verifyHumanToken('x'.repeat(3_000));

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fail open', () => {
  it('allows the request when Cloudflare is unreachable', async () => {
    mockSiteverify(new Error('getaddrinfo ENOTFOUND challenges.cloudflare.com'));
    expect(await verifyHumanToken('a-real-token')).toEqual({ ok: true, reason: 'provider-unreachable' });
  });

  it('allows the request when Cloudflare returns a 5xx', async () => {
    // A 500 from the verifier is their problem, not a verdict on this token. Treating it as a
    // rejection would turn their incident into ours.
    mockSiteverify({ status: 503 });
    expect(await verifyHumanToken('a-real-token')).toEqual({ ok: true, reason: 'provider-unreachable' });
  });

  it('allows the request when verification times out', async () => {
    mockSiteverify(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    expect(await verifyHumanToken('a-real-token')).toEqual({ ok: true, reason: 'provider-unreachable' });
  });
});

describe('the happy path', () => {
  it('accepts a token Cloudflare verifies', async () => {
    mockSiteverify({ body: { success: true } });
    expect(await verifyHumanToken('a-real-token')).toEqual({ ok: true, reason: 'verified' });
  });

  it('forwards the client IP so the token is bound to who solved it', async () => {
    const fetchMock = mockSiteverify({ body: { success: true } });

    await verifyHumanToken('a-real-token', '203.0.113.7');

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('remoteip')).toBe('203.0.113.7');
    expect(body.get('secret')).toBe(SECRET);
  });

  it('omits the placeholder IP rather than sending "unknown" to Cloudflare', async () => {
    const fetchMock = mockSiteverify({ body: { success: true } });

    await verifyHumanToken('a-real-token', 'unknown');

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.has('remoteip')).toBe(false);
  });
});
