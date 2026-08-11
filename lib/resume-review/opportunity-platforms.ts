/* =====================================================================================
 * Curated opportunity-platform registry.
 *
 * Student-persona reviews recommend places to look for internships. The model must NEVER
 * emit a platform URL it generated — that reintroduces exactly the hallucinated-link problem
 * the Phase 0 baseline (scripts/baseline-links.ts, evals/baselines/) was built to measure.
 * That baseline found the roadmap generator emitting zero links; this feature would be the
 * first place in the app to put real URLs in front of a user, and it does so from a hardcoded
 * list a human can read and check.
 *
 * The contract, in both directions:
 *   - The model is shown a region-filtered list of { id, name, focus, notes } and selects by
 *     `id`, justifying its picks. It never sees or writes a URL.
 *   - Code looks the URL up (resolvePlatformIds below) and drops any id that isn't in the
 *     registry or isn't valid for the user's region.
 *
 * Region matters and is not cosmetic: Internshala and Apna are India-only, and recommending
 * them to a student in Ohio is not a minor mismatch, it's advice that wastes their time.
 * ===================================================================================== */

/** Region values match `inferRegion`'s output in ./persona.ts exactly — if a country is added
 * to COUNTRY_HINTS there, it should get platform coverage here (or fall through to global). */
export const GLOBAL_REGION = 'global';

export type OpportunityPlatform = {
  id: string;
  name: string;
  url: string;
  /** Country names as produced by inferRegion, and/or GLOBAL_REGION. */
  regions: string[];
  /** Short tags describing what this platform is actually good for. Shown to the model so it
   * can justify a pick, and to the user so the recommendation isn't a bare link. */
  focus: string[];
  notes: string;
};

export const OPPORTUNITY_PLATFORMS: OpportunityPlatform[] = [
  /* ---- India ------------------------------------------------------------------------- */
  {
    id: 'internshala',
    name: 'Internshala',
    url: 'https://internshala.com',
    regions: ['India'],
    focus: ['internships', 'entry-level', 'students'],
    notes:
      'India-specific. The default starting point for student internships in India, including remote and part-time listings aimed at people still studying.',
  },
  {
    id: 'unstop',
    name: 'Unstop',
    url: 'https://unstop.com',
    regions: ['India'],
    focus: ['internships', 'competitions', 'hackathons', 'students'],
    notes:
      'India-specific. Competitions and case challenges alongside internships — useful when a student needs portfolio evidence as much as a placement.',
  },
  {
    id: 'apna',
    name: 'Apna',
    url: 'https://apna.co',
    regions: ['India'],
    focus: ['entry-level', 'early-career'],
    notes: 'India-specific. Strong for entry-level and early-career roles; lighter on formal internship programmes than Internshala.',
  },
  {
    id: 'naukri',
    name: 'Naukri',
    url: 'https://www.naukri.com',
    regions: ['India'],
    focus: ['general', 'entry-level'],
    notes: 'India-specific. The largest general job board in India; broad rather than student-focused.',
  },

  /* ---- United Kingdom ---------------------------------------------------------------- */
  {
    id: 'prospects',
    name: 'Prospects',
    url: 'https://www.prospects.ac.uk',
    regions: ['United Kingdom'],
    focus: ['graduate-schemes', 'internships', 'students'],
    notes: 'UK-specific. The standard UK graduate careers service — graduate schemes, placements, and sector guides.',
  },
  {
    id: 'gradcracker',
    name: 'Gradcracker',
    url: 'https://www.gradcracker.com',
    regions: ['United Kingdom'],
    focus: ['graduate-schemes', 'internships', 'engineering', 'technology'],
    notes: 'UK-specific, STEM only. Engineering and technology placements and graduate roles.',
  },

  /* ---- United States ----------------------------------------------------------------- */
  {
    id: 'handshake',
    name: 'Handshake',
    url: 'https://joinhandshake.com',
    regions: ['United States', 'United Kingdom'],
    focus: ['internships', 'entry-level', 'students', 'campus-recruiting'],
    notes:
      'Campus recruiting platform — access is usually through a participating university account, so it is only useful if the institution partners with it.',
  },

  /* ---- Other single-country boards ---------------------------------------------------- */
  {
    id: 'seek',
    name: 'Seek',
    url: 'https://www.seek.com.au',
    regions: ['Australia'],
    focus: ['general', 'entry-level', 'internships'],
    notes: 'Australia (and New Zealand). The dominant general job board in the Australian market.',
  },
  {
    id: 'jobbank-canada',
    name: 'Job Bank (Government of Canada)',
    url: 'https://www.jobbank.gc.ca',
    regions: ['Canada'],
    focus: ['general', 'entry-level', 'students'],
    notes: 'Canada-specific, government-run. Includes a student-and-graduate job stream.',
  },
  {
    id: 'mycareersfuture',
    name: 'MyCareersFuture',
    url: 'https://www.mycareersfuture.gov.sg',
    regions: ['Singapore'],
    focus: ['general', 'entry-level'],
    notes: 'Singapore-specific, government-run.',
  },

  /* ---- Global ------------------------------------------------------------------------ */
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/jobs',
    regions: [GLOBAL_REGION],
    focus: ['general', 'internships', 'networking'],
    notes:
      'Global. Worth using for the networking and referral path as much as the listings — cold applications through it are competitive.',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    url: 'https://www.indeed.com',
    regions: [GLOBAL_REGION],
    focus: ['general', 'internships', 'entry-level'],
    notes: 'Global, with country-specific domains. Very high volume, so filtering carefully matters more than on smaller boards.',
  },
  {
    id: 'wellfound',
    name: 'Wellfound (formerly AngelList Talent)',
    url: 'https://wellfound.com',
    regions: [GLOBAL_REGION],
    focus: ['startups', 'internships', 'entry-level'],
    notes:
      'Global, startup-focused. Startups are often more willing to weigh a strong project portfolio over formal credentials, which suits candidates with projects but no internships.',
  },
];

