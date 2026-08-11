import { NextRequest, NextResponse } from 'next/server';
import { enforceLimits } from '../rate-limit';
import { withTelemetryContext, telemetryContextFromRequest, currentContextCostUsd } from '../telemetry';
import { errorResponse, failWith } from '../api-response';
import { prepareReview, reviewPrepared } from './index';
import { loadPreparedReview } from './prepared-cache';
import { ReviewRequestBodySchema, serializeOutcome } from './route-helpers';
import type { JobDescription, ReviewPath } from './schemas';

/* =====================================================================================
 * Shared handler for the two review routes, which differ only in their path and whether a
 * job description comes with them.
 * ===================================================================================== */

export type ReviewRouteOptions = {
  path: ReviewPath;
  routeName: string;
  /** Parses and validates the path-specific part of the body. Returning a string is a
   * rejection with that message as the logged detail. */
  extract?: (body: unknown) => JobDescription | string;
};

export async function handleReviewRequest(request: NextRequest, options: ReviewRouteOptions) {
  const startedAt = Date.now();
  try {
    const limited = await enforceLimits(request);
    if (limited) return limited;

    const body = await request.json();
    const parsed = ReviewRequestBodySchema.safeParse(body);
    if (!parsed.success) {
      return failWith('UNKNOWN', { detail: `${options.routeName}: invalid body — ${parsed.error.message}` });
    }
    if (!parsed.data.preparedId && !parsed.data.resumeText) {
      return failWith('UNKNOWN', { detail: `${options.routeName}: neither preparedId nor resumeText was supplied.` });
    }

    let jobDescription: JobDescription | null = null;
    if (options.extract) {
      const extracted = options.extract(body);
      if (typeof extracted === 'string') {
        return failWith('UNKNOWN', { detail: `${options.routeName}: ${extracted}` });
      }
      jobDescription = extracted;
    }

    const context = telemetryContextFromRequest(request, options.routeName);

    return await withTelemetryContext(context, async () => {
      // Normal path: the segment is already server-side from /prepare.
      const cached = parsed.data.preparedId
        ? await loadPreparedReview(parsed.data.preparedId, context.sessionId)
        : null;

      let rawResumeText: string;
      let segment;
      let classification;
      let priorCostUsd = 0;

      if (cached) {
        ({ rawResumeText, segment, classification } = cached);
        priorCostUsd = cached.prepareCostUsd ?? 0;
      } else {
        // Fallback: no cache configured, or the prepared entry expired. Re-derive rather than
        // accepting a client-supplied segment — post-validation checks findings against this
        // text, so it must be text the server produced.
        if (!parsed.data.resumeText) {
          return failWith('UNKNOWN', {
            detail: `${options.routeName}: prepared review not found and no resumeText fallback was supplied.`,
          });
        }
        const prepared = await prepareReview(parsed.data.resumeText);
        if (!prepared.ok) return NextResponse.json({ notAResume: true });
        rawResumeText = parsed.data.resumeText;
        segment = prepared.segment;
        classification = prepared.classification;
        // Re-derived in this request, so its cost is already in this scope's accumulator.
      }

      const outcome = await reviewPrepared({
        rawResumeText,
        segment,
        classification,
        path: options.path,
        personaOverride: parsed.data.personaOverride ?? undefined,
        jobDescription,
      });

      // One line per completed review, so cost per review can be reported separately from
      // cost per coaching session and split by the two things that actually move it.
      console.log(
        JSON.stringify({
          event: 'review_completed',
          timestamp: new Date().toISOString(),
          sessionId: context.sessionId,
          isSample: context.isSample,
          path: outcome.result.path,
          persona: outcome.result.persona,
          careerSwitcher: outcome.result.careerSwitcher,
          personaOverridden: Boolean(parsed.data.personaOverride),
          findings: outcome.result.findings.length,
          dropped: outcome.dropped.length,
          // prepare + review, whichever request each half was paid for in.
          estimatedCostUsd: priorCostUsd + currentContextCostUsd(),
          prepareCostUsd: priorCostUsd,
          durationMs: Date.now() - startedAt,
        })
      );

      return NextResponse.json(serializeOutcome(outcome));
    });
  } catch (error) {
    return errorResponse(error);
  }
}
