'use client';

import React from 'react';
import { Map, Clock, Timer, ArrowUpRight } from 'lucide-react';
import type { PathTier } from '@/lib/ai/tiers';
import TierBadge from './TierBadge';

interface RoadmapTitleCardProps {
  title: string;
  totalDuration: string;
  weeklyHoursCommitment: string;
  tier: PathTier | null;
  onOpen: () => void;
}

/** Compact, clickable summary rendered in the chat stream once a roadmap exists — the full
 * structured roadmap lives in the side panel (or mobile drawer), never as a chat bubble. */
export default function RoadmapTitleCard({ title, totalDuration, weeklyHoursCommitment, tier, onOpen }: RoadmapTitleCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full max-w-md flex items-center gap-4 p-5 my-4 rounded-2xl border border-border-soft bg-white shadow-sm hover:border-hachi/30 hover:shadow-md transition-all duration-150 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-hachi text-white shadow-sm flex items-center justify-center">
        <Map className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink flex items-center gap-2 flex-wrap">
          {title}
          {tier && <TierBadge tier={tier} />}
        </p>
        <p className="mt-1 text-xs text-ink-muted flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {totalDuration}
          </span>
          <span className="flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" />
            {weeklyHoursCommitment}
          </span>
        </p>
      </div>
      <span className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-hachi whitespace-nowrap">
        View roadmap
        <ArrowUpRight className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

