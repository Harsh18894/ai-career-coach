'use client';

import React from 'react';

/* =====================================================================================
 * Skeletons for the two long non-streamed waits.
 *
 * generatePaths (~34s) and generateRoadmap (~32s) are the only places left in the app where
 * something takes half a minute and cannot stream. B3 removed the reasoning waste everywhere it
 * was safe to; what remains at those two call sites is the model genuinely working, so the
 * honest response is to make the wait legible rather than to keep shaving it.
 *
 * Sized to the real content on purpose. A skeleton smaller than what replaces it produces a jump
 * at the exact moment the user starts reading, which is worse than no skeleton — the layout
 * moves under their eyes. Each block below mirrors the padding and line count of the component
 * that takes its place, so the swap is a fill rather than a reflow:
 *
 *   PathDeckSkeleton  -> PathDeck's three collapsed PathCards (p-6, title line, chip row)
 *   RoadmapSkeleton   -> RoadmapTitleCard (p-5, title line, two meta chips)
 *
 * aria-hidden throughout: the loading state is announced once by the live region alongside it,
 * and a screen reader reading out a dozen empty placeholder boxes is noise, not information.
 * ===================================================================================== */

/** One shimmering block. `animate-pulse` is Tailwind's built-in; no custom keyframes needed. */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-slate-200 animate-pulse ${className}`} />;
}

/** Mirrors a single collapsed PathCard. */
function PathCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="w-full flex items-start gap-3 p-6">
        <div className="flex-1 min-w-0">
          {/* Title line — text-lg font-bold leading-snug in the real card. */}
          <Bar className="h-5 w-3/5" />
          {/* Chip row — salary pill + tier badge. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Bar className="h-6 w-32" />
            <Bar className="h-6 w-24" />
          </div>
        </div>
        <div className="flex-shrink-0 pt-1">
          <Bar className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Three cards, because the deck is always exactly three. */
export function PathDeckSkeleton() {
  return (
    <div aria-hidden="true" className="my-6 space-y-3">
      {/* The deck's own header line ("Expand a path to review it, then lock it in."). */}
      <Bar className="h-4 w-64 mb-4" />
      <PathCardSkeleton />
      <PathCardSkeleton />
      <PathCardSkeleton />
    </div>
  );
}

/** Mirrors RoadmapTitleCard, which is what replaces it. */
export function RoadmapSkeleton() {
  return (
    <div aria-hidden="true" className="my-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <Bar className="h-10 w-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <Bar className="h-5 w-1/2" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Bar className="h-5 w-28" />
            <Bar className="h-5 w-36" />
          </div>
        </div>
      </div>
    </div>
  );
}
