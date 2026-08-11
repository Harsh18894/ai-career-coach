import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceLimits } from '@/lib/rate-limit';
import { telemetryContextFromRequest } from '@/lib/telemetry';
import { errorResponse } from '@/lib/api-response';
import { readJsonBody } from '@/lib/request-guard';

export const maxDuration = 10;

const BodySchema = z.object({
  findingId: z.string().max(64),
  verdict: z.enum(['up', 'down']),
  dimension: z.string().max(64),
  severity: z.string().max(32),
  persona: z.string().max(32),
  path: z.string().max(32),
});

/**
 * Thumbs up/down on a single finding. Seed data for Phase 3's feedback loop, kept deliberately
 * lightweight: one structured log line, no storage, no model call.
 *
 * What is recorded is the finding's SHAPE (dimension, severity, persona, path) and its content-
 * derived id — never the resume text or the finding's wording. That is enough to answer "which
 * dimensions do people reject at which personas", which is the question Phase 3 needs, without
 * accumulating anybody's resume in a log.
 */
export async function POST(request: NextRequest) {
  try {
    // Charges no LLM quota — this route reaches no model — but is still limited, since it is
    // an unauthenticated public endpoint that writes to logs.
    const limited = await enforceLimits(request, { llm: false, jobFetch: false });
    if (limited) return limited;

    // Every field here is already capped, so the body has a known small ceiling — enforced at
    // the transport layer too, rather than only after the whole thing has been read.
    const parsed = BodySchema.safeParse(await readJsonBody(request, { maxBytes: 8 * 1024 }));
    if (!parsed.success) {
      // A malformed feedback ping is not worth an error envelope; drop it quietly.
      return NextResponse.json({ ok: false }, { status: 204 });
    }

    const context = telemetryContextFromRequest(request, '/api/review-feedback');

    console.log(
      JSON.stringify({
        event: 'review_finding_feedback',
        timestamp: new Date().toISOString(),
        sessionId: context.sessionId,
        isSample: context.isSample,
        ...parsed.data,
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
