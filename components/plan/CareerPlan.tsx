'use client';

import React, { useEffect, useState } from 'react';
import type { CareerPath, Profile, Roadmap, RoadmapPhase } from '@/lib/ai/schemas';
import { TIER_TIMELINE } from '@/lib/ai/tiers';
import { STORAGE_KEYS } from '@/lib/brand';

/* =====================================================================================
 * The plan. Everything after the user has chosen a direction.
 *
 * The old screen gave the conversation and the roadmap equal weight in a 50/50 split, which
 * made a 14-week plan read as a transcript attachment. The order here is the decision the user
 * is actually making:
 *
 *   destination → why → the gap → the one next thing → the phases
 *
 * Cognitive load decreases going down. The top of the page is three lines and a number; the
 * detail is behind phases the reader opens on purpose.
 *
 * ============================ WHAT IS REAL, AND WHAT IS NOT ============================
 * Every value here comes from data the model actually produced:
 *   destination     chosenPath.title / tier / salaryRange
 *   why             chosenPath.fitRationale        (verbatim, never summarised)
 *   already have    profile.skills
 *   still need      chosenPath.upskills
 *   next move       chosenPath.firstMove
 *   phases          roadmap.phases (title, type, description, weeks, items)
 *   effort          roadmap.weeklyHoursCommitment / totalDuration / totalWeeks
 *
 * TWO THINGS THE BRIEF ASKED FOR ARE NOT BUILT, because there is no data behind them:
 *
 *  1. A per-phase "Outcome" string. RoadmapPhaseSchema has no such field. Writing one would
 *     mean inventing a promise the model never made. What IS real is `type`, so each phase
 *     shows a factual restatement of its own kind ("something you can show" for a project) —
 *     a label, not a claim — and `description`, which the schema defines as "why this phase
 *     matters for this candidate specifically", carries §15's "why Hachi put this here".
 *
 *  2. Four readiness bars. The schema carries ONE `skillLevel` enum for the chosen path, not a
 *     per-dimension breakdown. Four bars filled to invented percentages would be precisely the
 *     meaningless score the brief rules out, dressed as a chart. The gap section below shows
 *     the same idea with real arrays: what you have, what is missing, where it leads.
 * ====================================================================================== */

const PHASE_KIND: Record<RoadmapPhase['type'], { label: string; youWillHave: string }> = {
  course: { label: 'Learn', youWillHave: 'The foundations covered' },
  project: { label: 'Build', youWillHave: 'Something you can show' },
  practice: { label: 'Practise', youWillHave: 'Reps under real conditions' },
  application: { label: 'Apply', youWillHave: 'Applications out the door' },
};

const SKILL_LEVEL_COPY: Record<Roadmap['skillLevel'], string> = {
  beginner: 'You’re starting this one from scratch.',
  basic: 'You’ve got the basics; the gap is depth.',
  good: 'You already have a strong foundation.',
  experienced: 'You’re close — this is mostly about evidence.',
};

type PhaseStatus = 'not_started' | 'in_progress' | 'done';

const STATUS_COPY: Record<PhaseStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

/** Week range for a phase, from the real week numbers. */
function weekRange(phase: RoadmapPhase): string {
  const weeks = phase.weeks.map((w) => w.week);
  const first = Math.min(...weeks);
  const last = Math.max(...weeks);
  return first === last ? `Week ${first}` : `Weeks ${first}–${last}`;
}

