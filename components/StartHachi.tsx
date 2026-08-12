'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SAMPLE_PROFILES } from '@/lib/samples';
import { readStashedResumeText } from '@/lib/resume-stash';
import { setPendingIntake } from '@/lib/pending-intake';
import { isSampleSession } from '@/lib/session';
import { track } from '@/lib/analytics';

/**
 * The visitor's own resume, if this browser has one.
 *
 * Samples are stashed through the same key, so the stash alone does not mean "yours" — someone
 * who tried Priya's profile would otherwise be offered "the resume you already gave me" and
 * handed Priya's back. The sample flag on the current session is what separates the two.
 */
function readOwnResumeText(): string | null {
  if (isSampleSession()) return null;
  return readStashedResumeText();
}

/** Fired when the chooser starts a session on a page that is already "/". */
export const START_EVENT = 'hachi:start';

/**
 * What the chooser decided. Absent `sampleId` and absent `mode` means "the visitor's own
 * resume", which travels separately in the pending-intake holder because a File cannot ride
 * on a URL.
 */
export type StartDetail = {
  sampleId?: string;
  /** 'questions' skips the resume entirely and opens the guided intake. */
  mode?: 'questions';
};

/* =====================================================================================
 * "Try Hachi" — choosing a resume before the conversation starts.
 *
 * Every entry point used to be a silent deep link: clicking a CTA dropped you into a running
 * conversation with a stranger's resume already loaded, with nothing on screen explaining what
 * had just happened or whose career was being discussed. That is a disorienting first ten
 * seconds for the exact visitor the landing page works hardest to earn.
 *
 * So the CTA now answers two things before navigating: WHAT is about to happen, and WHOSE
 * resume it will use — your own, or one of three fictional samples, each named and described so
 * "sample" is never mistaken for "yours".
 *
 * There was briefly a first step here asking which product you wanted, career paths or a resume
 * review. It was removed: the review has its own CTA in the hero and its own link in the header,
 * so the fork asked a question the page had already answered, and every visitor paid a click
 * for it.
 *
 * "Use my own resume" IS the upload. It opens the file picker directly, and the chosen PDF goes
 * straight into a conversation — it used to hand off to a second screen with its own dropzone
 * and its own copy, which meant two clicks and a page of re-explanation to do the one thing the
 * button already said. If a resume is already in this browser it skips the picker entirely,
 * which is also what makes the "already gave me" label on that row true rather than decorative.
 *
 * A real modal: Escape closes, focus moves in on open and returns to the trigger on close, the
 * backdrop is inert to screen readers, body scroll is locked, and the whole thing is keyboard
 * reachable.
 * ===================================================================================== */

export function StartHachiButton({
  label = 'Try Hachi',
  className = '',
  children,
}: {
  label?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-haspopup="dialog"
      >
        {children ?? label}
      </button>
      {/* Portalled to <body>: no SSR guard needed, because `open` only becomes true from a
          click, by which point document.body certainly exists. */}
      {open && createPortal(
        <StartDialog
          onClose={() => {
            setOpen(false);
            // Focus belongs back where it came from, or the next Tab starts at the top of the
            // document.
            queueMicrotask(() => triggerRef.current?.focus());
          }}
        />,
        document.body
      )}
    </>
  );
}

function StartDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /* Lazy initialiser, not an effect: the dialog only ever mounts client-side (it renders on a
   * click), so there is no server render for a sessionStorage read to disagree with — and this
   * avoids a state update inside an effect body. */
  const [hasOwnResume] = useState(() => Boolean(readOwnResumeText()));

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Focus trap. `aria-modal="true"` promises assistive tech that the rest of the page is
      // inert; without this, Tab walked straight out into the page behind and a keyboard user
      // was left tabbing through a document they could not see, with no way back.
      const panel = panelRef.current;
      if (!panel) return;
      // Anything deliberately out of the tab order carries tabindex="-1" — the hidden file
      // input included. Excluding by attribute rather than by measured visibility is what makes
      // this work identically in a browser and in jsdom, which has no layout to measure.
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // The page behind a modal should not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  /**
   * Hands off to the home experience, which owns every request, spinner and error from here on.
   * Anything the session needs beyond a sample id travels in the pending-intake holder.
   *
   * Neither the session nor the sample_cta_click event is recorded here. Both the START_EVENT
   * listener and the deep-link mount effect already do it, so doing it here as well minted two
   * session ids and attributed the click to the one that was immediately discarded.
   */
  const start = useCallback(
    (detail: StartDetail = {}) => {
      // "/" is the product as well as the landing page. Pushing `/?start=…` while already on
      // "/" changes the URL without remounting anything, so the mount-only effect that reads
      // the param never ran and the button appeared dead. On the home page the dialog dispatches
      // an event the experience is listening for; anywhere else a real navigation happens and
      // the mount effect picks it up.
      if (window.location.pathname === '/') {
        window.dispatchEvent(new CustomEvent<StartDetail>(START_EVENT, { detail }));
      } else {
        router.push(`/?start=${detail.sampleId ?? detail.mode ?? 'own'}`);
      }
      onClose();
    },
    [router, onClose]
  );

  /**
   * The upload row. Synchronous from the click all the way to `.click()` — awaiting anything
   * first (a token, a fetch) would push the call into a later task and browsers would refuse to
   * open the picker, since it is no longer attributable to a user gesture.
   */
  const onOwnResume = () => {
    track('upload_cta_click', { path: 'own_resume' });

    const stashed = readOwnResumeText();
    if (stashed) {
      setPendingIntake({ kind: 'text', text: stashed });
      start();
      return;
    }

    fileInputRef.current?.click();
  };

  /** No resume at all: Hachi builds the profile by asking, right in the conversation. */
  const onAnswerQuestions = () => {
    track('upload_cta_click', { path: 'no_resume' });
    start({ mode: 'questions' });
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    // Cleared after reading the File and before anything async, so picking the same filename
    // again after a failure still fires a change event.
    e.target.value = '';
    // Picker cancelled. Nothing happened, and the dialog is still open behind it.
    if (!file) return;

    setPendingIntake({ kind: 'file', file });
    start();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="rise-in relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border-soft bg-paper p-6 shadow-xl focus:outline-none sm:rounded-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-[22px] font-semibold tracking-[-0.02em] text-ink sm:text-[26px]">
              Which resume should Hachi use?
            </h2>
            <p className="mt-1.5 text-[15px] text-ink-muted">
              It&rsquo;ll ask a few questions about where you want to go, then show you three
              directions and a week-by-week plan for the one you pick.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-lg p-2 text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
          >
            <span className="sr-only">Close</span>
            <span aria-hidden="true" className="block text-lg leading-none">×</span>
          </button>
        </div>

        <div className="mt-6">
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={onFileChosen}
              aria-label="Choose your resume PDF"
              // Never a tab stop: it is display:none and driven entirely by the row above it.
              // Also how the focus trap knows to skip it.
              tabIndex={-1}
            />

            <button
              type="button"
              onClick={onOwnResume}
              className="flex w-full items-baseline justify-between gap-4 rounded-xl border border-hachi/35 bg-hachi/6 p-4 text-left transition-colors hover:border-hachi focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
            >
              <span>
                <span className="block font-semibold text-ink">
                  {hasOwnResume ? 'Use the resume you already gave me' : 'Upload my resume'}
                </span>
                <span className="mt-0.5 block text-[14px] text-ink-muted">
                  {hasOwnResume
                    ? 'Already in this browser — nothing to upload again.'
                    : 'Pick a PDF and Hachi starts reading it right away.'}
                </span>
              </span>
              <span aria-hidden="true" className="text-hachi">→</span>
            </button>

            {/* Quiet, because it is the minority case — but present, because someone whose
                resume is a Google Doc, a LinkedIn profile, or nowhere at all still has a career
                to talk about. It starts the conversation directly: Hachi asks for what it needs
                rather than sending them to a page of upload options they already declined. */}
            <p className="pt-1 text-[13px] text-ink-muted">
              <button
                type="button"
                onClick={onAnswerQuestions}
                className="rounded font-medium text-ink underline decoration-border-soft underline-offset-2 transition-colors hover:decoration-hachi focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
              >
                No PDF? Answer a few questions instead
              </button>
            </p>

            <p className="pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Or try it on a sample
            </p>

            {SAMPLE_PROFILES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => start({ sampleId: sample.id })}
                className="flex w-full items-baseline justify-between gap-4 rounded-xl border border-border-soft bg-surface p-4 text-left transition-colors hover:border-ink/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
              >
                <span>
                  <span className="block font-semibold text-ink">{sample.label}</span>
                  <span className="mt-0.5 block text-[14px] text-ink-muted">{sample.blurb}</span>
                </span>
                <span aria-hidden="true" className="text-ink-muted">→</span>
              </button>
            ))}
          </div>

          <p className="mt-5 text-[13px] text-ink-muted">
            Just want feedback on your resume instead?{' '}
            <Link href="/review" onClick={onClose} className="font-semibold text-ink underline decoration-border-soft underline-offset-2 hover:decoration-hachi">
              Review my resume
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
