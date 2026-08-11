import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceLimits } from '@/lib/rate-limit';
import { errorResponse, failWith } from '@/lib/api-response';
import { readJsonBody, summarizeZodError } from '@/lib/request-guard';
import { ingestJobUrl } from '@/lib/job-ingest';

// node:dns, used by the SSRF guard to resolve and inspect the target's addresses, is not
// available on the edge runtime.
export const runtime = 'nodejs';

// Bounded by the ingest timeout plus redirects, nowhere near the model routes' budget.
export const maxDuration = 30;

// 2,048 is the practical ceiling browsers and servers agree on for a URL; anything longer is
// not a job link, and the SSRF guard should not be handed unbounded strings to parse.
const BodySchema = z.object({ url: z.string().min(1).max(2_048) });

/**
 * Fetches a job posting from a user-supplied URL.
 *
 * Deliberately separate from the review routes. Paste is the primary path and never touches
 * this endpoint, so a fetch failure — which will be common, since the largest job sites block
 * server-side access — can never block a review. Every failure here returns JOB_FETCH_FAILED,
 * whose message and `offersPasteFallback` both point at the same recovery: paste the text.
 *
 * No model is ever called here. Guessing a posting's contents from its URL would fabricate the
 * very document the against-job review is measured against.
 */
export async function POST(request: NextRequest) {
  try {
    // jobFetch quota, not the LLM quota — this route reaches no model, and its own limit is
    // tighter because it makes the server issue outbound requests to a caller-chosen address.
    const limited = await enforceLimits(request, { jobFetch: true, llm: false });
    if (limited) return limited;

    // A URL is tiny; there is no reason for this route to accept a body measured in kilobytes.
    const body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return failWith('INVALID_REQUEST', { detail: `job-description: ${summarizeZodError(parsed.error.message)}` });
    }

    const result = await ingestJobUrl(parsed.data.url);

    if (!result.ok) {
      // The reason is logged for operators; the visitor gets one consistent message and one
      // clear next action. Distinguishing "LinkedIn blocks us" from "that host doesn't exist"
      // in the UI would be noise — the remedy is identical.
      console.warn(
        JSON.stringify({
          event: 'job_fetch_failed',
          timestamp: new Date().toISOString(),
          reason: result.reason,
          detail: result.detail,
        })
      );
      return failWith('JOB_FETCH_FAILED');
    }

    // Returned for the user to read BEFORE the review runs, so they can see exactly what the
    // model will be given rather than trusting an opaque scrape.
    return NextResponse.json({ job: result.job });
  } catch (error) {
    return errorResponse(error);
  }
}

