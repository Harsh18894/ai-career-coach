'use client';

import React, { useState } from 'react';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Severity } from '@/lib/resume-review/schemas';

/* =====================================================================================
 * Small shared pieces of the review UI.
 * ===================================================================================== */

/**
 * Renders a suggested rewrite with its [bracketed placeholders] visually distinct.
 *
 * This is the visible half of the no-fabrication rule. The candidate has to be able to see at
 * a glance which parts are their own words and which are blanks they need to fill — a rewrite
 * that quietly reads as finished would invite them to paste a sentence containing "[X%]" into
 * a real resume.
 */
export function PlaceholderText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]*\])/g);
  return (
    <>
      {parts.map((part, index) =>
        /^\[[^\]]*\]$/.test(part) ? (
          <mark
            key={index}
            className="mx-0.5 rounded-sm bg-amber-100 px-1 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-300 ring-inset"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

/** The standing explanation of why the tool leaves blanks. Shown in the interface itself, not
 * only in the README — a user who never reads the docs still needs to understand it. */
export function PlaceholderNote() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
      <p className="font-semibold">Why some rewrites contain blanks like <span className="rounded-sm bg-amber-100 px-1 ring-1 ring-amber-300 ring-inset">[X%]</span></p>
      <p className="mt-1.5 leading-relaxed">
        Only you know your real numbers. This tool will not invent one for you — a metric you cannot
        defend in an interview is worse than no metric at all. Fill each blank in with the figure you
        can actually stand behind, and delete the bracket if you genuinely do not have one.
      </p>
    </div>
  );
}

/* ---- severity ---------------------------------------------------------------------------- */

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-rose-50 text-rose-800 border-rose-300',
  improvement: 'bg-amber-50 text-amber-900 border-amber-300',
  polish: 'bg-paper text-ink border-border-soft',
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  improvement: 'Improvement',
  polish: 'Polish',
};

/** Text label always present — severity is never communicated by colour alone. */
export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${SEVERITY_STYLES[severity]}`}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

const COVERAGE_STYLES: Record<string, string> = {
  covered: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  partial: 'bg-amber-50 text-amber-900 border-amber-300',
  absent: 'bg-rose-50 text-rose-800 border-rose-300',
};

const COVERAGE_LABELS: Record<string, string> = {
  covered: 'Covered',
  partial: 'Partly covered',
  absent: 'Not addressed',
};

/** Same rule as severity: the word carries the meaning, the colour only reinforces it. */
export function CoverageChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${COVERAGE_STYLES[status] ?? COVERAGE_STYLES.absent}`}
    >
      {COVERAGE_LABELS[status] ?? status}
    </span>
  );
}

/* ---- copy ------------------------------------------------------------------------------- */

export function CopyButton({ text, label = 'Copy rewrite' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be denied; the text is selectable on screen either way.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border-soft bg-white px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-hachi/30 hover:text-hachi focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
      aria-label={label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ---- feedback --------------------------------------------------------------------------- */

export function FeedbackButtons({ onVote }: { onVote: (verdict: 'up' | 'down') => void }) {
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);

  const vote = (verdict: 'up' | 'down') => {
    if (voted) return;
    setVoted(verdict);
    onVote(verdict);
  };

  if (voted) {
    return <span className="text-xs text-ink-muted">Thanks — noted.</span>;
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="mr-1 text-xs text-ink-muted/70">Useful?</span>
      <button
        type="button"
        onClick={() => vote('up')}
        aria-label="This finding was useful"
        className="rounded-md p-1 text-ink-muted/70 transition-colors hover:bg-emerald-50 hover:text-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => vote('down')}
        aria-label="This finding was not useful"
        className="rounded-md p-1 text-ink-muted/70 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
