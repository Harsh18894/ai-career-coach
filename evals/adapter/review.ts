import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config';

/* =====================================================================================
 * Adapter for the resume-review pipeline, mirroring adapter/coach.ts's role: one place that
 * knows how to reach the real app module, so the suites depend on a stable shape.
 *
 * Unlike the coach adapter this binds directly with no mock fallback. That adapter's mock
 * exists because its interface was specified before the module it wraps; here the module came
 * first and is always importable, so a mock would only ever hide a real breakage.
 * ===================================================================================== */

export type ReviewModule = typeof import('../../lib/resume-review');
export type SchemaModule = typeof import('../../lib/resume-review/schemas');

export async function getReview(): Promise<ReviewModule> {
  return import('../../lib/resume-review');
}

/* =====================================================================================
 * Fixtures
 * ===================================================================================== */

export function loadReviewResume(id: string): string {
  return readFileSync(join(config.fixturesDir, 'resumes', `${id}.txt`), 'utf-8');
}

export function loadJob(id: string): string {
  return readFileSync(join(config.fixturesDir, 'jobs', `${id}.txt`), 'utf-8');
}

export async function jobDescription(id: string) {
  const { JobDescriptionSchema } = await import('../../lib/resume-review/schemas');
  return JobDescriptionSchema.parse({
    title: null,
    company: null,
    location: null,
    descriptionText: loadJob(id),
    sourceUrl: null,
    retrievalMethod: 'paste',
  });
}

/* =====================================================================================
 * The fixture registry.
 *
 * `expectedPersona` is what the classifier SHOULD produce. Where a fixture genuinely sits on
 * a boundary, more than one answer is defensible and the eval accepts any of them rather than
 * encoding a coin-flip as a requirement — see R7.
 * ===================================================================================== */

export type ReviewFixture = {
  id: string;
  /** null when the fixture is deliberately not a resume. */
  expectedPersona: ('student' | 'early_career' | 'mid_level' | 'senior')[] | null;
  expectedCareerSwitcher?: boolean;
  hasProjects: boolean;
  hasInternships: boolean;
  note: string;
};

export const REVIEW_FIXTURES: ReviewFixture[] = [
  {
    id: 'student-nothing',
    expectedPersona: ['student'],
    hasProjects: false,
    hasInternships: false,
    note: 'Enrolled, no projects, no internships — the highest-leverage branch in the rubric.',
  },
  {
    id: 'student-projects-only',
    expectedPersona: ['student'],
    hasProjects: true,
    hasInternships: false,
    note: 'Enrolled with real projects, no internships.',
  },
  {
    id: 'student-internships-only',
    expectedPersona: ['student'],
    hasProjects: false,
    hasInternships: true,
    note: 'Enrolled with two internships, no named projects.',
  },
  {
    id: 'student-both',
    expectedPersona: ['student'],
    hasProjects: true,
    hasInternships: true,
    note: 'Enrolled with both — must not have a gap manufactured for it.',
  },
  {
    id: 'senior-strong',
    expectedPersona: ['senior'],
    hasProjects: false,
    hasInternships: false,
    note: '11 years, quantified throughout, visible scope growth. The restraint case.',
  },
  {
    id: 'senior-tidy-but-flat',
    expectedPersona: ['senior'],
    hasProjects: false,
    hasInternships: false,
    note: '12 years, clean formatting, no arc and no quantification. The criticality case.',
  },
  {
    id: 'mid-level-generic',
    expectedPersona: ['mid_level'],
    hasProjects: false,
    hasInternships: false,
    note: '~4 years, duty-shaped bullets throughout.',
  },
  {
    id: 'R-switcher-01',
    // 12+ years of full-time teaching. The tenure persona still applies; the flag is what
    // carries the domain shift (rubric §6).
    expectedPersona: ['senior'],
    expectedCareerSwitcher: true,
    hasProjects: false,
    hasInternships: false,
    note: 'A decade teaching, pivoting to data. Flag must be set without bucketing as student.',
  },
  {
    id: 'resume-injection',
    expectedPersona: ['mid_level', 'senior'],
    hasProjects: false,
    hasInternships: false,
    note: 'Real resume with two embedded instruction attempts in the bullet text.',
  },
  {
    id: 'not-a-resume',
    expectedPersona: null,
    hasProjects: false,
    hasInternships: false,
    note: 'Shopping list and household notes. Must be refused, not reviewed.',
  },
];

export function fixture(id: string): ReviewFixture {
  const found = REVIEW_FIXTURES.find((entry) => entry.id === id);
  if (!found) throw new Error(`[review-fixtures] unknown fixture "${id}"`);
  return found;
}
