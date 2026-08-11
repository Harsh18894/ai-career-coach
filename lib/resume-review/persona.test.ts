import { describe, it, expect } from 'vitest';
import { deriveSignals, inferRegion, parseResumeDate, needsPersonaConfirmation, roleMonths } from './persona';
import { platformsForRegion } from './opportunity-platforms';
import type { ResumeSegment, Role, Education } from './schemas';

/* =====================================================================================
 * Deterministic half of persona classification: the arithmetic and region inference that
 * run in code with no model call. classifyPersona itself makes one gpt-5-nano call for the
 * career-switch judgement and so is exercised by the live eval suite (Task 7), not here.
 * ===================================================================================== */

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    title: 'Engineer',
    company: 'Acme',
    location: null,
    startDate: null,
    endDate: null,
    durationMonths: 12,
    isInternship: false,
    bullets: [],
    ...overrides,
  };
}

function makeEducation(overrides: Partial<Education> = {}): Education {
  return {
    id: 'edu-1',
    institution: 'Some University',
    degree: 'BSc',
    fieldOfStudy: null,
    location: null,
    startDate: null,
    endDate: null,
    isOngoing: false,
    ...overrides,
  };
}

function makeSegment(overrides: Partial<ResumeSegment> = {}): ResumeSegment {
  return {
    contact: { name: null, email: null, phone: null, location: null, links: [] },
    summary: null,
    roles: [],
    education: [],
    projects: [],
    skills: [],
    other: [],
    ...overrides,
  };
}

describe('parseResumeDate', () => {
  it('reads a month and year', () => {
    expect(parseResumeDate('August 2019')).toEqual({ year: 2019, month: 8 });
    expect(parseResumeDate('Sept 2021')).toEqual({ year: 2021, month: 9 });
  });

  it('reads a bare year with no month', () => {
    expect(parseResumeDate('2013')).toEqual({ year: 2013, month: null });
  });

  it('returns null rather than guessing when there is no year', () => {
    // An undeterminable date must reduce confidence, never be silently treated as recent
    // or long-ago — both directions produce a wrong persona.
    expect(parseResumeDate('Present')).toBeNull();
    expect(parseResumeDate('')).toBeNull();
    expect(parseResumeDate(null)).toBeNull();
  });
});

describe('roleMonths', () => {
  const now = new Date('2026-08-01T00:00:00Z');

  it('prefers the normalised duration when segmentation supplied one', () => {
    expect(roleMonths({ durationMonths: 30, startDate: '2020', endDate: '2021' }, now)).toBe(30);
  });

  it('falls back to the written dates when the duration is missing', () => {
    // Segmentation was observed returning durationMonths on one run of a resume and omitting
    // it on the next; without this fallback the same document classified two different ways.
    expect(roleMonths({ durationMonths: null, startDate: 'June 2020', endDate: 'April 2022' }, now)).toBe(22);
  });

  it('treats an ongoing role as running to today', () => {
    expect(roleMonths({ durationMonths: null, startDate: 'May 2022', endDate: 'Present' }, now)).toBe(51);
  });

  it('handles the messy combined form segmentation sometimes emits', () => {
    expect(
      roleMonths({ durationMonths: null, startDate: 'May 2022 – Present (3 years)', endDate: 'Present (3 years)' }, now)
    ).toBe(51);
  });

  it('returns null when the length genuinely cannot be established', () => {
    expect(roleMonths({ durationMonths: null, startDate: null, endDate: null }, now)).toBeNull();
    expect(roleMonths({ durationMonths: null, startDate: 'June 2020', endDate: 'later' }, now)).toBeNull();
  });

  it('ignores a nonsensical negative span rather than subtracting from the total', () => {
    expect(roleMonths({ durationMonths: null, startDate: '2024', endDate: '2020' }, now)).toBeNull();
  });
});

