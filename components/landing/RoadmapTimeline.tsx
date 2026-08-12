'use client';

import React, { useState } from 'react';
import { SAMPLE_ROADMAP_MILESTONES } from './SampleData';

/* =====================================================================================
 * The roadmap, as a timeline you can open.
 *
 * Same motif as the hero — dots on a line — turned horizontal and given time as its axis. The
 * point of the section is that "week-by-week plan" is a concrete artifact rather than a
 * promise, so the milestones carry the real week numbers and the real action items from a
 * generated roadmap.
 *
 * Horizontal on desktop, vertical on mobile. Not the same layout rotated: a horizontal
 * timeline on a 375px screen either shrinks the labels to nothing or forces a scroll that
 * hides the thing you just tapped.
 * ===================================================================================== */

export function RoadmapTimeline() {
  const [openIndex, setOpenIndex] = useState(1);
  const open = SAMPLE_ROADMAP_MILESTONES[openIndex];

  return (
    <div>
      {/* ---------- Desktop: a real horizontal track ---------- */}
      <div className="hidden sm:block">
        <div className="relative">
          {/* The line the nodes sit on. */}
          <div aria-hidden="true" className="absolute left-0 right-0 top-[13px] h-px bg-border-soft" />
          <div
            aria-hidden="true"
            className="absolute left-0 top-[13px] h-px bg-hachi transition-[width] duration-500"
            style={{ width: `${(openIndex / (SAMPLE_ROADMAP_MILESTONES.length - 1)) * 100}%` }}
          />

          <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${SAMPLE_ROADMAP_MILESTONES.length}, 1fr)` }}>
            {SAMPLE_ROADMAP_MILESTONES.map((m, i) => {
              const reached = i <= openIndex;
              return (
                <li key={m.week} className="flex flex-col items-start">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(i)}
                    aria-current={i === openIndex ? 'step' : undefined}
                    className="group flex flex-col items-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2 rounded"
                  >
                    <span
                      aria-hidden="true"
                      className={`mb-3 block rounded-full transition-all duration-200 ${
                        i === openIndex
                          ? 'h-[26px] w-[26px] border-[7px] border-hachi bg-surface'
                          : reached
                            ? 'mt-[5px] h-4 w-4 bg-hachi'
                            : 'mt-[5px] h-4 w-4 bg-border-soft group-hover:bg-ink-muted'
                      }`}
                    />
                    <span className="font-mono text-xs font-semibold tracking-widest text-ink-muted">
                      {m.week.toUpperCase()}
                    </span>
                    <span
                      className={`mt-1 text-sm font-semibold transition-colors ${
                        i === openIndex ? 'text-ink' : 'text-ink-muted group-hover:text-ink'
                      }`}
                    >
                      {m.phase}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-7 rounded-2xl border border-border-soft bg-surface p-6">
          <MilestoneDetail milestone={open} />
        </div>
      </div>

      {/* ---------- Mobile: a vertical rail, each item opening in place ---------- */}
      <ol className="relative space-y-2 sm:hidden">
        <div aria-hidden="true" className="absolute bottom-4 left-[9px] top-4 w-px bg-border-soft" />
        {SAMPLE_ROADMAP_MILESTONES.map((m, i) => {
          const isOpen = i === openIndex;
          return (
            <li key={m.week} className="relative pl-8">
              <span
                aria-hidden="true"
                className={`absolute left-0 top-[13px] block rounded-full transition-all ${
                  isOpen ? 'h-[18px] w-[18px] border-[5px] border-hachi bg-surface' : 'ml-[3px] mt-[2px] h-3 w-3 bg-border-soft'
                }`}
              />
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="w-full py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi rounded"
              >
                <span className="font-mono text-[11px] font-semibold tracking-widest text-ink-muted">
                  {m.week.toUpperCase()}
                </span>
                <span className="mt-0.5 block font-semibold text-ink">{m.phase}</span>
              </button>
              {isOpen && (
                <div className="rise-in mb-3 rounded-xl border border-border-soft bg-surface p-4">
                  <MilestoneDetail milestone={m} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MilestoneDetail({ milestone }: { milestone: (typeof SAMPLE_ROADMAP_MILESTONES)[number] }) {
  return (
    <>
      <h3 className="text-lg font-semibold tracking-tight text-ink">{milestone.title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{milestone.detail}</p>
      <ul className="mt-4 space-y-2">
        {milestone.items.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] text-ink">
            <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-hachi" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
