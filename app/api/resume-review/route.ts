import { NextRequest, NextResponse } from 'next/server';
import { enforceLimits } from '@/lib/rate-limit';
import { withTelemetryContext, telemetryContextFromRequest } from '@/lib/telemetry';
import { errorResponse, failWith } from '@/lib/api-response';
import { runResumeReview } from '@/lib/resume-review';
import { ReviewRequestBodySchema, serializeOutcome } from '@/lib/resume-review/route-helpers';

// Three model calls in sequence (segment -> classify -> review), the last of which is the
// heaviest in the app after roadmap generation.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceLimits(request);
    if (limited) return limited;

    const body = await request.json();
    const parsed = ReviewRequestBodySchema.safeParse(body);
    if (!parsed.success) {
      return failWith('UNKNOWN', { detail: `resume-review: invalid request body — ${parsed.error.message}` });
    }

    return await withTelemetryContext(
      telemetryContextFromRequest(request, '/api/resume-review'),
      async () => {
        const outcome = await runResumeReview({
          resumeText: parsed.data.resumeText,
          path: 'independent',
          personaOverride: parsed.data.personaOverride ?? undefined,
        });

        if (!outcome.ok) {
          // A genuine outcome, not a failure: the document isn't a resume. Surfaced as a
          // typed 200 so the UI can say so plainly rather than showing an error box.
          return NextResponse.json({ notAResume: true });
        }

        return NextResponse.json(serializeOutcome(outcome));
      }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
