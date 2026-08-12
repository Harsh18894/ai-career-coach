import { validateOutboundUrl, MAX_REDIRECTS, type UrlRejection } from './ssrf';
import type { JobDescription } from '../resume-review/schemas';

/* =====================================================================================
 * Job description ingestion.
 *
 * Paste is the primary path and lives entirely in the UI — it cannot fail. This module is the
 * convenience path: fetch a URL the user supplied and try to read a job posting out of it.
 *
 * It is designed around the assumption that fetching WILL often fail. LinkedIn and Indeed
 * block server-side fetching or require JS, and scraping them violates their terms. So every
 * failure mode here resolves to the same place — "we couldn't read that link, paste it
 * instead" — rather than to a retry loop or, worse, a job description invented from the URL
 * slug. Nothing here ever calls a model: a fabricated job description would poison the entire
 * against-job review, and there is no honest way to guess a posting's contents from its URL.
 * ===================================================================================== */

export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

const USER_AGENT = 'hachi-job-ingest/1.0 (+resume review; contact via site)';

export type IngestFailureReason =
  | UrlRejection
  | 'too-many-redirects'
  | 'blocked-by-site'
  | 'timeout'
  | 'response-too-large'
  | 'network-error'
  | 'no-content-extracted';

export type IngestResult =
  | { ok: true; job: JobDescription }
  | { ok: false; reason: IngestFailureReason; detail: string };

/* =====================================================================================
 * Structured providers
 *
 * Greenhouse, Lever and Ashby publish their postings through documented public JSON APIs.
 * Using those is better on every axis than scraping the rendered page: it is explicitly
 * offered rather than tolerated, it returns clean fields instead of guessed ones, and it does
 * not break when the page's markup changes.
 * ===================================================================================== */

type StructuredProvider = {
  name: string;
  matches: (url: URL) => boolean;
  /** Returns the API URL to fetch, or null when the posting URL doesn't parse. */
  apiUrl: (url: URL) => string | null;
  parse: (payload: unknown, sourceUrl: string) => JobDescription | null;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const GREENHOUSE: StructuredProvider = {
  name: 'greenhouse',
  matches: (url) => /(^|\.)greenhouse\.io$/.test(url.hostname) || /(^|\.)job-boards\.greenhouse\.io$/.test(url.hostname),
  apiUrl: (url) => {
    // boards.greenhouse.io/{board}/jobs/{id} and job-boards.greenhouse.io/{board}/jobs/{id}
    const match = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
    if (!match) return null;
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(match[1])}/jobs/${match[2]}`;
  },
  parse: (payload, sourceUrl) => {
    const job = payload as { title?: string; content?: string; location?: { name?: string }; company_name?: string };
    if (!job?.title || !job?.content) return null;
    return {
      title: job.title,
      company: job.company_name ?? null,
      location: job.location?.name ?? null,
      // Greenhouse returns HTML-escaped HTML in `content`.
      descriptionText: stripHtml(job.content.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')),
      sourceUrl,
      retrievalMethod: 'structured_api',
    };
  },
};

const LEVER: StructuredProvider = {
  name: 'lever',
  matches: (url) => /(^|\.)lever\.co$/.test(url.hostname),
  apiUrl: (url) => {
    // jobs.lever.co/{company}/{postingId}
    const match = url.pathname.match(/^\/([^/]+)\/([0-9a-f-]{16,})/i);
    if (!match) return null;
    return `https://api.lever.co/v0/postings/${encodeURIComponent(match[1])}/${match[2]}`;
  },
  parse: (payload, sourceUrl) => {
    const job = payload as {
      text?: string;
      descriptionPlain?: string;
      description?: string;
      categories?: { location?: string; team?: string };
      lists?: { text?: string; content?: string }[];
    };
    if (!job?.text) return null;
    const lists = (job.lists ?? [])
      .map((list) => `${list.text ?? ''}\n${stripHtml(list.content ?? '')}`)
      .join('\n\n');
    const body = job.descriptionPlain ?? stripHtml(job.description ?? '');
    return {
      title: job.text,
      company: null,
      location: job.categories?.location ?? null,
      descriptionText: [body, lists].filter((part) => part.trim()).join('\n\n'),
      sourceUrl,
      retrievalMethod: 'structured_api',
    };
  },
};

