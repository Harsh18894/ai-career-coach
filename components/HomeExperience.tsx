'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import ResumeUpload from '@/components/ResumeUpload';
import ChatWindow from '@/components/ChatWindow';
import AnalyzingProgress, { RESUME_ANALYSIS_STEPS } from '@/components/AnalyzingProgress';
import { Profile, AdaptiveQuestion } from '@/lib/ai/schemas';
import { asClientError, type ClientError } from '@/lib/errors';
import { isSampleSession, startNewSession } from '@/lib/session';
import { findSampleProfile, type SampleProfile } from '@/lib/samples';
import { primeBotProtection } from '@/lib/turnstile';
import { runIntake, beginSampleSession, type IntakeSource } from '@/lib/intake';
import { takePendingIntake } from '@/lib/pending-intake';
import type { FunnelPath } from '@/lib/analytics-events';
import { startSpan } from '@/lib/journey';
import { STORAGE_KEYS } from '@/lib/brand';
import { START_EVENT, type StartDetail } from '@/components/StartHachi';

/**
 * A real session starting on top of a sample run has to shed the sample tag, or every request
 * for the rest of the visit is filtered out of usage metrics as demo traffic.
 *
 * Deliberately conditional: re-minting on every start would hand out a fresh per-session
 * ceiling each time, and those ceilings are what stop a runaway client (see lib/limits.ts).
 */
function shedSampleTag(): void {
  if (isSampleSession()) startNewSession();
}

/* =====================================================================================
 * The home experience: the landing page and the product, in one place.
 *
 * There is no /coach route any more. It never earned its own URL — it was the same session the
 * landing page was selling, one navigation away, and the split meant a visitor who started a
 * session lost the page that explained what was about to happen.
 *
 * How the fold survives this. The landing sections are still a SERVER component; they arrive
 * here as the `landing` prop, already rendered. React renders a node passed from a server
 * component as-is, so the marketing HTML is still in the initial payload and the fold still
 * paints without waiting for client JS — which is what Pass B's LCP budget requires. Only the
 * swap logic is client-side.
 *
 * Three states:
 *   idle     the landing page, plus a "continue" card if a session is already saved
 *   working  intake / analysis / conversation / plan — the whole product
 * ===================================================================================== */
