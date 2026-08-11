import { NextRequest, NextResponse } from 'next/server';
import { enforceLimits } from '@/lib/rate-limit';
import { withTelemetryContext, telemetryContextFromRequest } from '@/lib/telemetry';
import { errorResponse, failWith } from '@/lib/api-response';
import { runResumeReview } from '@/lib/resume-review';
import { AgainstJobRequestBodySchema, serializeOutcome } from '@/lib/resume-review/route-helpers';

export const maxDuration = 60;

/**
 * The against-job path. Job ingestion (URL fetching, its SSRF defences, and the paste
 * fallback) is Task 5's concern and lives behind its own route — this one receives an
 * already-normalised JobDescription, so a fetch failure can never block a review that the
 * user has already pasted text for.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await enforceLimits(request);
    if (limited) return limited;

    const body = await request.json();
    const parsed = AgainstJobRequestBodySchema.safeParse(body);
    if (!parsed.success) {
      return failWith('UNKNOWN', {
        detail: `resume-review/against-job: invalid request body — ${parsed.error.message}`,
      });
    }

    return await withTelemetryContext(
      telemetryContextFromRequest(request, '/api/resume-review/against-job'),
      async () => {
        const outcome = await runResumeReview({
          resumeText: parsed.data.resumeText,
          path: 'against_job',
          personaOverride: parsed.data.personaOverride ?? undefined,
          jobDescription: parsed.data.jobDescription,
        });

        if (!outcome.ok) return NextResponse.json({ notAResume: true });

        return NextResponse.json(serializeOutcome(outcome));
      }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
