/* =====================================================================================
 * Shared URL liveness checking.
 *
 * Extracted from scripts/baseline-links.ts so the curated platform registry
 * (lib/resume-review/opportunity-platforms.ts) can be checked for dead links without
 * duplicating the fetch/timeout/classification logic — or, worse, without dragging the
 * baseline script's billable roadmap generation along with it.
 *
 * Pure network work: no model calls, no cost, safe to run in CI.
 * ===================================================================================== */

export type LinkStatus = 'ok' | 'dead' | 'timeout' | 'blocked';

export type LinkCheckResult = {
  url: string;
  status: LinkStatus;
  httpStatus?: number;
  finalUrl?: string;
};

export const LINK_CHECK_DEFAULTS = {
  timeoutMs: 8_000,
  concurrency: 4,
  userAgent: 'aria-link-check/1.0 (link validation)',
} as const;

export type LinkCheckOptions = {
  timeoutMs?: number;
  concurrency?: number;
  userAgent?: string;
  /** Called after each URL resolves, for progress reporting. */
  onProgress?: (completed: number, total: number) => void;
};

export function classifyHttpStatus(httpStatus: number): LinkStatus {
  if (httpStatus < 400) return 'ok';
  // Bot-blocking and auth walls are not evidence the resource is missing. Job boards in
  // particular return 403 to non-browser user agents routinely — treating that as "dead"
  // would make a registry check fail on links that are perfectly fine for a real user.
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return 'blocked';
  return 'dead';
}

export async function checkUrl(url: string, options: LinkCheckOptions = {}): Promise<LinkCheckResult> {
  const timeoutMs = options.timeoutMs ?? LINK_CHECK_DEFAULTS.timeoutMs;
  const userAgent = options.userAgent ?? LINK_CHECK_DEFAULTS.userAgent;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': userAgent },
    });

    // Plenty of hosts reject HEAD outright; fall back before calling the link dead.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': userAgent },
      });
    }

    return {
      url,
      status: classifyHttpStatus(response.status),
      httpStatus: response.status,
      finalUrl: response.url,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { url, status: aborted ? 'timeout' : 'dead' };
  } finally {
    clearTimeout(timer);
  }
}

/** Fixed-size worker pool — politeness as much as performance. */
export async function checkUrls(
  urls: string[],
  options: LinkCheckOptions = {}
): Promise<Map<string, LinkCheckResult>> {
  const concurrency = options.concurrency ?? LINK_CHECK_DEFAULTS.concurrency;
  const results = new Map<string, LinkCheckResult>();
  let cursor = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= urls.length) return;
      const url = urls[index];
      results.set(url, await checkUrl(url, options));
      completed++;
      options.onProgress?.(completed, urls.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}