export function HomeExperience({ landing }: { landing: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opener, setOpener] = useState<AdaptiveQuestion | null>(null);
  const [noResumeMode, setNoResumeMode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isIntakeLoading, setIsIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<ClientError | null>(null);
  /** True once the visitor has actually asked to begin. Until then the landing page is the
   * page — a saved session is offered, never forced. */
  const [started, setStarted] = useState(false);
  /** A conversation already exists in this browser from a previous visit. */
  const [hasSavedSession, setHasSavedSession] = useState(false);
  /** Latest runIntakeFlow, for the mount-only deep-link effect and the chooser's event to call. */
  const submitRef = useRef<((source: IntakeSource, path: FunnelPath) => Promise<void>) | null>(null);
  /** Latest handleStartWithoutResume, for the same reason submitRef exists. */
  const guidedRef = useRef<(() => void) | null>(null);
  /** Identifies the newest run, so a superseded one cannot write stale state on the way out. */
  const intakeRunIdRef = useRef(0);

  useEffect(() => {
    // Warm the invisible bot check so a token exists before the user uploads anything. Costs
    // nothing visible and keeps the challenge off the critical path of a session start.
    primeBotProtection();

    // Deep link from the "Try Hachi" chooser: /?start=<sampleId> begins that sample straight
    // away, /?start=own carries a resume the chooser already collected, /?start=questions opens
    // the guided intake. Read once and stripped from the URL, so a refresh does not silently
    // start a second session and charge the quota again.
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start');
    if (start === 'questions') {
      window.history.replaceState({}, '', '/');
      queueMicrotask(() => {
        setStarted(true);
        setIsInitializing(false);
        guidedRef.current?.();
      });
      return;
    }
    if (start === 'own') {
      window.history.replaceState({}, '', '/');
      // Taken outside the microtask, and take-once, so StrictMode's second invocation of this
      // effect finds nothing and cannot upload the same resume twice. An empty holder means a
      // hard reload lost the file — the intake screen is the right place to land then.
      const pending = takePendingIntake();
      queueMicrotask(() => {
        setStarted(true);
        setIsInitializing(false);
        if (pending) void submitRef.current?.(pending, 'own_resume');
      });
      return;
    }
    const sampleId = start;
    const sample = findSampleProfile(sampleId);
    if (sample) {
      window.history.replaceState({}, '', '/');
      const source = beginSampleSession(sample);
      // Deferred to a microtask so no state update happens synchronously inside the effect
      // body, and so this does not pull runIntakeFlow into the dependency array of a mount-only
      // effect (which would re-run it on every render of a changed closure).
      queueMicrotask(() => {
        setStarted(true);
        setIsInitializing(false);
        void submitRef.current?.(source, 'sample');
      });
      return;
    }

    const saved = localStorage.getItem(STORAGE_KEYS.session);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.profile && parsed.messages && parsed.messages.length > 0) {
          setHasSavedSession(true);
          setProfile(parsed.profile);
          // Only used to gate which screen renders below — ChatWindow restores the full
          // conversation (including any real options) itself from the same localStorage key,
          // so the options/allowMultiple fields here are irrelevant placeholders.
          const openerMessage = parsed.messages.find((m: any) => m.id === 'opener')?.content || parsed.messages[0]?.content;
          setOpener({ message: openerMessage, options: null, allowMultiple: false, offTopic: false });
        }
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    }
    setIsInitializing(false);
  }, []);

  /**
   * The guided path: no resume at all, profile built by answering questions in the conversation.
   * Reached from the chooser's "answer a few questions" link and from the intake screen's own.
   */
  const handleStartWithoutResume = () => {
    setIntakeError(null);
    shedSampleTag();
    // The no-resume flow reaches paths through the guided intake instead of an upload, but it
    // is the same span: "from committing to this, how long until I see recommendations".
    startSpan('intake_to_first_paths');
    setStarted(true);
    setNoResumeMode(true);
  };

  /**
   * The one place a resume becomes a conversation, whichever door it came through: the chooser's
   * file picker, the intake screen's dropzone, a pasted block of text, or a sample profile.
   * lib/intake.ts owns the requests; this owns the screen.
   */
  const runIntakeFlow = async (source: IntakeSource, path: FunnelPath) => {
    const runId = ++intakeRunIdRef.current;

    // Keyed on the funnel path, not the source kind: pasting your own resume after trying a
    // sample is just as much a real session as uploading one, and keying on `kind === 'file'`
    // left that case tagged as demo traffic for the rest of the visit.
    if (path === 'own_resume') shedSampleTag();

    setIsIntakeLoading(true);
    setIntakeError(null);

    try {
      const result = await runIntake(source, { path });
      if (runId !== intakeRunIdRef.current) return;

      if (result.status === 'insufficient') {
        handleStartWithoutResume();
        return;
      }

      setProfile(result.profile);
      setOpener(result.opener);
    } catch (err) {
      if (runId !== intakeRunIdRef.current) return;
      const clientError = asClientError(err);
      console.error(`[${clientError.code}]`, err);
      setIntakeError(clientError);
    } finally {
      if (runId === intakeRunIdRef.current) setIsIntakeLoading(false);
    }
  };

  const handleFileSubmit = (file: File) => {
    void runIntakeFlow({ kind: 'file', file }, 'own_resume');
  };

  /** The visitor's own resume, pasted as text rather than uploaded. */
  const handleManualTextSubmit = (text: string) => {
    void runIntakeFlow({ kind: 'text', text }, 'own_resume');
  };

  /**
   * A fictional sample. Distinct from the paste path despite both sending text: the session has
   * to be tagged as a demo run, and the funnel has to be able to tell the two apart — that is
   * the entire point of segmenting by intake path.
   */
  const handleSampleSubmit = (sample: SampleProfile) => {
    setStarted(true);
    void runIntakeFlow(beginSampleSession(sample), 'sample');
  };

  // Assigned in an effect, not during render — a ref written during render is a lint error and
  // a correctness hazard under concurrent rendering. Declared after runIntakeFlow so the
  // binding exists; effects run after the whole body, so ordering is not an issue.
  useEffect(() => {
    submitRef.current = runIntakeFlow;
    guidedRef.current = handleStartWithoutResume;
  });

  /* The chooser cannot navigate to start a session when the visitor is already on "/" — the
   * URL would change without remounting anything. It dispatches instead, and this is the ear. */
  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<StartDetail>).detail;

      // "No PDF" — straight into the guided conversation, no intake screen in between.
      if (detail?.mode === 'questions') {
        guidedRef.current?.();
        return;
      }

      const sample = findSampleProfile(detail?.sampleId);

      setStarted(true);

      if (!sample) {
        // "Upload my resume". The chooser has already collected the PDF (or the resume this
        // browser was holding) and parked it; an empty holder can only mean the file was lost,
        // and the intake screen is the right place to land then.
        const pending = takePendingIntake();
        if (pending) void submitRef.current?.(pending, 'own_resume');
        return;
      }

      void submitRef.current?.(beginSampleSession(sample), 'sample');
    };

    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, []);

  const handleReset = () => {
    setProfile(null);
    setOpener(null);
    setNoResumeMode(false);
    setStarted(false);
    setHasSavedSession(false);
  };

  const inSession = (profile && opener) || noResumeMode;

  /* ------------------------------ IDLE: the landing page ------------------------------ */
  if (!started && !inSession) {
    return (
      <>
        {hasSavedSession && (
          <div className="border-b border-border-soft bg-hachi/6">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <p className="text-[15px] text-ink">
                <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-hachi" />
                You have a conversation in progress.
              </p>
              <button
                type="button"
                onClick={() => setStarted(true)}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2"
              >
                Pick up where you left off →
              </button>
            </div>
          </div>
        )}
        {landing}
      </>
    );
  }

  /* --------------------------- WORKING: the product itself ---------------------------
     Bounded height so the conversation's pinned composer has something to sit against —
     the same constraint the old /coach route layout provided. */
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col sm:min-h-[calc(100dvh-4rem)]">
      {/* Back out of the session without losing it. The saved conversation stays in this
          browser; this only returns to the page that explains what Hachi is. */}
      {!inSession && (
        <div className="border-b border-border-soft px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setStarted(false)}
            className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
          >
            <span aria-hidden="true">‹</span>
            Back to home
          </button>
        </div>
      )}

      {isInitializing ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-4 py-8 sm:py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-hachi" />
          <p className="text-sm font-medium text-ink-muted">Loading your session…</p>
        </div>
      ) : isIntakeLoading ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12">
          <AnalyzingProgress steps={RESUME_ANALYSIS_STEPS} />
        </div>
      ) : inSession ? (
        <ChatWindow initialProfile={profile} initialOpener={opener} onReset={handleReset} />
      ) : (
        <div className="flex w-full flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12">
          <ResumeUpload
            onFileSubmit={handleFileSubmit}
            onManualTextSubmit={handleManualTextSubmit}
            onSampleSubmit={handleSampleSubmit}
            onStartWithoutResume={handleStartWithoutResume}
            error={intakeError}
          />
        </div>
      )}
    </div>
  );
}
