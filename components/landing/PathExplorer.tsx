'use client';

import React, { useState } from 'react';
import { SAMPLE_PATHS, type SamplePath } from './SampleData';

/* =====================================================================================
 * The three paths, expandable, with the evidence made visible.
 *
 * The differentiator this section exists to demonstrate is that a recommendation must point at
 * something the person actually did. So the evidence is not prose to be read — it is marked,
 * highlighted inside the rationale, and listed as discrete fragments. A visitor who reads
 * nothing should still see orange marks sitting on top of a resume fact.
 *
 * Tier and the ambition verdict do the calibration work that a "% fit" would otherwise do.
 * See the note in components/trajectory/Trajectory.tsx on why there is no percentage.
 * ===================================================================================== */

const TIER_COPY: Record<SamplePath['tier'], { label: string; note: string }> = {
  conservative: { label: 'Conservative', note: 'Closest to where you are' },
  realistic: { label: 'Realistic', note: 'The one to actually aim at' },
  ambitious: { label: 'Ambitious', note: 'A real stretch' },
};

const VERDICT_COPY: Record<SamplePath['ambition']['verdict'], string> = {
  aligned: 'Evidence supports it',
  too_high: 'Ahead of your evidence',
  too_low: 'Below what you have shown',
};

/**
 * Highlights the evidence fragments inside the rationale.
 *
 * Case-insensitive, first occurrence only, and it falls back to the plain sentence if a
 * fragment is not found — a highlighter that silently mangles the text would be worse than no
 * highlighting at all.
 */
function withEvidenceMarks(text: string, fragments: string[]): React.ReactNode[] {
  let remaining = text;
  const out: React.ReactNode[] = [];

  fragments.forEach((fragment, i) => {
    const at = remaining.toLowerCase().indexOf(fragment.toLowerCase());
    if (at === -1) return;
    out.push(remaining.slice(0, at));
    out.push(
      <mark
        key={`${fragment}-${i}`}
        className="rounded bg-hachi/12 px-1 font-medium text-ink decoration-clone"
      >
        {remaining.slice(at, at + fragment.length)}
      </mark>
    );
    remaining = remaining.slice(at + fragment.length);
  });

  out.push(remaining);
  return out;
}

function PathCard({ path, isOpen, onToggle }: { path: SamplePath; isOpen: boolean; onToggle: () => void }) {
  const tier = TIER_COPY[path.tier];
  const panelId = `path-panel-${path.id}`;

  return (
    <article
      className={`flex flex-col rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-200 ${
        isOpen ? 'border-hachi/40 shadow-[0_2px_16px_rgba(255,90,54,0.08)]' : 'border-border-soft'
      }`}
    >
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span className="font-mono text-xs font-semibold tracking-widest text-ink-muted">{path.index}</span>
          <span className="text-right">
            <span className="block text-xs font-semibold uppercase tracking-wider text-hachi">{tier.label}</span>
            <span className="block text-xs text-ink-muted">{path.timeline}</span>
          </span>
        </div>

        {/* Fixed minimum so a two-line title in one card does not push its salary and control
            row out of line with the single-line titles beside it. */}
        <h3 className="mt-3 min-h-[3.5rem] text-lg font-semibold leading-snug tracking-tight text-ink sm:text-xl">
          {path.title}
        </h3>
        <p className="mt-2 min-h-[3.75rem] text-[15px] leading-relaxed text-ink-muted">{path.summary}</p>

        <p className="mt-4 text-sm font-medium text-ink">{path.salaryRange}</p>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="mt-auto pt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-hachi transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2 rounded"
        >
          {isOpen ? 'Hide the reasoning' : 'Why this fits'}
          <span aria-hidden="true" className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
            ›
          </span>
        </button>
      </div>

      {isOpen && (
        <div id={panelId} className="rise-in border-t border-border-soft px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink">
            Why Hachi thinks this
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-hachi" />
          </h4>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
            {withEvidenceMarks(path.fitRationale, path.evidence)}
          </p>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">From your background</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {path.evidence.map((e) => (
                <li
                  key={e}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hachi/25 bg-hachi/6 px-2.5 py-1 text-xs font-medium text-ink"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-hachi" />
                  {e}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 rounded-xl bg-paper p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink">
              Ambition check — {VERDICT_COPY[path.ambition.verdict]}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{path.ambition.note}</p>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">First move</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">{path.firstMove}</p>
          </div>
        </div>
      )}
    </article>
  );
}

export function PathExplorer() {
  // The middle path opens by default: a visitor who never clicks anything still sees the
  // evidence mechanic, which is the whole point of the section.
  const [openId, setOpenId] = useState<string | null>(SAMPLE_PATHS[1].id);

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:items-start sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0">
      {SAMPLE_PATHS.map((path, i) => (
        <div
          key={path.id}
          className="rise-in w-[85vw] max-w-sm flex-shrink-0 snap-start sm:w-auto sm:max-w-none"
          style={{ animationDelay: `${i * 0.09}s` }}
        >
          <PathCard
            path={path}
            isOpen={openId === path.id}
            onToggle={() => setOpenId((cur) => (cur === path.id ? null : path.id))}
          />
        </div>
      ))}
    </div>
  );
}
