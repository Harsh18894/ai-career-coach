import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/* =====================================================================================
 * SSRF guards for fetching a user-supplied job URL.
 *
 * The server is about to make an HTTP request to an address a stranger chose. Without these
 * checks that is a request forgery primitive: a visitor could point it at cloud metadata
 * (169.254.169.254 hands out IAM credentials on AWS/GCP/Azure), at localhost to reach this
 * app's own internals, or at anything else on the private network the function runs in.
 *
 * The posture is allowlist-by-shape, denylist-by-address:
 *   - https only, default port only
 *   - hostname must resolve, and EVERY address it resolves to must be public
 *   - re-validated after each redirect, capped at 3 hops
 *
 * Residual risk, stated rather than papered over: this validates the address at resolution
 * time, then `fetch` resolves again when it connects. A DNS rebinding attack that returns a
 * public IP on the first lookup and a private one on the second would slip through. Closing
 * that properly means pinning the connection to the validated IP, which cannot be done with
 * undici's fetch without breaking TLS hostname verification. For a public demo fetching job
 * boards this is an accepted risk; a system handling sensitive internal networks should use a
 * pinned-IP HTTP agent or an egress proxy instead.
 * ===================================================================================== */

export type UrlRejection =
  | 'not-a-url'
  | 'scheme-not-https'
  | 'non-default-port'
  | 'hostname-missing'
  | 'dns-resolution-failed'
  | 'private-address';

export type UrlValidation =
  | { ok: true; url: URL; addresses: string[] }
  | { ok: false; reason: UrlRejection; detail: string };

/** Max redirect hops. Each one is re-validated; a chain longer than this is a redirector
 * loop or an attempt to launder a destination through a public hop. */
export const MAX_REDIRECTS = 3;

/* ---- IPv4 ------------------------------------------------------------------------------ */

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function cidr(block: string): { base: number; mask: number } {
  const [address, bitsRaw] = block.split('/');
  const base = ipv4ToInt(address);
  const bits = Number(bitsRaw);
  if (base === null || !Number.isInteger(bits)) throw new Error(`bad CIDR: ${block}`);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

/** Everything that is not public, routable, third-party internet. */
const BLOCKED_IPV4 = [
  '0.0.0.0/8', // "this network"
  '10.0.0.0/8', // RFC1918 private
  '100.64.0.0/10', // CGNAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local — includes 169.254.169.254, the cloud metadata endpoint
  '172.16.0.0/12', // RFC1918 private
  '192.0.0.0/24', // IETF protocol assignments (includes 192.0.0.192, Oracle metadata)
  '192.0.2.0/24', // TEST-NET-1
  '192.88.99.0/24', // 6to4 relay anycast
  '192.168.0.0/16', // RFC1918 private
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved, includes 255.255.255.255
].map(cidr);

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true; // unparseable: refuse rather than guess
  return BLOCKED_IPV4.some(({ base, mask }) => ((value & mask) >>> 0) === base);
}

/* ---- IPv6 ------------------------------------------------------------------------------ */

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]; // strip zone id

  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible: unwrap and judge as IPv4, otherwise
  // ::ffff:169.254.169.254 would sail straight past the v6 checks below.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? normalized.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  if (normalized === '::' || normalized === '::1') return true; // unspecified, loopback
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(normalized)) return true; // ff00::/8 multicast
  if (/^64:ff9b::/.test(normalized)) return true; // NAT64, can reach private v4 space

  return false;
}

export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);
  return true; // not an IP at all: refuse
}

/* ---- URL validation --------------------------------------------------------------------- */

/**
 * Validates a candidate URL and resolves its hostname, rejecting unless EVERY resolved
 * address is public. All-not-any is deliberate: a hostname resolving to one public and one
 * private address is an attack shape, not a coincidence.
 */
export async function validateOutboundUrl(candidate: string): Promise<UrlValidation> {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: 'not-a-url', detail: 'That is not a valid URL.' };
  }

  // https only. http would also expose the request to interception, and every real job board
  // serves https.
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme-not-https', detail: `scheme "${url.protocol}" is not https` };
  }

  // Default port only. A job posting is never on a custom port, and allowing arbitrary ports
  // widens the internal-port-scan surface for no product benefit.
  if (url.port !== '' && url.port !== '443') {
    return { ok: false, reason: 'non-default-port', detail: `port "${url.port}" is not allowed` };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // unwrap [::1] literal form
  if (!hostname) {
    return { ok: false, reason: 'hostname-missing', detail: 'URL has no hostname' };
  }

  // A bare IP literal never needs DNS, and must be judged directly.
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      return { ok: false, reason: 'private-address', detail: `${hostname} is not a public address` };
    }
    return { ok: true, url, addresses: [hostname] };
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    return { ok: false, reason: 'dns-resolution-failed', detail: `could not resolve ${hostname}` };
  }

  if (resolved.length === 0) {
    return { ok: false, reason: 'dns-resolution-failed', detail: `${hostname} resolved to no addresses` };
  }

  const blocked = resolved.filter((entry) => isBlockedAddress(entry.address));
  if (blocked.length > 0) {
    return {
      ok: false,
      reason: 'private-address',
      detail: `${hostname} resolves to a non-public address (${blocked.map((b) => b.address).join(', ')})`,
    };
  }

  return { ok: true, url, addresses: resolved.map((entry) => entry.address) };
}
