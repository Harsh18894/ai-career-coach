import { ClientApiError, clientErrorFrom } from '../errors';
import { sessionHeaders } from '../session';
import type { JobDescription, ReviewPersona, ReviewResult } from './schemas';
import type { PersonaClassification } from './persona-types';

/* =====================================================================================
 * Browser-side calls for the review surface.
 *
 * Every response goes through the Phase 0 error taxonomy (clientErrorFrom / ClientApiError),
 * so the review UI shows the same vetted copy and gets the same retry/paste-fallback signals
 * as the coaching flow, rather than inventing a second error vocabulary.
 * ===================================================================================== */

function jsonInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new ClientApiError(clientErrorFrom(data));
  return data as T;
}

/** Extracts text from an uploaded PDF using the existing parser, in its text-only mode. */
export async function extractResumeTextFromPdf(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/parse-resume?mode=text', {
    method: 'POST',
    headers: sessionHeaders(), // no Content-Type: the browser sets the multipart boundary
    body: formData,
  });

  const data = await readJson<{ text?: string }>(response);
  if (!data.text) throw new ClientApiError(clientErrorFrom({}, 'RESUME_PARSE_FAILED'));
  return data.text;
}

export type PrepareResponse = {
  preparedId: string | null;
  classification: PersonaClassification;
  notAResume?: boolean;
};

/** Stage 1-2: segment and classify. Fast enough to run before the user commits to a review,
 * which is what lets them correct the persona first. */
export async function prepareReview(resumeText: string): Promise<PrepareResponse> {
  const response = await fetch('/api/resume-review/prepare', jsonInit({ resumeText }));
  return readJson<PrepareResponse>(response);
}

export type ReviewResponse = {
  result: ReviewResult;
  classification: PersonaClassification;
  /** Role/project labels and their bullet ids, so findings can be grouped under the role they
   * belong to without shipping the whole parsed resume back. */
  groups: { id: string; label: string; bulletIds: string[] }[];
  droppedCount: number;
  notAResume?: boolean;
};

export type RunReviewArgs = {
  preparedId: string | null;
  /** Sent as the fallback for when no prepared-segment store is configured, or the prepared
   * entry has expired — see lib/resume-review/prepared-cache.ts. */
  resumeText: string;
  personaOverride?: ReviewPersona;
  jobDescription?: JobDescription | null;
};

export async function runReview(args: RunReviewArgs): Promise<ReviewResponse> {
  const endpoint = args.jobDescription ? '/api/resume-review/against-job' : '/api/resume-review';
  const response = await fetch(
    endpoint,
    jsonInit({
      preparedId: args.preparedId,
      resumeText: args.resumeText,
      personaOverride: args.personaOverride ?? null,
      ...(args.jobDescription ? { jobDescription: args.jobDescription } : {}),
    })
  );
  return readJson<ReviewResponse>(response);
}

/** Fetches a job posting from a URL. Failure here is expected and non-fatal — the caller falls
 * back to the paste field, which always works. */
export async function fetchJobFromUrl(url: string): Promise<JobDescription> {
  const response = await fetch('/api/job-description', jsonInit({ url }));
  const data = await readJson<{ job: JobDescription }>(response);
  return data.job;
}

export type FindingFeedback = {
  findingId: string;
  verdict: 'up' | 'down';
  dimension: string;
  severity: string;
  persona: string;
  path: string;
};

/** Fire-and-forget: a failed feedback ping must never interrupt someone reading their review. */
export function sendFindingFeedback(feedback: FindingFeedback): void {
  void fetch('/api/review-feedback', jsonInit(feedback)).catch(() => {
    /* deliberately ignored */
  });
}
