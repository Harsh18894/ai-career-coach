'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { asClientError, isRetryable, type ClientError } from '@/lib/errors';
import {
  prepareReview,
  runReview,
  sendFindingFeedback,
  type ReviewResponse,
} from '@/lib/resume-review/client';
import { needsPersonaConfirmation, type PersonaClassification } from '@/lib/resume-review/persona-types';
import type { JobDescription, ReviewPath, ReviewPersona } from '@/lib/resume-review/schemas';
import { ReviewIntake, type IntakeResult } from '@/components/review/ReviewIntake';
import { PersonaBanner } from '@/components/review/PersonaBanner';
import { ReviewResults } from '@/components/review/ReviewResults';
import { primeBotProtection } from '@/lib/turnstile';
import { BackLink } from '@/components/shell/BackLink';

/* =====================================================================================
 * The resume-review surface.
 *
 * Deliberately its own page rather than a stage inside the coaching state machine: reviewing a
 * document and being coached toward a career direction are different jobs, and folding one
 * into the other would mean a seven-stage conversation had to accommodate a task that is not a
 * conversation at all.
 *
 * The review is not streamed. Post-validation runs on the complete model output and drops
 * fabricated findings before anything is rendered, so there is nothing safe to stream —
 * partial findings are, by definition, unvalidated ones. What the user gets instead is an
 * honest two-step progress indicator, since the pipeline genuinely is two requests.
 * ===================================================================================== */

type Phase = 'intake' | 'preparing' | 'reviewing' | 'done';

type Session = {
  resumeText: string;
  path: ReviewPath;
  jobDescription: JobDescription | null;
  preparedId: string | null;
  classification: PersonaClassification;
};

export default function ReviewPage() {
  const [phase, setPhase] = useState<Phase>('intake');
  const [session, setSession] = useState<Session | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [activePersona, setActivePersona] = useState<ReviewPersona | null>(null);
  const [error, setError] = useState<ClientError | null>(null);
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);
  const [notAResume, setNotAResume] = useState(false);

  // Same warm-up as the landing page: mint the invisible token in the background so the
  // review's first request does not wait on it.
  useEffect(() => {
    primeBotProtection();
  }, []);

  const fail = (err: unknown, retryFn?: () => Promise<void>) => {
    const clientError = asClientError(err);
    setError(clientError);
    setRetry(isRetryable(clientError.code) && retryFn ? () => retryFn : null);
  };

  /** Runs the review half, given an already-prepared session. */
  const executeReview = async (current: Session, persona?: ReviewPersona) => {
    setPhase('reviewing');
    setError(null);
    try {
      const response = await runReview({
        preparedId: current.preparedId,
        resumeText: current.resumeText,
        personaOverride: persona,
        jobDescription: current.jobDescription,
      });

      if (response.notAResume) {
        setNotAResume(true);
        setPhase('intake');
        return;
      }

      setReview(response);
      setActivePersona(response.result.persona);
      setPhase('done');
    } catch (err) {
      // Keep whatever review is already on screen — an override that fails should not wipe the
      // one the user was reading.
      setPhase(review ? 'done' : 'intake');
      fail(err, () => executeReview(current, persona));
    }
  };

  const handleStart = async (intake: IntakeResult) => {
    setPhase('preparing');
    setError(null);
    setNotAResume(false);
    setReview(null);

    try {
      const prepared = await prepareReview(intake.resumeText);

      if (prepared.notAResume) {
        setNotAResume(true);
        setPhase('intake');
        return;
      }

      const next: Session = {
        resumeText: intake.resumeText,
        path: intake.path,
        jobDescription: intake.jobDescription,
        preparedId: prepared.preparedId,
        classification: prepared.classification,
      };
      setSession(next);
      setActivePersona(prepared.classification.persona);
      await executeReview(next);
    } catch (err) {
      setPhase('intake');
      fail(err, () => handleStart(intake));
    }
  };

  const handleOverride = async (persona: ReviewPersona) => {
    if (!session) return;
    setActivePersona(persona);
    await executeReview(session, persona);
  };

  const busy = phase === 'preparing' || phase === 'reviewing';

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-10">
      <header className="mb-6">
        <BackLink />
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Resume review</h1>
        <p className="mt-2 leading-relaxed text-ink-muted">
          A line-by-line read of your resume, judged against the bar for your actual stage — with
          rewrites you can copy. It will never invent a number you did not give it.
        </p>
      </header>

      {notAResume && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            That does not look like a resume, so there is nothing to review. Upload or paste a resume
            and try again.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="font-medium">{error.message}</span>
          </div>
          {retry && (
            <button
              type="button"
              onClick={() => {
                // `retry` holds the closure itself: setRetry(() => fn) stores fn, because
                // React treats a function argument to a setter as an updater.
                const run = retry;
                setError(null);
                setRetry(null);
                void run();
              }}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
          )}
        </div>
      )}

      {phase === 'intake' && <ReviewIntake onStart={handleStart} busy={busy} />}

      {busy && (
        <div className="rounded-2xl border border-border-soft bg-white p-6 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-hachi" />
          <p className="mt-3 font-semibold text-ink">
            {phase === 'preparing' ? 'Reading your resume…' : 'Reviewing…'}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {phase === 'preparing'
              ? 'Step 1 of 2 — working out the structure and your experience level.'
              : 'Step 2 of 2 — this is the slow part, usually around 30–45 seconds.'}
          </p>
        </div>
      )}

      {session && activePersona && (phase === 'done' || phase === 'reviewing') && (
        <div className={`space-y-5 ${phase === 'reviewing' ? 'mt-5' : ''}`}>
          <PersonaBanner
            classification={session.classification}
            activePersona={activePersona}
            needsConfirmation={needsPersonaConfirmation(session.classification)}
            busy={busy}
            onOverride={handleOverride}
          />

          {phase === 'done' && review && (
            <ReviewResults
              result={review.result}
              groupIndex={review.groups}
              onVote={(findingId, verdict) => {
                const finding = review.result.findings.find((entry) => entry.id === findingId);
                if (!finding) return;
                sendFindingFeedback({
                  findingId,
                  verdict,
                  dimension: finding.dimension,
                  severity: finding.severity,
                  persona: review.result.persona,
                  path: review.result.path,
                });
              }}
            />
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="mt-8 border-t border-border-soft pt-5 text-center">
          <button
            type="button"
            onClick={() => {
              setPhase('intake');
              setSession(null);
              setReview(null);
              setActivePersona(null);
              setError(null);
            }}
            className="text-sm font-semibold text-hachi underline-offset-2 hover:underline"
          >
            Review a different resume
          </button>
        </div>
      )}
    </div>
  );
}
