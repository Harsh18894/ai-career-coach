import React from 'react';
import { DollarSign } from 'lucide-react';
import TierBadge from '@/components/TierBadge';

/* =====================================================================================
 * Real output, shown on the landing page.
 *
 * Copied verbatim from committed eval snapshots, which are themselves real model output
 * captured from real runs:
 *
 *   path    — evals/.cache/snapshots/generatePaths:R-grow-01:c3.json  (the second of three)
 *   roadmap — evals/.cache/snapshots/generateRoadmap:R-grad-01:g1.json
 *
 * Not a mockup and not written by hand. The whole argument of the fold is that the product's
 * actual output is the most convincing thing available, so inventing prettier copy here would
 * defeat the point — and would be the exact dishonesty the audience is good at spotting.
 *
 * The fixtures are fictional people (see lib/samples and evals/fixtures), so no real person's
 * career appears on the page.
 *
 * These are static constants rather than a live call: the landing page is a server component
 * that must paint fast, and generating a path deck on page load would cost 30 seconds and real
 * money per visitor.
 * ===================================================================================== */

export const SAMPLE_PATH = {
  title: 'Principal Revenue Operations — Systems & Analytics Lead',
  tier: 'realistic' as const,
  salaryRange: 'CAD 120,000 – 160,000',
  fitRationale:
    'You built Ledgerly’s first SQL-based commission calculation engine, own the executive revenue dashboard, and redesigned the forecasting model (variance 18% → 7%). If you prefer to keep shipping technical systems and own platform-level reliability rather than people management, this role matches your demonstrated technical impact.',
  ambitionCheck: {
    verdict: 'aligned' as const,
    note: 'You already shipped the commission engine and executive dashboard; pushing those artifacts to production-grade is a natural, supported step rather than a stretch.',
  },
};

export const SAMPLE_ROADMAP = {
  totalDuration: '12 weeks (~3 months)',
  skillLevel: 'basic' as const,
  summary:
    'Relevant internship experience in data engineering (ETL, warehousing, Airflow, dbt) but no full-time DE role yet, so the plan leans on advanced specialisation and a portfolio strong enough to apply with.',
  phases: [
    {
      type: 'course',
      title: 'Advanced Data Engineering Foundations',
      week: 1,
      focus: 'Advanced SQL & query optimization',
      items: ['Study window functions, CTEs, partitioning', 'Practice with explain plans on sample queries'],
    },
    {
      type: 'project',
      title: 'End-to-end Pipeline Portfolio Project',
      week: 4,
      focus: 'Project scoping and data ingestion',
      items: ['Define dataset (CSV with 5 fields) and create sample file', 'Set up Git repo and project structure'],
    },
  ],
};

/**
 * A path card, styled to match the real PathCard in the app closely enough to be recognisable
 * as the same artifact, but rendered flat and non-interactive — there is nothing to expand here.
 */
export function SamplePathCard() {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="text-base font-bold leading-snug text-slate-900 sm:text-lg">
        {SAMPLE_PATH.title}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
          <DollarSign className="mr-1 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          {SAMPLE_PATH.salaryRange}
        </span>
        <TierBadge tier={SAMPLE_PATH.tier} />
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Why this fits you
        </h4>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{SAMPLE_PATH.fitRationale}</p>
      </div>

      {/* The ambition check carries a verdict, and the verdict must not be conveyed by colour
          alone — the word "aligned" is written out beside it. */}
      <div className="mt-4 rounded-xl bg-emerald-50 p-3.5">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
          Ambition check
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold normal-case tracking-normal">
            {SAMPLE_PATH.ambitionCheck.verdict}
          </span>
        </h4>
        <p className="mt-1.5 text-sm leading-relaxed text-emerald-900">
          {SAMPLE_PATH.ambitionCheck.note}
        </p>
      </div>
    </article>
  );
}

/** A roadmap excerpt — two phases and their first week, enough to show the shape without
 * reproducing twelve weeks of plan on a marketing page. */
export function SampleRoadmapExcerpt() {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-slate-900">Execution roadmap</h3>
        <span className="text-sm font-medium text-slate-500">{SAMPLE_ROADMAP.totalDuration}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{SAMPLE_ROADMAP.summary}</p>

      <ol className="mt-5 space-y-4">
        {SAMPLE_ROADMAP.phases.map((phase) => (
          <li key={phase.title} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100">
                {phase.type}
              </span>
              <h4 className="text-sm font-semibold text-slate-900">{phase.title}</h4>
            </div>
            <p className="mt-2.5 text-xs font-semibold text-slate-500">
              Week {phase.week} — {phase.focus}
            </p>
            <ul className="mt-1.5 space-y-1">
              {phase.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-slate-600">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
        <li className="pl-1 text-sm text-slate-500">…and ten more weeks, through practice and applications.</li>
      </ol>
    </article>
  );
}
