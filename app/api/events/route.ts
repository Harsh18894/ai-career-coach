import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FEEDBACK_ANSWERS, FUNNEL_EVENTS, FUNNEL_PATHS } from '@/lib/analytics-events';
import { ERROR_CODES } from '@/lib/errors';
import { enforceLimits } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/request-guard';
import { telemetryContextFromRequest } from '@/lib/telemetry';
import { errorResponse } from '@/lib/api-response';

export const maxDuration = 10;

/**
 * The schema is the privacy guarantee.
 *
 * Every field is an enum, a bounded integer, or a hostname. There is no string field a client
 * could put résumé text into, so "no PII reaches analytics" is enforced by validation rather
 * than by everyone remembering. Anything unrecognised is stripped by Zod before the log line is
 * written.
 */
const BodySchema = z.object({
  event: z.enum(FUNNEL_EVENTS),
  path: z.enum(FUNNEL_PATHS).optional(),
  turn: z.number().int().min(0).max(500).optional(),
  // Constrained to the taxonomy, so an arbitrary upstream message can never arrive here.
  errorCode: z.enum(ERROR_CODES).optional(),
  answer: z.enum(FEEDBACK_ANSWERS).optional(),
  // Hostname only — the client strips the path, and this bounds what arrives regardless.
  referrerHost: z.string().max(100).regex(/^[a-z0-9.-]+$/i).optional(),
  msToFirstCta: z.number().int().min(0).max(60 * 60 * 1000).optional(),
});

/**
 * Funnel events, written to the same structured log stream as llm_call and journey_span so
 * scripts/funnel-report.ts can join them by session id.
 *
 * Reaches no model, so it charges no LLM quota and needs no bot token. Still rate limited: it is
 * an unauthenticated public endpoint that writes to logs.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await enforceLimits(request, { llm: false, jobFetch: false });
    if (limited) return limited;

    const parsed = BodySchema.safeParse(await readJsonBody(request, { maxBytes: 4 * 1024 }));
    if (!parsed.success) {
      // A malformed analytics ping is dropped silently. Measurement must never become something
      // a user can see fail. 204 carries no body — NextResponse.json with that status throws.
      return new NextResponse(null, { status: 204 });
    }

    const context = telemetryContextFromRequest(request, '/api/events');

    // The funnel step is destructured OUT before the spread. Left in, it would overwrite the
    // envelope's own `event: 'funnel'` discriminator — which every report script keys on — and
    // the records would become invisible to them.
    const { event: step, ...props } = parsed.data;

    console.log(
      JSON.stringify({
        event: 'funnel',
        timestamp: new Date().toISOString(),
        sessionId: context.sessionId,
        isSample: context.isSample,
        ...(context.sampleId ? { sampleId: context.sampleId } : {}),
        step,
        ...props,
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
