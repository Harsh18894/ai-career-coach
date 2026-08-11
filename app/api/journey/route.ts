import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { JOURNEY_SPANS } from '@/lib/journey-spans';
import { enforceLimits } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/request-guard';
import { telemetryContextFromRequest } from '@/lib/telemetry';
import { errorResponse } from '@/lib/api-response';

export const maxDuration = 10;

const BodySchema = z.object({
  span: z.enum(JOURNEY_SPANS),
  // Upper bound matches the client's own sanity check. A span longer than 30 minutes is a
  // suspended laptop, not a wait.
  durationMs: z.number().int().min(0).max(30 * 60 * 1000),
  /* Where the clock ran. A browser span includes render; a harness span (scripts/
   * latency-baseline.ts) covers network + server + model and stops at the response.
   * Recorded rather than assumed, so a baseline built from scripted runs is never quietly
   * compared against numbers that include paint time. */
  source: z.enum(['browser', 'harness']).default('browser'),
});

/**
 * Receives the two browser-measured session spans and writes them to the same log stream as
 * the llm_call records, so scripts/latency-report.ts can join them by sessionId.
 *
 * Records a duration and a span name. Nothing else — no URL, no user agent, no content. The
 * session id is the same opaque client-generated value everything else is attributed by.
 *
 * Reaches no model, so it charges no LLM quota and needs no bot token; it is still rate
 * limited, because it is an unauthenticated public endpoint that writes to logs.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await enforceLimits(request, { llm: false, jobFetch: false });
    if (limited) return limited;

    const parsed = BodySchema.safeParse(await readJsonBody(request, { maxBytes: 4 * 1024 }));
    if (!parsed.success) {
      // A malformed timing ping is not worth an error envelope — drop it and move on. This is
      // measurement; it must never become a thing the user can see fail.
      // 204 means "no content", so it cannot carry a body — NextResponse.json with that
      // status throws, turning a dropped ping into a 500. An empty 204 is what was meant.
      return new NextResponse(null, { status: 204 });
    }

    const context = telemetryContextFromRequest(request, '/api/journey');

    console.log(
      JSON.stringify({
        event: 'journey_span',
        timestamp: new Date().toISOString(),
        sessionId: context.sessionId,
        isSample: context.isSample,
        ...(context.sampleId ? { sampleId: context.sampleId } : {}),
        span: parsed.data.span,
        durationMs: parsed.data.durationMs,
        source: parsed.data.source,
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
