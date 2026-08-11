import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceLimits } from '@/lib/rate-limit';
import {
  withTelemetryContext,
  telemetryContextFromRequest,
  updateTelemetryContext,
  currentContextCostUsd,
} from '@/lib/telemetry';
import { errorResponse, failWith } from '@/lib/api-response';
import { LIMITS } from '@/lib/limits';
import { readJsonBody, summarizeZodError } from '@/lib/request-guard';
import { prepareReview } from '@/lib/resume-review';
import { storePreparedReview } from '@/lib/resume-review/prepared-cache';
import { MIN_RESUME_CHARS } from '@/lib/resume-review/route-helpers';

export const maxDuration = 60;

const BodySchema = z.object({
  resumeText: z.string().min(MIN_RESUME_CHARS).max(LIMITS.maxResumeChars),
});

/**
 * First half of the review: segment the resume and classify the persona.
 *
 * Split from the review itself so the heavy review call gets a whole request budget of its
 * own — run back to back the three calls total 60-68s against a 60s ceiling. The split is
 * also better product: the user sees the detected persona and can correct it BEFORE paying
 * for a review at the wrong bar.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await enforceLimits(request);
    if (limited) return limited;

    const body = await readJsonBody(request);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return failWith('INVALID_REQUEST', {
        detail: `resume-review/prepare: ${summarizeZodError(parsed.error.message)}`,
      });
    }

    const context = telemetryContextFromRequest(request, '/api/resume-review/prepare');

    return await withTelemetryContext(context, async () => {
      const prepared = await prepareReview(parsed.data.resumeText);

      if (!prepared.ok) {
        // A genuine outcome, not a failure: the document isn't a resume.
        return NextResponse.json({ notAResume: true });
      }

      updateTelemetryContext({ persona: prepared.classification.persona });

      const preparedId = await storePreparedReview({
        sessionId: context.sessionId,
        rawResumeText: parsed.data.resumeText,
        segment: prepared.segment,
        classification: prepared.classification,
        prepareCostUsd: currentContextCostUsd(),
      });

      return NextResponse.json({
        // Null when no cache is configured (local dev). The review routes then re-segment from
        // resumeText, which is slower but keeps the segment server-authoritative either way.
        preparedId,
        classification: prepared.classification,
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
