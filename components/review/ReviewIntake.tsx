'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, ClipboardPaste, FileUp, FlaskConical, Link2, Loader2, Target } from 'lucide-react';
import { SAMPLE_PROFILES, type SampleProfile } from '@/lib/samples';
import { asClientError, offersPasteFallback, type ClientError } from '@/lib/errors';
import { startNewSession } from '@/lib/session';
import { readStashedResumeText } from '@/lib/resume-stash';
import { extractResumeTextFromPdf, fetchJobFromUrl } from '@/lib/resume-review/client';
import type { JobDescription, ReviewPath } from '@/lib/resume-review/schemas';
import { LIMITS } from '@/lib/limits';

/* =====================================================================================
 * Intake for the review surface: choose a path, supply a resume, and on the against-job path
 * supply the job.
 *
 * Resume intake reuses the existing parser (/api/parse-resume in its text-only mode) rather
 * than adding a second one; sample profiles come from the same fixtures the coaching flow uses.
 * ===================================================================================== */

const MIN_TEXT_CHARS = 150;

export type IntakeResult = {
  resumeText: string;
  path: ReviewPath;
  jobDescription: JobDescription | null;
};

export function ReviewIntake({ onStart, busy }: { onStart: (result: IntakeResult) => void; busy: boolean }) {
  const [path, setPath] = useState<ReviewPath>('independent');
  // Picked up from the coaching intake if the user already supplied a resume there. Read in a
  // lazy initialiser rather than an effect: this component only ever mounts client-side, so
  // there is no server render for a sessionStorage read to disagree with.
  const [resumeText, setResumeText] = useState(() => readStashedResumeText() ?? '');
  const [resumeSource, setResumeSource] = useState<'none' | 'pdf' | 'paste' | 'sample' | 'carried'>(() =>
    readStashedResumeText() ? 'carried' : 'none'
  );
  const [showPaste, setShowPaste] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [error, setError] = useState<ClientError | null>(null);
  const [uploading, setUploading] = useState(false);

  const [jobMode, setJobMode] = useState<'url' | 'paste'>('url');
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [jobFetching, setJobFetching] = useState(false);
  const [fetchedJob, setFetchedJob] = useState<JobDescription | null>(null);
  const [jobError, setJobError] = useState<ClientError | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobTextRef = useRef<HTMLTextAreaElement>(null);

  /* ---- resume ------------------------------------------------------------------------- */

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const text = await extractResumeTextFromPdf(file);
      setResumeText(text);
      setResumeSource('pdf');
    } catch (err) {
      const clientError = asClientError(err);
      setError(clientError);
      // An unreadable PDF has exactly one useful next step, so open it rather than describing it.
      if (offersPasteFallback(clientError.code)) setShowPaste(true);
    } finally {
      setUploading(false);
    }
  };

  const applySample = (sample: SampleProfile) => {
    // Re-mint the session so the whole review is tagged isSample from its first request.
    startNewSession({ isSample: true, sampleId: sample.id });
    setResumeText(sample.resumeText);
    setResumeSource('sample');
    setShowSamples(false);
    setShowPaste(false);
    setError(null);
  };

  /* ---- job ---------------------------------------------------------------------------- */

  const handleFetchJob = async () => {
    if (!jobUrl.trim()) return;
    setJobFetching(true);
    setJobError(null);
    try {
      const job = await fetchJobFromUrl(jobUrl.trim());
      setFetchedJob(job);
    } catch (err) {
      setJobError(asClientError(err));
      // Fetching a job URL fails often and by design — drop straight into the paste field with
      // focus, rather than leaving the user to work out the next move.
      setJobMode('paste');
      requestAnimationFrame(() => jobTextRef.current?.focus());
    } finally {
      setJobFetching(false);
    }
  };

  const effectiveJob: JobDescription | null =
    path === 'independent'
      ? null
      : fetchedJob ??
        (jobText.trim().length >= MIN_TEXT_CHARS
          ? {
              title: null,
              company: null,
              location: null,
              descriptionText: jobText.trim(),
              sourceUrl: null,
              retrievalMethod: 'paste' as const,
            }
          : null);

  const resumeReady = resumeText.trim().length >= MIN_TEXT_CHARS;
  const jobReady = path === 'independent' || effectiveJob !== null;
  const canStart = resumeReady && jobReady && !busy && !uploading;

  return (
    <div className="space-y-5">
      {/* Path chooser */}
      <section className="rounded-2xl border border-border-soft bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">What kind of review?</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPath('independent')}
            className={`rounded-xl border p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi ${
              path === 'independent' ? 'border-hachi/30 bg-hachi/8' : 'border-border-soft hover:border-hachi/30'
            }`}
          >
            <span className="block font-semibold text-ink">Review my resume</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
              Is this resume doing its job for someone at your stage?
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPath('against_job')}
            className={`rounded-xl border p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi ${
              path === 'against_job' ? 'border-hachi/30 bg-hachi/8' : 'border-border-soft hover:border-hachi/30'
            }`}
          >
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <Target className="h-4 w-4" />
              Review against a job
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
              Read through a recruiter&apos;s eyes against one specific role.
            </span>
          </button>
        </div>
      </section>

      {/* Resume */}
      <section className="rounded-2xl border border-border-soft bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Your resume</h2>

        {resumeReady ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-sm text-emerald-900">
              {resumeSource === 'sample'
                ? 'Sample profile loaded'
                : resumeSource === 'carried'
                  ? 'Using the resume you already supplied'
                  : 'Resume loaded'}{' '}
              — {resumeText.length.toLocaleString()} characters
            </p>
            <button
              type="button"
              onClick={() => {
                setResumeText('');
                setResumeSource('none');
              }}
              className="text-xs font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-900"
            >
              Use a different one
            </button>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                aria-label="Upload resume PDF"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-xl bg-hachi px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {uploading ? 'Reading PDF…' : 'Upload PDF'}
              </button>
              <button
                type="button"
                onClick={() => setShowPaste((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-hachi/30 hover:text-hachi focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
              >
                <ClipboardPaste className="h-4 w-4" />
                Paste text
              </button>
              <button
                type="button"
                onClick={() => setShowSamples((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-hachi/30 hover:text-hachi focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
              >
                <FlaskConical className="h-4 w-4" />
                Use a sample
              </button>
            </div>

            {showSamples && (
              <div className="mt-3 grid gap-2">
                {SAMPLE_PROFILES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => applySample(sample)}
                    className="rounded-xl border border-border-soft bg-white p-3 text-left transition-colors hover:border-hachi/30 hover:bg-hachi/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
                  >
                    <span className="block text-sm font-semibold text-ink">{sample.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{sample.blurb}</span>
                  </button>
                ))}
                <p className="text-center text-xs text-ink-muted/70">
                  These profiles are invented for the demo — they are not real people.
                </p>
              </div>
            )}

            {showPaste && (
              <div className="mt-3">
                <textarea
                  value={resumeText}
                  onChange={(event) => {
                    setResumeText(event.target.value);
                    setResumeSource('paste');
                  }}
                  maxLength={LIMITS.maxResumeChars}
                  rows={8}
                  placeholder="Paste your resume text here…"
                  className="w-full rounded-xl border border-border-soft p-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-hachi"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  {resumeText.length} characters — at least {MIN_TEXT_CHARS} needed.
                </p>
              </div>
            )}
          </>
        )}

        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error.message}</span>
          </div>
        )}
      </section>

      {/* Job, against-job path only */}
      {path === 'against_job' && (
        <section className="rounded-2xl border border-border-soft bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">The job</h2>

          {fetchedJob ? (
            <div className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">{fetchedJob.title ?? 'Job description loaded'}</p>
                  <p className="text-xs text-emerald-800">
                    {[fetchedJob.company, fetchedJob.location].filter(Boolean).join(' · ') || 'Details not stated'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFetchedJob(null)}
                  className="text-xs font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-900"
                >
                  Use a different job
                </button>
              </div>
              {/* Shown before the review runs, so the user can see exactly what the model gets
                  rather than trusting an opaque scrape. */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-ink">
                  Check what we read from that link ({fetchedJob.descriptionText.length.toLocaleString()} characters)
                </summary>
                <pre className="mt-2 max-h-60 overflow-auto rounded-xl border border-border-soft bg-paper p-3 text-xs whitespace-pre-wrap text-ink">
                  {fetchedJob.descriptionText}
                </pre>
              </details>
            </div>
          ) : (
            <>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setJobMode('url')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    jobMode === 'url' ? 'bg-hachi/8 text-hachi' : 'text-ink-muted hover:bg-paper'
                  }`}
                >
                  <Link2 className="mr-1 inline h-3.5 w-3.5" />
                  Link
                </button>
                <button
                  type="button"
                  onClick={() => setJobMode('paste')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    jobMode === 'paste' ? 'bg-hachi/8 text-hachi' : 'text-ink-muted hover:bg-paper'
                  }`}
                >
                  <ClipboardPaste className="mr-1 inline h-3.5 w-3.5" />
                  Paste
                </button>
              </div>

              {jobMode === 'url' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    type="url"
                    value={jobUrl}
                    onChange={(event) => setJobUrl(event.target.value)}
                    placeholder="https://boards.greenhouse.io/…"
                    className="min-w-0 flex-1 rounded-xl border border-border-soft px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-hachi"
                  />
                  <button
                    type="button"
                    onClick={handleFetchJob}
                    disabled={!jobUrl.trim() || jobFetching}
                    className="inline-flex items-center gap-2 rounded-xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-hachi/30 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
                  >
                    {jobFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                    {jobFetching ? 'Reading…' : 'Read link'}
                  </button>
                </div>
              ) : (
                <textarea
                  ref={jobTextRef}
                  value={jobText}
                  onChange={(event) => setJobText(event.target.value)}
                  maxLength={LIMITS.maxJobDescriptionChars}
                  rows={8}
                  placeholder="Paste the job description here…"
                  className="mt-3 w-full rounded-xl border border-border-soft p-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-hachi"
                />
              )}

              {jobError && (
                <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{jobError.message}</span>
                </div>
              )}

              <p className="mt-2 text-xs text-ink-muted">
                Pasting always works. Many job sites block automated reading, so a link may not.
              </p>
            </>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={() => onStart({ resumeText: resumeText.trim(), path, jobDescription: effectiveJob })}
        disabled={!canStart}
        className="w-full rounded-xl bg-hachi px-6 py-3 font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
      >
        {busy ? 'Working…' : 'Review my resume'}
      </button>
      {!resumeReady && (
        <p className="text-center text-xs text-ink-muted">Add a resume above to continue.</p>
      )}
      {resumeReady && !jobReady && (
        <p className="text-center text-xs text-ink-muted">
          Add the job description above — a link or pasted text.
        </p>
      )}
    </div>
  );
}
