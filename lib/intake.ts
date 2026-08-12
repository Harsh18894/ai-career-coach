import type { Profile, AdaptiveQuestion } from '@/lib/ai/schemas';
import type { FunnelPath } from '@/lib/analytics-events';
import { ClientApiError, clientErrorFrom, type ClientError } from '@/lib/errors';
import { LIMITS, formatBytes } from '@/lib/limits';
import { sessionHeaders } from '@/lib/session';
import { stashResumeText } from '@/lib/resume-stash';
import { humanTokenHeaders } from '@/lib/turnstile';
import { startSpan } from '@/lib/journey';
import { track } from '@/lib/analytics';

/* =====================================================================================
 * One intake pipeline: resume in, opener out.
 *
 * There are three ways into a conversation — a PDF from the dropzone, a PDF from the chooser's
 * file picker, and pasted text (which the sample profiles also ride on). All three do the same
 * two things in the same order: POST to /api/parse-resume, then POST to /api/generate-opener.
 *
 * That sequence used to be hand-written in ResumeUpload and again in HomeExperience, and the
 * copies had already drifted: only one of them recorded profile_parsed, and only one of them
 * stashed the resume before the opener call rather than after. Hence one module, three callers.
 *
 * No 'use client' directive. Nothing here needs one — it is called from client components which
 * carry their own — and a directive would make these exports client-reference stubs if a route
 * handler ever imported the types. See the header of lib/analytics-events.ts for the time that
 * cost us.
 * ===================================================================================== */

export type IntakeSource =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string };

export type IntakeResult =
  /** A profile was extracted and an opening question is ready. */
  | { status: 'profile'; profile: Profile; opener: AdaptiveQuestion }
  /** The document parsed, but there was not enough career history in it to work from. The
   * caller should fall back to the guided no-resume intake. */
  | { status: 'insufficient' };

/**
 * Everything that can be known about a file before spending a request on it.
 *
 * Returns null when the file is acceptable. The error code is RESUME_PARSE_FAILED so that
 * `offersPasteFallback` is true for it and the caller reveals the paste box — a wrong file type
 * is exactly the case where pasting is the right next move.
 */
export function validateResumeFile(file: File): ClientError | null {
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    return {
      code: 'RESUME_PARSE_FAILED',
      message: 'That file is not a PDF. Upload a PDF, or paste your resume text instead.',
    };
  }

  if (file.size > LIMITS.maxUploadBytes) {
    return {
      code: 'RESUME_PARSE_FAILED',
      message: `That file is over the ${formatBytes(LIMITS.maxUploadBytes)} limit. Try a smaller PDF, or paste your resume text instead.`,
    };
  }

  return null;
}

/**
 * Parse a resume and generate the conversation's opening question.
 *
 * Throws ClientApiError on any failure; the caller owns the error UI, because where an error
 * belongs on screen depends on which surface asked.
 */
export async function runIntake(
  source: IntakeSource,
  options: { path: FunnelPath }
): Promise<IntakeResult> {
  // The span starts here, not at the fetch: the wait a user perceives begins when they hand
  // over the resume, and PDF parsing happens before any model call.
  startSpan('intake_to_first_paths');

  let response: Response;
  if (source.kind === 'file') {
    const invalid = validateResumeFile(source.file);
    if (invalid) throw new ClientApiError(invalid);

    const formData = new FormData();
    formData.append('file', source.file);
    response = await fetch('/api/parse-resume', {
      method: 'POST',
      // No Content-Type — the browser sets the multipart boundary itself.
      headers: { ...sessionHeaders(), ...(await humanTokenHeaders()) },
      body: formData,
    });
  } else {
    response = await fetch('/api/parse-resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...sessionHeaders(),
        ...(await humanTokenHeaders()),
      },
      body: JSON.stringify({ text: source.text }),
    });
  }

  const data = await response.json();
  if (!response.ok) {
    throw new ClientApiError(clientErrorFrom(data, 'RESUME_PARSE_FAILED'));
  }

  if (data.insufficientInfo) {
    return { status: 'insufficient' };
  }

  // Stashed before the opener call, so a failure there still leaves the resume available to
  // /review rather than making the user hand it over a second time.
  const resumeText = source.kind === 'text' ? source.text : data.text;
  if (typeof resumeText === 'string') stashResumeText(resumeText);

  const openerResponse = await fetch('/api/generate-opener', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify({ profile: data.profile }),
  });
  const openerData = await openerResponse.json();
  if (!openerResponse.ok) {
    throw new ClientApiError(clientErrorFrom(openerData));
  }

  track('profile_parsed', { path: options.path });
  return { status: 'profile', profile: data.profile, opener: openerData.opener };
}
