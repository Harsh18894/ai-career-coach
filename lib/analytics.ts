'use client';

import { sessionHeaders } from './session';
import type { FunnelEvent, FunnelProps } from './analytics-events';

/* =====================================================================================
 * Funnel instrumentation — first-party, no third-party script, no PII.
 *
 * WHY NOT POSTHOG. The privacy page says, in two places, that there are no analytics trackers
 * and no third-party pixels. That sentence is the strongest credibility asset this project has
 * with the audience it is aimed at, and it is worth more than a hosted dashboard. Adding a
 * third-party script would have made it false on the one page whose entire value is being
 * literally true — so the same funnel is collected here instead, through the app's own endpoint,
 * and read with scripts/funnel-report.ts.
 *
 * The trade is real and worth naming: no retention curves, no session replay, no UI. What there
 * is: one structured log line per step, in the same stream as llm_call and journey_span, joined
 * by the same opaque session id.
 *
 * ============================== WHAT IS NEVER SENT ==============================
 * No résumé text. No name, email, phone, or any field derived from a résumé. No message
 * content. No URLs with query strings. No IP is recorded by this path beyond what the platform
 * already logs for every request.
 *
 * Every property is either an enum from analytics-events.ts, a bounded integer, or a referrer
 * HOSTNAME with the path stripped — which is what makes Reddit separable without recording
 * which thread someone came from.
 * ================================================================================
 * ===================================================================================== */

/** Page-load mark, for time-to-first-CTA. Module scope so it survives component remounts. */
const pageLoadedAt = typeof performance !== 'undefined' ? performance.now() : 0;

/** Set once the first CTA of the visit is clicked, so the timing is measured once, not per click. */
let firstCtaClicked = false;

/**
 * Referrer hostname only.
 *
 * `document.referrer` is a full URL — for Reddit that includes the subreddit and the thread
 * slug, which is more than is needed to answer "did this come from Reddit" and starts to
 * identify a specific audience segment. The hostname answers the question; the rest is dropped.
 */
function referrerHost(): string | undefined {
  if (typeof document === 'undefined' || !document.referrer) return undefined;
  try {
    const host = new URL(document.referrer).hostname;
    // Same-origin navigation is not a referrer worth recording.
    if (host === window.location.hostname) return undefined;
    return host.slice(0, 100);
  } catch {
    return undefined;
  }
}

/**
 * Records a funnel step. Fire-and-forget, never awaited, never surfaced.
 *
 * Analytics must not be able to fail a user's session, slow it down, or throw into a render.
 * Everything here is best-effort by construction.
 */
export function track(event: FunnelEvent, props: FunnelProps = {}): void {
  if (typeof window === 'undefined') return;

  const body: Record<string, unknown> = { event, ...props };

  const host = referrerHost();
  if (host) body.referrerHost = host;

  // Time-to-first-CTA, recorded once per page load and only on the CTA events it describes.
  if ((event === 'sample_cta_click' || event === 'upload_cta_click') && !firstCtaClicked) {
    firstCtaClicked = true;
    body.msToFirstCta = Math.round(performance.now() - pageLoadedAt);
  }

  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      /* deliberately ignored */
    });
  } catch {
    /* deliberately ignored */
  }
}
