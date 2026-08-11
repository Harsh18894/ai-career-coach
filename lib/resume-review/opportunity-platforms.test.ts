import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  OPPORTUNITY_PLATFORMS,
  GLOBAL_REGION,
  getPlatform,
  isKnownPlatformId,
  platformsForRegion,
  resolvePlatformIds,
  platformCatalogueForPrompt,
} from './opportunity-platforms';

/* =====================================================================================
 * Registry integrity + region filtering. All deterministic — no model, no network.
 * ===================================================================================== */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registry integrity', () => {
  it('has unique ids', () => {
    const ids = OPPORTUNITY_PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every platform an https URL, at least one region, and a focus', () => {
    for (const platform of OPPORTUNITY_PLATFORMS) {
      expect(platform.url, platform.id).toMatch(/^https:\/\//);
      expect(() => new URL(platform.url), platform.id).not.toThrow();
      expect(platform.regions.length, platform.id).toBeGreaterThan(0);
      expect(platform.focus.length, platform.id).toBeGreaterThan(0);
      expect(platform.notes.trim().length, platform.id).toBeGreaterThan(0);
    }
  });

  it('covers every region the persona classifier can infer', () => {
    // Mirrors COUNTRY_HINTS in ./persona.ts. A country that can be inferred but has no
    // platform coverage still works (it falls through to global), but the gap should be a
    // deliberate choice rather than something noticed in production.
    const inferrableRegions = ['India', 'United States', 'United Kingdom', 'Australia', 'Canada', 'Singapore'];
    for (const region of inferrableRegions) {
      expect(platformsForRegion(region).length, region).toBeGreaterThan(0);
    }
  });

  it('has at least one global platform, so an unknown region is never empty-handed', () => {
    expect(platformsForRegion(null).length).toBeGreaterThan(0);
  });
});

describe('platformsForRegion', () => {
  it('returns India-specific platforms plus global ones for India', () => {
    const ids = platformsForRegion('India').map((p) => p.id);
    expect(ids).toContain('internshala');
    expect(ids).toContain('linkedin');
  });

  it('excludes India-only platforms for a US candidate', () => {
    // The acceptance criterion this feature exists to satisfy: Internshala is actively bad
    // advice for a student in the US, not merely a suboptimal suggestion.
    const ids = platformsForRegion('United States').map((p) => p.id);
    expect(ids).not.toContain('internshala');
    expect(ids).not.toContain('apna');
    expect(ids).not.toContain('unstop');
    expect(ids).toContain('handshake');
    expect(ids).toContain('linkedin');
  });

  it('returns global platforms only when the region is unknown', () => {
    const platforms = platformsForRegion(null);
    expect(platforms.length).toBeGreaterThan(0);
    for (const platform of platforms) {
      expect(platform.regions, platform.id).toContain(GLOBAL_REGION);
    }
    expect(platforms.map((p) => p.id)).not.toContain('internshala');
  });

  it('does not leak one country\'s boards into another', () => {
    const australian = platformsForRegion('Australia').map((p) => p.id);
    expect(australian).toContain('seek');
    expect(australian).not.toContain('prospects');
    expect(australian).not.toContain('jobbank-canada');
  });
});

describe('resolvePlatformIds', () => {
  it('resolves known, region-appropriate ids to full platform records', () => {
    const { platforms, dropped } = resolvePlatformIds(['internshala', 'linkedin'], 'India');
    expect(platforms.map((p) => p.id)).toEqual(['internshala', 'linkedin']);
    expect(platforms[0].url).toBe('https://internshala.com');
    expect(dropped).toEqual([]);
  });

  it('drops an invented platform id and logs it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { platforms, dropped } = resolvePlatformIds(['linkedin', 'internhub-pro'], 'India');

    expect(platforms.map((p) => p.id)).toEqual(['linkedin']);
    expect(dropped).toEqual([{ id: 'internhub-pro', reason: 'unknown-id' }]);

    const logged = warn.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(logged).toContainEqual(
      expect.objectContaining({ event: 'platform_id_dropped', id: 'internhub-pro', reason: 'unknown-id' })
    );
  });

  it('drops a real platform that is wrong for the region', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { platforms, dropped } = resolvePlatformIds(['internshala', 'linkedin'], 'United States');

    expect(platforms.map((p) => p.id)).toEqual(['linkedin']);
    expect(dropped).toEqual([{ id: 'internshala', reason: 'wrong-region' }]);
  });

  it('preserves the model\'s ordering and collapses duplicates', () => {
    const { platforms } = resolvePlatformIds(['linkedin', 'internshala', 'linkedin'], 'India');
    expect(platforms.map((p) => p.id)).toEqual(['linkedin', 'internshala']);
  });

  it('returns nothing rather than guessing when every id is unusable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { platforms, dropped } = resolvePlatformIds(['made-up-one', 'made-up-two'], null);
    expect(platforms).toEqual([]);
    expect(dropped).toHaveLength(2);
  });
});

describe('platformCatalogueForPrompt', () => {
  it('never puts a URL in front of the model', () => {
    // The whole point of the registry: the model selects by id and has no URL in its context
    // to copy, mangle, or invent a variation of.
    for (const region of ['India', 'United States', null]) {
      const catalogue = platformCatalogueForPrompt(region);
      expect(catalogue, String(region)).not.toMatch(/https?:\/\//);
      expect(catalogue, String(region)).not.toMatch(/www\./);
    }
  });

  it('lists every id available for the region, so the model can only pick from these', () => {
    const catalogue = platformCatalogueForPrompt('India');
    for (const platform of platformsForRegion('India')) {
      expect(catalogue).toContain(`id: ${platform.id}`);
    }
  });
});

describe('lookup helpers', () => {
  it('resolves a known id and rejects an unknown one', () => {
    expect(getPlatform('linkedin')?.name).toBe('LinkedIn');
    expect(getPlatform('nope')).toBeUndefined();
    expect(isKnownPlatformId('seek')).toBe(true);
    expect(isKnownPlatformId('seek-jobs')).toBe(false);
  });
});
