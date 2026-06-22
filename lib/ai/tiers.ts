// Single source of truth for the Conservative/Realistic/Ambitious path-difficulty tiers —
// used both by the roadmap-generation prompt (lib/ai/coach.ts) to inject exact week bounds, and
// by the UI (PathCard/PathDeck/RoadmapView/RoadmapTitleCard) to render consistent badges.
// Bands are anchored at a standardized ~4-6 hours/week baseline so they're comparable across
// candidates regardless of persona — see generatePaths'/generateRoadmap's prompt instructions
// for why students/recent grads use the same bands despite having more weekly hours available.
export type PathTier = 'conservative' | 'realistic' | 'ambitious';

export const TIER_ORDER: PathTier[] = ['conservative', 'realistic', 'ambitious'];

export const TIER_TIMELINE: Record<PathTier, { label: string; monthsLabel: string; minWeeks: number; maxWeeks: number }> = {
  conservative: { label: 'Conservative', monthsLabel: '1-2 months', minWeeks: 4, maxWeeks: 8 },
  realistic: { label: 'Realistic', monthsLabel: '3-4 months', minWeeks: 12, maxWeeks: 16 },
  ambitious: { label: 'Ambitious', monthsLabel: '6-8 months', minWeeks: 24, maxWeeks: 32 },
};
