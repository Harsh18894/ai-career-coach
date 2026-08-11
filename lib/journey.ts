'use client';

import { sessionHeaders } from './session';
import type { JourneySpanName } from './journey-spans';

/* =====================================================================================
 * Session-level latency: the two numbers a user actually experiences.
 *
 * Per-call server timings will mislead you on their own. A session that spends 8s in
 * generatePaths is not an 8s wait — it is 8s of model time plus the request that preceded it,
 * plus the network, plus React committing the cards. And "path lock to roadmap on screen"
 * spans two calls that may or may not overlap. Neither can be measured on the server, because
 * the server does not know when anything was drawn.
 *
 * So these are measured in the browser, where the wait actually happens, and posted to
 * /api/journey to land in the same log stream as the llm_call records. The aggregation script
 * joins them by sessionId.
 *
 * Deliberately tiny: two spans, a Map, one fire-and-forget POST. Measurement that slows the
 * thing it measures is worse than no measurement.
 * ===================================================================================== */

export { JOURNEY_SPANS } from './journey-spans';
export type { JourneySpanName } from './journey-spans';

/** Module-level rather than React state: the intake span starts in ResumeUpload and ends in
 * ChatWindow, which are different components and never mounted at the same time. A ref or a
 * state value cannot span that; a module can. */
const started = new Map<JourneySpanName, number>();

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function startSpan(name: JourneySpanName): void {
  if (typeof window === 'undefined') return;
  started.set(name, now());
}

/**
 * Ends a span and reports it. No-op if the span never started, which is the normal case for a
 * restored session (the user reloaded mid-conversation, so the clock for this span belongs to
 * a page load that is gone). Reporting a duration measured from a start that did not happen
 * would be worse than reporting nothing.
 */
export function endSpan(name: JourneySpanName): void {
  if (typeof window === 'undefined') return;

  const startedAt = started.get(name);
  if (startedAt === undefined) return;
  started.delete(name);

  const durationMs = Math.round(now() - startedAt);

  // Guard against a clock that has obviously gone wrong (a suspended laptop, a tab restored
  // from bfcache) rather than polluting a percentile with a six-hour "wait".
  if (durationMs < 0 || durationMs > 30 * 60 * 1000) return;

  void fetch('/api/journey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify({ span: name, durationMs }),
    // The user may be navigating away right as this fires; keepalive lets the browser finish
    // the request anyway.
    keepalive: true,
  }).catch(() => {
    /* Telemetry must never surface to the user, and never retry. */
  });
}

/** Abandons a span without reporting it — for the paths that end in an error, where the
 * elapsed time measures a failure rather than a wait anyone would sit through. */
export function cancelSpan(name: JourneySpanName): void {
  started.delete(name);
}
