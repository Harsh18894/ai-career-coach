'use client';

import React from 'react';
import { ArrowDown } from 'lucide-react';
import type { Finding } from '@/lib/resume-review/schemas';
import { CopyButton, FeedbackButtons, PlaceholderText, SeverityChip } from './ReviewPrimitives';

/* =====================================================================================
 * One finding, presented as a diff rather than as advice.
 *
 * "Your bullets could be more quantified" is something the candidate already suspects and
 * cannot act on. Showing the exact line they wrote, the exact line to replace it with, and one
 * sentence on why is the whole difference between a review and a lecture.
 * ===================================================================================== */

const DIMENSION_LABELS: Record<string, string> = {
  section_completeness: 'Missing section',
  quantified_impact: 'Impact not quantified',
  ats_parse_safety: 'Parsing risk',
  action_verb_strength: 'Weak opener',
  signal_to_length: 'Length and emphasis',
  narrative_coherence: 'Career narrative',
  evidence_portfolio: 'Evidence',
  requirement_coverage: 'Job requirement',
};

export function FindingCard({
  finding,
  onVote,
}: {
  finding: Finding;
  onVote: (verdict: 'up' | 'down') => void;
}) {
  const hasRewrite = Boolean(finding.suggestedText);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <SeverityChip severity={finding.severity} />
        <span className="text-xs font-semibold text-slate-500">
          {DIMENSION_LABELS[finding.dimension] ?? finding.dimension}
        </span>
      </header>

      {finding.originalText.trim() !== '' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Currently
          </p>
          <p className="text-sm leading-relaxed text-slate-700">{finding.originalText}</p>
        </div>
      )}

      {hasRewrite && (
        <>
          <div className="flex justify-center py-1.5" aria-hidden="true">
            <ArrowDown className="h-4 w-4 text-slate-300" />
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-wide text-indigo-700 uppercase">
                Suggested
              </p>
              <CopyButton text={finding.suggestedText ?? ''} />
            </div>
            <p className="text-sm leading-relaxed text-slate-800">
              <PlaceholderText text={finding.suggestedText ?? ''} />
            </p>
            {finding.addedPlaceholders.length > 0 && (
              <p className="mt-2 text-xs text-amber-800">
                You fill in: {finding.addedPlaceholders.join(', ')}
              </p>
            )}
          </div>
        </>
      )}

      <footer className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-600">{finding.reason}</p>
        <FeedbackButtons onVote={onVote} />
      </footer>
    </article>
  );
}
