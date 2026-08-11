import { describe, it, expect, vi, afterEach } from 'vitest';
import { isBlockedAddress, validateOutboundUrl } from './ssrf';
import { isKnownBlockingHost } from './index';

/* =====================================================================================
 * SSRF guards. Entirely deterministic apart from the DNS lookups, which are mocked — no
 * outbound request is made by any test here.
 *
 * These are the checks that stop a stranger pointing this server at cloud metadata or at the
 * private network it runs in, so they are worth over-testing rather than under-testing.
 * ===================================================================================== */

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('node:dns/promises');
});

/** Runs validateOutboundUrl with DNS stubbed to return the given addresses. */
async function validateWithDns(url: string, addresses: string[] | Error) {
  vi.resetModules();
  const lookup = async () => {
    if (addresses instanceof Error) throw addresses;
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  vi.doMock('node:dns/promises', () => ({ lookup, default: { lookup } }));
  const { validateOutboundUrl: validate } = await import('./ssrf');
  return validate(url);
}

describe('isBlockedAddress — IPv4', () => {
  it.each([
    ['169.254.169.254', 'cloud metadata (AWS/GCP/Azure IMDS)'],
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback, whole /8'],
    ['0.0.0.0', 'unspecified'],
    ['10.0.0.5', 'RFC1918'],
    ['172.16.0.1', 'RFC1918'],
    ['172.31.255.255', 'RFC1918 upper bound'],
    ['192.168.1.1', 'RFC1918'],
    ['100.64.0.1', 'CGNAT'],
    ['192.0.0.192', 'Oracle metadata'],
    ['169.254.1.1', 'link-local'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['198.18.0.1', 'benchmarking'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([['8.8.8.8'], ['1.1.1.1'], ['93.184.216.34'], ['172.32.0.1'], ['11.0.0.1']])(
    'allows the public address %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    }
  );

  it('treats 172.32.0.0 as public — the RFC1918 block ends at 172.31', () => {
    expect(isBlockedAddress('172.15.255.255')).toBe(false);
    expect(isBlockedAddress('172.16.0.0')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('172.32.0.0')).toBe(false);
  });
});

describe('isBlockedAddress — IPv6', () => {
  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fc00::1', 'unique local'],
    ['fd12:3456::1', 'unique local'],
    ['fe80::1', 'link-local'],
    ['ff02::1', 'multicast'],
    ['64:ff9b::1', 'NAT64'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it('unwraps IPv4-mapped addresses instead of waving them through', () => {
    // ::ffff:169.254.169.254 is the metadata endpoint wearing a v6 costume. Judging it only
    // by the v6 rules would let it straight through.
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('strips a zone id before judging', () => {
    expect(isBlockedAddress('fe80::1%eth0')).toBe(true);
  });

  it('allows a public v6 address', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('refuses anything that is not an IP at all', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});

describe('validateOutboundUrl — rejected before any request is made', () => {
  it('rejects the cloud metadata endpoint by IP literal', async () => {
    // The acceptance criterion, stated directly.
    const result = await validateOutboundUrl('http://169.254.169.254/');
    expect(result.ok).toBe(false);
  });

  it('rejects the metadata endpoint even over https', async () => {
    const result = await validateOutboundUrl('https://169.254.169.254/latest/meta-data/');
    expect(result).toMatchObject({ ok: false, reason: 'private-address' });
  });

  it('rejects localhost by name', async () => {
    const result = await validateWithDns('https://localhost:3000/', ['127.0.0.1']);
    // Port is checked first here, but either rejection is correct and neither reaches the network.
    expect(result.ok).toBe(false);
  });

  it('rejects http://localhost:3000 — the app itself', async () => {
    const result = await validateOutboundUrl('http://localhost:3000');
    expect(result).toMatchObject({ ok: false, reason: 'scheme-not-https' });
  });

  it('rejects a hostname that resolves to a private address', async () => {
    // The classic bypass: a public name with a private A record.
    const result = await validateWithDns('https://internal.example.com/job', ['10.0.0.7']);
    expect(result).toMatchObject({ ok: false, reason: 'private-address' });
  });

  it('rejects when ANY resolved address is private, not just all of them', async () => {
    const result = await validateWithDns('https://split.example.com/job', ['93.184.216.34', '127.0.0.1']);
    expect(result).toMatchObject({ ok: false, reason: 'private-address' });
  });

  it('rejects non-https schemes', async () => {
    for (const url of ['http://example.com', 'file:///etc/passwd', 'gopher://example.com', 'ftp://example.com']) {
      expect((await validateOutboundUrl(url)).ok, url).toBe(false);
    }
  });

  it('rejects a non-default port', async () => {
    const result = await validateWithDns('https://example.com:8080/job', ['93.184.216.34']);
    expect(result).toMatchObject({ ok: false, reason: 'non-default-port' });
  });

  it('rejects a hostname that does not resolve', async () => {
    const result = await validateWithDns('https://nope.invalid/job', new Error('ENOTFOUND'));
    expect(result).toMatchObject({ ok: false, reason: 'dns-resolution-failed' });
  });

  it('rejects malformed input', async () => {
    expect((await validateOutboundUrl('not a url')).ok).toBe(false);
    expect((await validateOutboundUrl('')).ok).toBe(false);
  });

  it('rejects a bracketed IPv6 loopback literal', async () => {
    const result = await validateOutboundUrl('https://[::1]/job');
    expect(result).toMatchObject({ ok: false, reason: 'private-address' });
  });
});

describe('validateOutboundUrl — accepted', () => {
  it('accepts a public https URL on the default port', async () => {
    const result = await validateWithDns('https://boards.greenhouse.io/acme/jobs/123', ['93.184.216.34']);
    expect(result.ok).toBe(true);
  });

  it('accepts an explicit :443', async () => {
    const result = await validateWithDns('https://example.com:443/job', ['93.184.216.34']);
    expect(result.ok).toBe(true);
  });
});

describe('isKnownBlockingHost', () => {
  it.each([
    'www.linkedin.com',
    'linkedin.com',
    'uk.indeed.com',
    'indeed.com',
    'www.glassdoor.co.uk',
    'www.naukri.com',
  ])('recognises %s as a site that blocks server-side fetching', (hostname) => {
    expect(isKnownBlockingHost(hostname)).toBe(true);
  });

  it.each(['boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com', 'careers.example.com'])(
    'does not flag %s',
    (hostname) => {
      expect(isKnownBlockingHost(hostname)).toBe(false);
    }
  );

  it('does not match a lookalike domain that merely contains the name', () => {
    // "notlinkedin.com" is a different site; the pattern is anchored for a reason.
    expect(isKnownBlockingHost('notlinkedin.com')).toBe(false);
    expect(isKnownBlockingHost('linkedin.com.evil.example')).toBe(false);
  });
});