export function CareerPlan({
  profile,
  chosenPath,
  roadmap,
  roadmapVersion,
  onAdjust,
  onAskHachi,
  isAdjusting,
}: {
  profile: Profile | null;
  chosenPath: CareerPath;
  roadmap: Roadmap;
  roadmapVersion: number;
  /** Regenerates the roadmap from a plain-language instruction. Same call the chat used. */
  onAdjust: (feedback: string) => void;
  onAskHachi: () => void;
  isAdjusting: boolean;
}) {
  // The first phase is open by default, because §31's rule is that the reader must never have
  // to click to find out where to start.
  const [openPhase, setOpenPhase] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustText, setAdjustText] = useState('');
  const [statuses, setStatuses] = useState<Record<number, PhaseStatus>>({});

  /* Progress is a UI affordance, not a product claim — it lives in this browser and nowhere
   * else. Keyed by roadmapVersion so regenerating the plan does not leave ticks against phases
   * that no longer exist. */
  const storageKey = `${STORAGE_KEYS.session}:plan-progress:v${roadmapVersion}`;

  useEffect(() => {
    // Deferred so the state update does not happen synchronously inside the effect body.
    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) setStatuses(JSON.parse(raw) as Record<number, PhaseStatus>);
      } catch {
        /* corrupt or unavailable storage — start clean rather than fail */
      }
    });
  }, [storageKey]);

  function setStatus(index: number, status: PhaseStatus) {
    setStatuses((prev) => {
      const next = { ...prev, [index]: status };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }

  const tier = TIER_TIMELINE[chosenPath.tier];
  const haves = (profile?.skills ?? []).slice(0, 6);
  const needs = chosenPath.upskills.slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      {/* ---------------- LAYER 1 — the destination ---------------- */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Your chosen direction
        </p>
        <h1 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[44px]">
          {chosenPath.title}
        </h1>

        <p className="mt-4 text-[17px] leading-relaxed text-ink">
          A {tier.label.toLowerCase()} next move from where you are — about {roadmap.totalDuration.replace(/\s*\(.*\)/, '')} at {roadmap.weeklyHoursCommitment}.
        </p>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-border-soft pt-5 text-sm">
          {[
            { k: 'Timeline', v: tier.monthsLabel },
            { k: 'Total', v: `${roadmap.totalWeeks} weeks` },
            { k: 'Effort', v: roadmap.weeklyHoursCommitment },
            { k: 'Indicative pay', v: chosenPath.salaryRange },
          ].map((f) => (
            <div key={f.k}>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{f.k}</dt>
              <dd className="mt-0.5 font-medium text-ink">{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- LAYER 2 — why this path ---------------- */}
      <section className="mt-12">
        <h2 className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Why this path
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-hachi" />
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-ink">{chosenPath.fitRationale}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{roadmap.summary}</p>
      </section>

      {/* ---------------- LAYER 2b — the gap ----------------
          The bridge, drawn with the trajectory language. Real arrays on both ends: what the
          profile says you have, what the path says you still need. */}
      <section className="mt-10 rounded-2xl border border-border-soft bg-surface p-5 sm:p-6">
        <p className="text-[15px] font-medium text-ink">{SKILL_LEVEL_COPY[roadmap.skillLevel]}</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">You already have</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {haves.length > 0 ? (
                haves.map((s) => (
                  <li key={s} className="rounded-full border border-border-soft bg-paper px-2.5 py-1 text-[13px] text-ink">
                    {s}
                  </li>
                ))
              ) : (
                <li className="text-[13px] text-ink-muted">What you told Hachi in the conversation.</li>
              )}
            </ul>
          </div>

          {/* The bridge. Horizontal on desktop, vertical on mobile. */}
          <div className="flex items-center justify-center sm:h-full sm:pt-7" aria-hidden="true">
            <svg viewBox="0 0 64 16" className="h-4 w-16 sm:w-14">
              <circle cx="5" cy="8" r="4" fill="var(--hachi)" />
              <path d="M11 8 H50" stroke="var(--hachi)" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" />
              <path d="M46 4 L52 8 L46 12" fill="none" stroke="var(--hachi)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-hachi">You still need to show</p>
            <ul className="mt-2.5 space-y-1.5">
              {needs.map((s) => (
                <li key={s} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                  <span aria-hidden="true" className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-hachi" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------- LAYER 3 — the one next thing ---------------- */}
      {chosenPath.firstMove && (
        <section className="mt-10 rounded-2xl border border-hachi/30 bg-hachi/6 p-5 sm:p-6">
          <h2 className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-hachi">
            Your next move
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-hachi" />
          </h2>
          <p className="mt-3 text-[19px] font-medium leading-snug text-ink">{chosenPath.firstMove}</p>
          <button
            type="button"
            onClick={() => {
              setOpenPhase(0);
              setStatus(0, 'in_progress');
              document.getElementById('plan-roadmap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-hachi px-5 py-3 text-[15px] font-semibold text-white transition-transform duration-150 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2"
          >
            Start {roadmap.phases[0] ? weekRange(roadmap.phases[0]).toLowerCase() : 'week 1'}
            <span aria-hidden="true">→</span>
          </button>
        </section>
      )}

      {/* ---------------- LAYER 4 — the roadmap ---------------- */}
      <section id="plan-roadmap" className="mt-14 scroll-mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">
            Here&rsquo;s how you get there.
          </h2>
          <button
            type="button"
            onClick={() => setAdjusting((v) => !v)}
            aria-expanded={adjusting}
            aria-controls="plan-adjust"
            className="rounded-lg border border-border-soft bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
          >
            Change the plan
          </button>
        </div>

        {/* Changing the plan happens HERE.
         *
         * It used to throw the user back into the conversation, where they had to find the
         * roadmap controls and then find their way back to the plan again — three navigations
         * to change one thing they were already looking at. The presets compose the same
         * plain-language instruction the chat sent, so this is the existing regeneration call
         * with a better front door, not a new capability. */}
        {adjusting && (
          <div id="plan-adjust" className="rise-in mt-5 rounded-2xl border border-hachi/30 bg-surface p-5">
            <p className="text-[15px] font-medium text-ink">What should change?</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: 'Make it faster', text: 'Compress this into a shorter timeline — I can move quicker than this.' },
                { label: 'Give me more time', text: 'Stretch this over a longer timeline; I have fewer hours a week than this assumes.' },
                { label: 'More ambitious', text: 'Make this more ambitious — aim higher than this plan does.' },
                { label: 'More hands-on', text: 'Less coursework, more building. Weight this toward projects and practice.' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isAdjusting}
                  onClick={() => {
                    onAdjust(preset.text);
                    setAdjusting(false);
                  }}
                  className="rounded-full border border-border-soft bg-paper px-3.5 py-1.5 text-[14px] font-medium text-ink transition-colors hover:border-hachi hover:text-hachi disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!adjustText.trim() || isAdjusting) return;
                onAdjust(adjustText.trim());
                setAdjustText('');
                setAdjusting(false);
              }}
              className="mt-4 flex flex-col gap-2 sm:flex-row"
            >
              <label htmlFor="plan-adjust-text" className="sr-only">
                Describe what to change about the plan
              </label>
              <input
                id="plan-adjust-text"
                value={adjustText}
                onChange={(e) => setAdjustText(e.target.value)}
                disabled={isAdjusting}
                placeholder="Or say it in your own words…"
                className="flex-1 rounded-xl border border-border-soft bg-paper px-4 py-2.5 text-[15px] text-ink outline-none transition focus:border-hachi disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!adjustText.trim() || isAdjusting}
                className="rounded-xl bg-hachi px-5 py-2.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
              >
                {isAdjusting ? 'Rebuilding…' : 'Rebuild the plan'}
              </button>
            </form>
          </div>
        )}

        {isAdjusting && (
          <p role="status" className="mt-4 text-[15px] text-ink-muted">
            <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-hachi" />
            Hachi is rebuilding your plan…
          </p>
        )}

        <ol className="relative mt-7">
          {/* The spine. The trajectory motif, running the length of the plan. */}
          <div aria-hidden="true" className="absolute bottom-6 left-[11px] top-6 w-px bg-border-soft" />

          {roadmap.phases.map((phase, i) => {
            const isOpen = openPhase === i;
            const status = statuses[i] ?? 'not_started';
            const kind = PHASE_KIND[phase.type];
            const panelId = `phase-panel-${i}`;

            return (
              <li key={`${phase.title}-${i}`} className="relative pl-9 pb-3">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-[18px] block rounded-full transition-all ${
                    status === 'done'
                      ? 'ml-[3px] h-4 w-4 bg-emerald-600'
                      : isOpen
                        ? 'h-[22px] w-[22px] border-[6px] border-hachi bg-surface'
                        : 'ml-[3px] h-4 w-4 bg-border-soft'
                  }`}
                />

                <div
                  className={`rounded-2xl border bg-surface transition-colors ${
                    isOpen ? 'border-hachi/35' : 'border-border-soft'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenPhase(isOpen ? -1 : i)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="w-full px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi rounded-2xl"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs font-semibold tracking-widest text-ink-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-hachi">
                        {kind.label}
                      </span>
                      <span className="text-[13px] text-ink-muted">{weekRange(phase)}</span>
                      {status !== 'not_started' && (
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wider ${
                            status === 'done' ? 'text-emerald-700' : 'text-ink-muted'
                          }`}
                        >
                          {STATUS_COPY[status]}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-[17px] font-semibold leading-snug text-ink">{phase.title}</h3>
                    <p className="mt-1 text-[14px] text-ink-muted">{kind.youWillHave}</p>
                  </button>

                  {isOpen && (
                    <div id={panelId} className="rise-in border-t border-border-soft px-5 pb-5 pt-4">
                      {phase.description && (
                        <details className="group mb-4">
                          <summary className="cursor-pointer list-none text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi rounded">
                            Why this is here
                            <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
                          </summary>
                          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{phase.description}</p>
                        </details>
                      )}

                      <ol className="space-y-4">
                        {phase.weeks.map((w) => (
                          <li key={w.week}>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                              Week {w.week}
                            </p>
                            <p className="mt-1 text-[15px] font-medium text-ink">{w.focus}</p>
                            <ul className="mt-2 space-y-1.5">
                              {w.items.map((item) => (
                                <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-muted">
                                  <span aria-hidden="true" className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-border-soft" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ol>

                      {/* Lightweight, and deliberately not a task manager: three states, no
                          streaks, no points, no confetti. It is someone's career. */}
                      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-soft pt-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                          Mark as
                        </span>
                        {(['not_started', 'in_progress', 'done'] as PhaseStatus[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(i, s)}
                            aria-pressed={status === s}
                            className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi ${
                              status === s
                                ? s === 'done'
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                                  : 'border-hachi bg-hachi/8 text-hachi'
                                : 'border-border-soft text-ink-muted hover:border-ink/30 hover:text-ink'
                            }`}
                          >
                            {STATUS_COPY[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ---------------- LAYER 5 — the conversation, as supporting evidence ---------------- */}
      <section className="mt-12 border-t border-border-soft pt-8">
        <p className="text-[15px] leading-relaxed text-ink-muted">
          Everything above came out of your conversation with Hachi. You can go back through it,
          or ask about any part of this plan.
        </p>
        <button
          type="button"
          onClick={onAskHachi}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-ink/15 px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-ink/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-hachi" />
          Read the conversation
        </button>
      </section>
    </div>
  );
}
