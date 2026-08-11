import { NextRequest } from 'next/server';
import { handleReviewRequest } from '@/lib/resume-review/handle-review-request';

// The review is one model call now that segmentation and classification happen in
// /api/resume-review/prepare — see the note there on why the pipeline spans two requests.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleReviewRequest(request, {
    path: 'independent',
    routeName: '/api/resume-review',
  });
}