const ASHBY: StructuredProvider = {
  name: 'ashby',
  matches: (url) => /(^|\.)ashbyhq\.com$/.test(url.hostname),
  apiUrl: (url) => {
    // jobs.ashbyhq.com/{org}/{jobId} — the public API returns the whole board, filtered below.
    const match = url.pathname.match(/^\/([^/]+)/);
    if (!match) return null;
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(match[1])}?includeCompensation=false`;
  },
  parse: (payload, sourceUrl) => {
    const board = payload as { jobs?: { id?: string; title?: string; location?: string; descriptionPlain?: string; jobUrl?: string }[] };
    if (!board?.jobs?.length) return null;
    const wantedId = new URL(sourceUrl).pathname.split('/').filter(Boolean)[1];
    const job =
      board.jobs.find((entry) => entry.id === wantedId) ??
      board.jobs.find((entry) => entry.jobUrl && entry.jobUrl === sourceUrl);
    if (!job?.title || !job?.descriptionPlain) return null;
    return {
      title: job.title,
      company: null,
      location: job.location ?? null,
      descriptionText: job.descriptionPlain,
      sourceUrl,
      retrievalMethod: 'structured_api',
    };
  },
};

const PROVIDERS = [GREENHOUSE, LEVER, ASHBY];

/** Sites known to block server-side fetching or require JS. Recognised only to fail fast with
 * an honest message — no attempt is made to work around them, which would violate their terms
 * as well as being fragile. */
const KNOWN_BLOCKING_HOSTS = [
  /(^|\.)linkedin\.com$/,
  /(^|\.)indeed\.[a-z.]+$/,
  /(^|\.)glassdoor\.[a-z.]+$/,
  /(^|\.)ziprecruiter\.[a-z.]+$/,
  /(^|\.)naukri\.com$/,
];

export function isKnownBlockingHost(hostname: string): boolean {
  return KNOWN_BLOCKING_HOSTS.some((pattern) => pattern.test(hostname));
}

/* =====================================================================================
 * Fetching
 * ===================================================================================== */

/** Reads at most MAX_RESPONSE_BYTES, aborting rather than buffering a hostile response. */
async function readCapped(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Fetches with redirects followed MANUALLY, so every hop is re-validated. `redirect: 'follow'`
 * would let a public URL redirect straight to 169.254.169.254 with no further check — the
 * validation on the original URL would be meaningless.
 */
async function fetchValidated(
  startUrl: string,
  signal: AbortSignal
): Promise<{ ok: true; response: Response; finalUrl: string } | { ok: false; reason: IngestFailureReason; detail: string }> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validation = await validateOutboundUrl(current);
    if (!validation.ok) return { ok: false, reason: validation.reason, detail: validation.detail };

    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal,
        // No cookies, no auth headers — this request must carry none of the server's identity.
        credentials: 'omit',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        },
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        reason: aborted ? 'timeout' : 'network-error',
        detail: aborted ? 'request timed out' : `fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { ok: false, reason: 'network-error', detail: 'redirect without a Location header' };
      current = new URL(location, current).toString();
      continue;
    }

    if (response.status === 403 || response.status === 401 || response.status === 429) {
      return { ok: false, reason: 'blocked-by-site', detail: `site returned ${response.status}` };
    }
    if (!response.ok) {
      return { ok: false, reason: 'network-error', detail: `site returned ${response.status}` };
    }

    return { ok: true, response, finalUrl: current };
  }

  return { ok: false, reason: 'too-many-redirects', detail: `more than ${MAX_REDIRECTS} redirects` };
}

