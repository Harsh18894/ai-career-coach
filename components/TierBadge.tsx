'use client';

import React from 'react';
import { Target, ShieldCheck, Rocket } from 'lucide-react';
import { TIER_TIMELINE, type PathTier } from '@/lib/ai/tiers';

// Visual treatment per difficulty tier — distinct color families so paths/roadmaps read as a
// "safe bet -> aim here -> stretch goal" progression at a glance. Shared by PathCard (deck view)
// and the roadmap views (RoadmapView/RoadmapTitleCard/RoadmapPanel) so the badge is identical
// wherever a tier is shown.
export const TIER_META: Record<
  PathTier,
  { icon: typeof ShieldCheck; badgeClass: string; topBorderClass: string }
> = {
  conservative: {
    icon: ShieldCheck,
    badgeClass: 'bg-linear-to-r from-emerald-50 to-teal-50 text-emerald-700 border border-emerald-200',
    topBorderClass: 'border-t-emerald-500',
  },
  realistic: {
    icon: Target,
    badgeClass: 'bg-linear-to-r from-indigo-50 to-violet-50 text-indigo-700 border border-indigo-200',
    topBorderClass: 'border-t-indigo-600',
  },
  ambitious: {
    icon: Rocket,
    badgeClass: 'bg-linear-to-r from-amber-50 to-fuchsia-50 text-amber-700 border border-amber-200',
    topBorderClass: 'border-t-amber-500',
  },
};

// `tier` ultimately comes from a session a browser may have persisted to localStorage days or
// weeks ago, under a previous build's tier values (e.g. the old "optimistic" key, renamed to
// "ambitious") — TIER_META[tier] would be undefined for that stale value and crash the whole
// page. Falls back to "realistic" so an outdated session degrades gracefully instead of erroring.
export function getTierMeta(tier: PathTier) {
  return TIER_META[tier] ?? TIER_META.realistic;
}

interface TierBadgeProps {
  tier: PathTier;
  className?: string;
}

export default function TierBadge({ tier, className = '' }: TierBadgeProps) {
  const meta = getTierMeta(tier);
  const timeline = TIER_TIMELINE[tier] ?? TIER_TIMELINE.realistic;
  const Icon = meta.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${meta.badgeClass} ${className}`}>
      <Icon className="w-3 h-3" />
      {timeline.label} &middot; {timeline.monthsLabel}
    </span>
  );
}
