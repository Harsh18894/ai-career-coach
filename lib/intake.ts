import type { Profile, AdaptiveQuestion } from '@/lib/ai/schemas';
import type { FunnelPath } from '@/lib/analytics-events';
import { ClientApiError, clientErrorFrom, ERROR_MESSAGES, type ClientError } from '@/lib/errors';
import { LIMITS, formatBytes } from '@/lib/limits';
import { sessionHeaders, startNewSession } from '@/lib/session';
import type { SampleProfile } from '@/lib/samples';
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

/**
 * What the two endpoints answer with. Named rather than left implicit so the optionality is
 * visible: every field here can be absent on an error response, and the code below has to say
 * what it does in that case instead of trusting `data.profile` to exist.
 */
type ParseResumeResponse = {
  profile?: Profile;
  /** The extracted resume text, echoed back for the stash. */
  text?: string;
  insufficientInfo?: boolean;
};

type GenerateOpenerResponse = {
  opener?: AdaptiveQuestion;
};

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
  // Case-insensitive: a Windows export is frequently `Resume.PDF`, and some browsers leave
  // `file.type` empty, so the extension is the only signal left.
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
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
 * Reads a JSON body without letting a non-JSON one masquerade as a bug in this code.
 *
 * These routes always answer JSON, but the layers in front of them do not: a platform 502, a
 * proxy timeout page or a captive portal all return HTML, and `response.json()` then throws a
 * SyntaxError that surfaces as "unexpected problem" with no indication that the request never
 * reached the app. Classifying it by status instead produces the message the situation deserves.
 */
async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    const code = response.ok
      ? 'INVALID_OUTPUT'
      : response.status === 429
        ? 'RATE_LIMITED'
        : 'UPSTREAM_ERROR';
    throw new ClientApiError({ code, message: ERROR_MESSAGES[code] });
  }
}

/**
 * Begins a session for one of the fictional sample profiles, and returns the source to run.
 *
 * Shared by all three places a sample can start — the chooser dialog, the `?start=<id>` deep
 * link, and the intake screen's own picker — because the ordering matters and had already been
 * copied twice: the session must be tagged `isSample` BEFORE the first request goes out, or the
 * demo run is attributed to real traffic.
 */
export function beginSampleSession(sample: SampleProfile): IntakeSource {
  startNewSession({ isSample: true, sampleId: sample.id });
  track('sample_cta_click', { path: 'sample' });
  return { kind: 'text', text: sample.resumeText };
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

  const data = await readJson<ParseResumeResponse>(response);
  if (!response.ok) {
    throw new ClientApiError(clientErrorFrom(data, 'RESUME_PARSE_FAILED'));
  }

  if (data.insufficientInfo) {
    return { status: 'insufficient' };
  }

  // A 200 with no profile should be impossible — the route validates before responding — but
  // "impossible" here would mean handing `undefined` to the chat as a profile and failing several
  // screens later with something unrelated. Fail where the assumption actually breaks.
  if (!data.profile) {
    throw new ClientApiError({ code: 'INVALID_OUTPUT', message: ERROR_MESSAGES.INVALID_OUTPUT });
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
  const openerData = await readJson<GenerateOpenerResponse>(openerResponse);
  if (!openerResponse.ok) {
    throw new ClientApiError(clientErrorFrom(openerData));
  }
  if (!openerData.opener) {
    throw new ClientApiError({ code: 'INVALID_OUTPUT', message: ERROR_MESSAGES.INVALID_OUTPUT });
  }

  track('profile_parsed', { path: options.path });
  return { status: 'profile', profile: data.profile, opener: openerData.opener };
}