describe('deriveSignals', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('excludes internship months from total full-time experience', () => {
    const segment = makeSegment({
      roles: [
        makeRole({ id: 'r1', durationMonths: 24, isInternship: false }),
        makeRole({ id: 'r2', durationMonths: 6, isInternship: true }),
        makeRole({ id: 'r3', durationMonths: 3, isInternship: true }),
      ],
    });

    const derived = deriveSignals(segment, now);

    expect(derived.totalFullTimeMonths).toBe(24);
    expect(derived.fullTimeRoleCount).toBe(1);
    expect(derived.internshipCount).toBe(2);
    expect(derived.hasFullTimeRole).toBe(true);
  });

  it('reports no full-time role for an internships-only resume', () => {
    const segment = makeSegment({
      roles: [makeRole({ durationMonths: 3, isInternship: true })],
      projects: [{ id: 'p1', title: 'Recommender', description: null, bullets: [], technologies: [] }],
    });

    const derived = deriveSignals(segment, now);

    expect(derived.hasFullTimeRole).toBe(false);
    expect(derived.totalFullTimeMonths).toBe(0);
    expect(derived.projectCount).toBe(1);
  });

  it('recovers a missing durationMonths from the written dates', () => {
    const segment = makeSegment({
      roles: [makeRole({ durationMonths: null, startDate: 'January 2024', endDate: 'January 2025' })],
    });
    const derived = deriveSignals(segment, now);
    expect(derived.totalFullTimeMonths).toBe(12);
    expect(derived.rolesWithUnknownDuration).toBe(0);
  });

  it('counts a role whose length cannot be established, instead of silently scoring it zero', () => {
    const segment = makeSegment({
      roles: [makeRole({ durationMonths: null, startDate: null, endDate: null })],
    });
    const derived = deriveSignals(segment, now);
    expect(derived.totalFullTimeMonths).toBe(0);
    expect(derived.rolesWithUnknownDuration).toBe(1);
  });

  it('measures recency from the most recent completed education', () => {
    const segment = makeSegment({
      education: [
        makeEducation({ id: 'e1', endDate: '2019' }),
        makeEducation({ id: 'e2', endDate: 'June 2025' }),
      ],
    });

    // Most recent = smallest months-since, not first in the array.
    expect(deriveSignals(segment, now).monthsSinceMostRecentEducationEnd).toBe(7);
  });

  it('ignores ongoing education when computing recency, and flags it separately', () => {
    const segment = makeSegment({
      education: [makeEducation({ endDate: 'Expected 2027', isOngoing: true })],
    });

    const derived = deriveSignals(segment, now);

    expect(derived.mostRecentEducationIsOngoing).toBe(true);
    expect(derived.monthsSinceMostRecentEducationEnd).toBeNull();
  });

  it('reports null recency when no education date can be parsed', () => {
    const segment = makeSegment({ education: [makeEducation({ endDate: 'Present' })] });
    expect(deriveSignals(segment, now).monthsSinceMostRecentEducationEnd).toBeNull();
  });
});

describe('inferRegion', () => {
  it('prefers a stated location over a phone country code', () => {
    // +1 is shared between the US and Canada, so a stated location must win — otherwise a
    // Toronto candidate is told to use US-only boards.
    const segment = makeSegment({
      contact: { name: null, email: null, phone: '+1 416 555 0100', location: 'Toronto, Canada', links: [] },
    });
    expect(inferRegion(segment)).toBe('Canada');
  });

  it('falls back to the phone country code when no location is stated', () => {
    const segment = makeSegment({
      contact: { name: null, email: null, phone: '+91 90000 00000', location: null, links: [] },
    });
    expect(inferRegion(segment)).toBe('India');
  });

  it('reads a region from education location when contact has none', () => {
    const segment = makeSegment({
      education: [makeEducation({ location: 'Manchester, United Kingdom' })],
    });
    expect(inferRegion(segment)).toBe('United Kingdom');
  });

  it('recognises a city name without its country', () => {
    const segment = makeSegment({
      contact: { name: null, email: null, phone: null, location: 'Bengaluru', links: [] },
    });
    expect(inferRegion(segment)).toBe('India');
  });

  it('returns null rather than guessing when there is no signal', () => {
    expect(inferRegion(makeSegment())).toBeNull();
  });
});

describe('region drives platform recommendations end to end', () => {
  // The Task 3 acceptance criterion, exercised through the real inferRegion -> platform
  // filtering path rather than by passing a region string in by hand.
  const studentEducation = (location: string) =>
    makeSegment({
      roles: [makeRole({ durationMonths: 3, isInternship: true })],
      education: [makeEducation({ location, endDate: 'Expected 2027', isOngoing: true })],
    });

  it('offers Internshala and LinkedIn to a student educated in India', () => {
    const region = inferRegion(studentEducation('Bengaluru, India'));
    const ids = platformsForRegion(region).map((p) => p.id);

    expect(region).toBe('India');
    expect(ids).toContain('internshala');
    expect(ids).toContain('linkedin');
  });

  it('does not offer Internshala to the same student educated in the US', () => {
    const region = inferRegion(studentEducation('Columbus, Ohio, USA'));
    const ids = platformsForRegion(region).map((p) => p.id);

    expect(region).toBe('United States');
    expect(ids).not.toContain('internshala');
    expect(ids).toContain('linkedin');
  });
});

describe('needsPersonaConfirmation', () => {
  it('asks for confirmation below the threshold and not above it', () => {
    const base = { persona: 'student' as const, signals: [], careerSwitcher: false, inferredRegion: null };
    expect(needsPersonaConfirmation({ ...base, confidence: 0.4 })).toBe(true);
    expect(needsPersonaConfirmation({ ...base, confidence: 0.9 })).toBe(false);
  });
});