/* =====================================================================================
 * Lookup and filtering
 * ===================================================================================== */

const BY_ID: ReadonlyMap<string, OpportunityPlatform> = new Map(
  OPPORTUNITY_PLATFORMS.map((platform) => [platform.id, platform])
);

export function getPlatform(id: string): OpportunityPlatform | undefined {
  return BY_ID.get(id);
}

export function isKnownPlatformId(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * Platforms appropriate for a region: that region's own boards plus the global ones.
 *
 * A null region (inferRegion couldn't determine one) returns global platforms ONLY — never a
 * guess. Per docs/resume-review-rubric.md's treatment of low-confidence classification, the
 * UI should ask for the region rather than let the review quietly assume one.
 */
export function platformsForRegion(region: string | null): OpportunityPlatform[] {
  if (!region) return OPPORTUNITY_PLATFORMS.filter((p) => p.regions.includes(GLOBAL_REGION));
  return OPPORTUNITY_PLATFORMS.filter(
    (p) => p.regions.includes(region) || p.regions.includes(GLOBAL_REGION)
  );
}

export type DroppedPlatformId = {
  id: string;
  reason: 'unknown-id' | 'wrong-region';
};

export type ResolvedPlatforms = {
  platforms: OpportunityPlatform[];
  dropped: DroppedPlatformId[];
};

/**
 * Post-validation for model-selected platform ids. Defence in depth: the model is only ever
 * shown the region-filtered list, so a wrong-region id shouldn't be possible — but "shouldn't
 * be possible" is exactly the assumption the no-fabrication rule exists because we don't trust.
 * Both failure modes are dropped and logged rather than corrected or passed through.
 *
 * Order is preserved and duplicates are collapsed, so the model's own ranking survives.
 */
export function resolvePlatformIds(ids: string[], region: string | null): ResolvedPlatforms {
  const allowed = new Set(platformsForRegion(region).map((p) => p.id));
  const platforms: OpportunityPlatform[] = [];
  const dropped: DroppedPlatformId[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);

    const platform = BY_ID.get(id);
    if (!platform) {
      dropped.push({ id, reason: 'unknown-id' });
      continue;
    }
    if (!allowed.has(id)) {
      dropped.push({ id, reason: 'wrong-region' });
      continue;
    }
    platforms.push(platform);
  }

  for (const drop of dropped) {
    // One structured line per drop, matching the telemetry convention in lib/telemetry.ts so
    // these are greppable in Vercel logs alongside llm_call / api_error records.
    console.warn(
      JSON.stringify({
        event: 'platform_id_dropped',
        timestamp: new Date().toISOString(),
        id: drop.id,
        reason: drop.reason,
        region: region ?? null,
      })
    );
  }

  return { platforms, dropped };
}

/**
 * The catalogue as shown to the model: no URLs. The model selects by id and never has a URL
 * in its context to copy, mangle, or invent a variation of.
 */
export function platformCatalogueForPrompt(region: string | null): string {
  return platformsForRegion(region)
    .map((p) => `- id: ${p.id} | ${p.name} | focus: ${p.focus.join(', ')} | ${p.notes}`)
    .join('\n');
}