/* =====================================================================================
 * HTML extraction
 * ===================================================================================== */

/** schema.org JobPosting embedded as JSON-LD. Many boards emit it, and when present it is
 * far more reliable than guessing which div holds the description. */
function fromJsonLd(html: string, sourceUrl: string): JobDescription | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue;
    }

    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      const node = candidate as {
        '@type'?: string | string[];
        title?: string;
        description?: string;
        hiringOrganization?: { name?: string };
        jobLocation?: { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } };
      };
      const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
      if (!types.includes('JobPosting')) continue;
      if (!node.title || !node.description) continue;

      const address = node.jobLocation?.address;
      const location = [address?.addressLocality, address?.addressRegion, address?.addressCountry]
        .filter(Boolean)
        .join(', ');

      return {
        title: node.title,
        company: node.hiringOrganization?.name ?? null,
        location: location || null,
        descriptionText: stripHtml(node.description),
        sourceUrl,
        retrievalMethod: 'html_extraction',
      };
    }
  }

  return null;
}

/** Minimum extracted length to treat a page as a real posting. Below this it is almost
 * certainly a JS shell or a consent wall, and passing it to the review would produce a
 * confident assessment against nothing. */
const MIN_DESCRIPTION_CHARS = 200;

function fromHtml(html: string, sourceUrl: string): JobDescription | null {
  const structured = fromJsonLd(html, sourceUrl);
  if (structured && structured.descriptionText.length >= MIN_DESCRIPTION_CHARS) return structured;

  const text = stripHtml(html);
  if (text.length < MIN_DESCRIPTION_CHARS) return null;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return {
    title: titleMatch ? stripHtml(titleMatch[1]).slice(0, 200) : null,
    company: null,
    location: null,
    descriptionText: text,
    sourceUrl,
    retrievalMethod: 'html_extraction',
  };
}

/* =====================================================================================
 * Entry point
 * ===================================================================================== */

export async function ingestJobUrl(candidateUrl: string): Promise<IngestResult> {
  const preflight = await validateOutboundUrl(candidateUrl);
  if (!preflight.ok) return { ok: false, reason: preflight.reason, detail: preflight.detail };

  if (isKnownBlockingHost(preflight.url.hostname)) {
    // Fail immediately and honestly rather than spending 8 seconds proving what is already
    // known, and rather than attempting a workaround that would breach their terms.
    return {
      ok: false,
      reason: 'blocked-by-site',
      detail: `${preflight.url.hostname} does not permit server-side fetching`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const provider = PROVIDERS.find((entry) => entry.matches(preflight.url));

    if (provider) {
      const apiUrl = provider.apiUrl(preflight.url);
      if (apiUrl) {
        const fetched = await fetchValidated(apiUrl, controller.signal);
        if (fetched.ok) {
          const body = await readCapped(fetched.response);
          if (body === null) return { ok: false, reason: 'response-too-large', detail: 'response exceeded the size cap' };
          try {
            const job = provider.parse(JSON.parse(body), candidateUrl);
            if (job && job.descriptionText.length >= MIN_DESCRIPTION_CHARS) return { ok: true, job };
          } catch {
            // Fall through to the HTML path below.
          }
        }
      }
    }

    // Either not a known provider, or its API didn't yield a posting — try the page itself.
    const fetched = await fetchValidated(candidateUrl, controller.signal);
    if (!fetched.ok) return fetched;

    const body = await readCapped(fetched.response);
    if (body === null) return { ok: false, reason: 'response-too-large', detail: 'response exceeded the size cap' };

    const job = fromHtml(body, candidateUrl);
    if (!job) {
      return {
        ok: false,
        reason: 'no-content-extracted',
        detail: 'the page returned no readable job description (likely rendered by JavaScript)',
      };
    }

    return { ok: true, job };
  } finally {
    clearTimeout(timer);
  }
}
