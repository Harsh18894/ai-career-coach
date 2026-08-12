'use client';

import React, { useState } from 'react';
import { AlertTriangle, Info, Pencil } from 'lucide-react';
import { REVIEW_PERSONAS, type ReviewPersona } from '@/lib/resume-review/schemas';
import type { PersonaClassification } from '@/lib/resume-review/persona';

/* =====================================================================================
 * The detected persona, with a one-click override.
 *
 * Persona sets the entire expectation bar, so misclassification is the loudest failure this
 * feature has: a senior engineer told to go get an internship closes the tab and does not come
 * back. The classification is therefore never applied silently — it is stated, explained in
 * the classifier's own plain-language signals, and correctable in one click.
 *
 * Low confidence (see PERSONA_CONFIDENCE_THRESHOLD) is surfaced as an explicit prompt to
 * confirm rather than buried, because the common ambiguous case — graduated 14 months ago, no
 * full-time role yet — sits exactly on the student/early-career line.
 * ===================================================================================== */

const PERSONA_LABELS: Record<ReviewPersona, string> = {
  student: 'Student',
  early_career: 'Early career',
  mid_level: 'Mid level',
  senior: 'Senior',
};

const PERSONA_DESCRIPTIONS: Record<ReviewPersona, string> = {
  student: 'Studying, or graduated within the last year, no full-time role yet',
  early_career: '0–2 years of full-time experience',
  mid_level: '2–6 years of full-time experience',
  senior: '6+ years of full-time experience',
};

export function PersonaBanner({
  classification,
  activePersona,
  needsConfirmation,
  busy,
  onOverride,
}: {
  classification: PersonaClassification;
  activePersona: ReviewPersona;
  needsConfirmation: boolean;
  busy: boolean;
  onOverride: (persona: ReviewPersona) => void;
}) {
  const [open, setOpen] = useState(needsConfirmation);
  const overridden = activePersona !== classification.persona;

  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${
        needsConfirmation && !overridden ? 'border-amber-300 bg-amber-50/60' : 'border-border-soft bg-white'
      }`}
      aria-label="Detected experience level"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Reviewing at this bar
          </p>
          <p className="mt-1 text-lg font-bold text-ink">
            {PERSONA_LABELS[activePersona]}
            {classification.careerSwitcher && (
              <span className="ml-2 rounded-full border border-hachi/30 bg-hachi/8 px-2 py-0.5 align-middle text-[11px] font-semibold tracking-wide text-hachi uppercase">
                Career switcher
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{PERSONA_DESCRIPTIONS[activePersona]}</p>
          {overridden && (
            <p className="mt-1 text-xs font-medium text-hachi">
              You set this. Detected: {PERSONA_LABELS[classification.persona]}.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          disabled={busy}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border-soft bg-white px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-hachi/30 hover:text-hachi disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
        >
          <Pencil className="h-3.5 w-3.5" />
          {open ? 'Close' : 'Not right?'}
        </button>
      </div>

      {needsConfirmation && !overridden && (
        <p className="mt-3 flex items-start gap-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This one was a close call — worth confirming before you read the review, since it decides
            how strictly everything below is judged.
          </span>
        </p>
      )}

      {open && (
        <div className="mt-4 border-t border-border-soft pt-4">
          <p className="mb-2 text-sm font-semibold text-ink">Review this resume as:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {REVIEW_PERSONAS.map((persona) => (
              <button
                key={persona}
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  if (persona !== activePersona) onOverride(persona);
                }}
                className={`rounded-xl border p-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi ${
                  persona === activePersona
                    ? 'border-hachi/30 bg-hachi/8'
                    : 'border-border-soft bg-white hover:border-hachi/30 hover:bg-hachi/5'
                }`}
              >
                <span className="block text-sm font-semibold text-ink">
                  {PERSONA_LABELS[persona]}
                  {persona === activePersona && <span className="ml-1.5 text-xs text-hachi">(current)</span>}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">{PERSONA_DESCRIPTIONS[persona]}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Changing this re-runs the review at the new bar.
          </p>
        </div>
      )}

      <details className="mt-3 group">
        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink">
          <Info className="h-3.5 w-3.5" />
          Why this level?
        </summary>
        <ul className="mt-2 space-y-1 pl-5 text-xs leading-relaxed text-ink-muted">
          {classification.signals.map((signal, index) => (
            <li key={index} className="list-disc">
              {signal}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
