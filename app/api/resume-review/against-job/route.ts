import { NextRequest } from 'next/server';
import { handleReviewRequest } from '@/lib/resume-review/handle-review-request';
import { BoundedJobDescriptionSchema } from '@/lib/resume-review/route-helpers';

export const maxDuration = 60;

/**
 * The against-job path. Job ingestion (URL fetching, its SSRF defences, and the paste
 * fallback) is Task 5's concern and lives behind its own route — this one receives an
 * already-normalised JobDescription, so a fetch failure can never block a review the user has
 * already pasted text for.
 */
export async function POST(request: NextRequest) {
  return handleReviewRequest(request, {
    path: 'against_job',
    routeName: '/api/resume-review/against-job',
    extract: (body) => {
      const parsed = BoundedJobDescriptionSchema.safeParse((body as { jobDescription?: unknown })?.jobDescription);
      return parsed.success ? parsed.data : `invalid jobDescription — ${parsed.error.message}`;
    },
  });
}
