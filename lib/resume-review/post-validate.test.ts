import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postValidateReview, findVerbatimSpan } from './post-validate';
import type { JobDescription, ResumeSegment, ReviewModelOutput, ReviewPersona } from './schemas';

/* =====================================================================================
 * Post-validation is where docs/resume-review-rubric.md §8's no-fabrication rule is actually
 * enforced. These tests are the reason that rule is code rather than a prompt instruction —
 * all deterministic, no model, no network.
 * ===================================================================================== */

const BULLET_ID = 'role-abc-b-111';
const BULLET_TEXT = 'Worked on the billing service alongside two other engineers.';
const QUANTIFIED_BULLET_ID = 'role-abc-b-222';
const QUANTIFIED_BULLET_TEXT = 'Reduced checkout abandonment by 18% across 3 storefronts.';

function makeSegment(overrides: Partial<ResumeSegment> = {}): ResumeSegment {
  return {
    contact: { name: 'Test Person', email: null, phone: null, location: null, links: [] },
    summary: null,
    roles: [
      {
        id: 'role-abc',
        title: 'Engineer',
        company: 'Acme',
        location: null,
        startDate: '2020',
        endDate: 'Present',
        durationMonths: 48,
        isInternship: false,
        bullets: [
          { id: BULLET_ID, text: BULLET_TEXT },
          { id: QUANTIFIED_BULLET_ID, text: QUANTIFIED_BULLET_TEXT },
        ],
      },
    ],
    education: [],
    projects: [],
    skills: ['TypeScript'],
    other: [],
    ...overrides,
  };
}

const RAW_TEXT = `Test Person\n\nEngineer, Acme (2020 - Present)\n- ${BULLET_TEXT}\n- ${QUANTIFIED_BULLET_TEXT}\n\nSkills: TypeScript`;

function makeOutput(overrides: Partial<ReviewModelOutput> = {}): ReviewModelOutput {
  return {
    overallRead: 'Solid but under-quantified.',
    dimensionNotes: [{ dimension: 'quantified_impact', note: 'Most bullets describe duties.' }],
    findings: [],
    projectSuggestions: null,
    internshipGuidance: null,
    narrativeAssessment: null,
    recruiterScan: null,
    requirementCoverage: null,
    ...overrides,
  };
}

function run(
  output: ReviewModelOutput,
  opts: {
    persona?: ReviewPersona;
    path?: 'independent' | 'against_job';
    segment?: ResumeSegment;
    region?: string | null;
    jobDescription?: JobDescription | null;
  } = {}
) {
  return postValidateReview({
    output,
    segment: opts.segment ?? makeSegment(),
    rawResumeText: RAW_TEXT,
    persona: opts.persona ?? 'mid_level',
    careerSwitcher: false,
    path: opts.path ?? 'independent',
    region: opts.region ?? null,
    jobDescription: opts.jobDescription ?? null,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('findVerbatimSpan', () => {
  const source = 'Reduced   checkout abandonment by 18%\n  across 3 storefronts.';

  it('returns the exact source substring for a whitespace-differing quote', () => {
    expect(findVerbatimSpan(source, 'Reduced checkout abandonment')).toBe('Reduced   checkout abandonment');
  });

  it('matches across a line break in the source', () => {
    expect(findVerbatimSpan(source, 'by 18% across 3 storefronts.')).toBe('by 18%\n  across 3 storefronts.');
  });

  it('is case-insensitive but returns the source casing', () => {
    expect(findVerbatimSpan(source, 'REDUCED CHECKOUT')).toBe('Reduced   checkout');
  });

  it('returns null for text that is genuinely absent', () => {
    expect(findVerbatimSpan(source, 'Led a team of eight')).toBeNull();
  });

  it('returns null for empty input rather than matching everything', () => {
    expect(findVerbatimSpan(source, '   ')).toBeNull();
  });
});

/* =====================================================================================
 * The no-fabrication rule
 * ===================================================================================== */

describe('fabrication detection', () => {
  it('drops the canonical fabrication from the rubric', () => {
    // The exact failure docs/resume-review-rubric.md §8 names: a metric the candidate never
    // stated, attached to a claim they cannot defend in an interview.
    const { result, dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'quantified_impact',
            severity: 'critical',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: BULLET_TEXT,
            suggestedText: 'Drove a 40% reduction in billing latency, saving $2M annually.',
            reason: 'Duty statement with no outcome.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(result.findings).toHaveLength(0);
    expect(dropped[0]).toMatchObject({ kind: 'finding', reason: 'fabricated-number' });
  });

  it('logs a fabrication with INVALID_OUTPUT so it is greppable as the failure it is', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    run(
      makeOutput({
        findings: [
          {
            dimension: 'quantified_impact',
            severity: 'critical',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: BULLET_TEXT,
            suggestedText: 'Cut latency by 40%.',
            reason: 'No outcome.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    const logged = error.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(logged).toContainEqual(
      expect.objectContaining({ event: 'review_item_dropped', reason: 'fabricated-number', errorCode: 'INVALID_OUTPUT' })
    );
  });

  it('keeps a rewrite that asks for the number with a placeholder instead of inventing one', () => {
    const { result, dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'quantified_impact',
            severity: 'critical',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: BULLET_TEXT,
            suggestedText: 'Reduced billing latency by [X%] across [N] services.',
            reason: 'States a duty rather than an outcome.',
            addedPlaceholders: ['[X%]', '[N]'],
          },
        ],
      })
    );

    expect(dropped).toHaveLength(0);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].suggestedText).toContain('[X%]');
    expect(result.findings[0].id).toMatch(/^find-/);
  });

  it('keeps numbers that were already in the original', () => {
    const { result, dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'action_verb_strength',
            severity: 'improvement',
            targetBulletId: QUANTIFIED_BULLET_ID,
            targetSection: null,
            originalText: QUANTIFIED_BULLET_TEXT,
            suggestedText: 'Cut checkout abandonment 18% across 3 storefronts by simplifying the payment step.',
            reason: 'Leads with a stronger verb.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(dropped).toHaveLength(0);
    expect(result.findings).toHaveLength(1);
  });

  it('tolerates reformatting of a number that was already present', () => {
    // "18%" vs "18 %" is a formatting difference, not an invented magnitude.
    const { result } = run(
      makeOutput({
        findings: [
          {
            dimension: 'action_verb_strength',
            severity: 'polish',
            targetBulletId: QUANTIFIED_BULLET_ID,
            targetSection: null,
            originalText: QUANTIFIED_BULLET_TEXT,
            suggestedText: 'Cut checkout abandonment by 18 % across 3 storefronts.',
            reason: 'Tighter phrasing.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(result.findings).toHaveLength(1);
  });
});

describe('placeholder declaration', () => {
  it('drops a finding whose placeholders are not declared', () => {
    const { result, dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'quantified_impact',
            severity: 'critical',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: BULLET_TEXT,
            suggestedText: 'Reduced billing latency by [X%].',
            reason: 'No outcome.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(result.findings).toHaveLength(0);
    expect(dropped[0].reason).toBe('placeholder-mismatch');
  });

  it('drops a finding declaring a placeholder it never used', () => {
    const { dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'quantified_impact',
            severity: 'critical',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: BULLET_TEXT,
            suggestedText: 'Owned the billing service.',
            reason: 'No outcome.',
            addedPlaceholders: ['[X%]'],
          },
        ],
      })
    );

    expect(dropped[0].reason).toBe('placeholder-mismatch');
  });
});

/* =====================================================================================
 * Verbatim grounding
 * ===================================================================================== */

describe('verbatim grounding', () => {
  it('drops a finding quoting text that is not in the resume', () => {
    const { result, dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'action_verb_strength',
            severity: 'improvement',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: 'Led a team of engineers to deliver the platform migration.',
            reason: 'Weak verb.',
            suggestedText: null,
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(result.findings).toHaveLength(0);
    expect(dropped[0].reason).toBe('original-text-not-verbatim');
  });

  it('drops a finding pointing at a bullet id that does not exist', () => {
    const { dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'action_verb_strength',
            severity: 'polish',
            targetBulletId: 'role-zzz-b-999',
            targetSection: null,
            originalText: BULLET_TEXT,
            reason: 'Weak verb.',
            suggestedText: null,
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(dropped[0].reason).toBe('unknown-bullet-id');
  });

  it('canonicalises whitespace differences rather than dropping over them', () => {
    const { result } = run(
      makeOutput({
        findings: [
          {
            dimension: 'action_verb_strength',
            severity: 'polish',
            targetBulletId: BULLET_ID,
            targetSection: null,
            // Model re-wrapped the line. Not a fabrication.
            originalText: 'Worked on the billing service\n  alongside two other engineers.',
            reason: 'Weak verb.',
            suggestedText: null,
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(result.findings).toHaveLength(1);
    // Output carries the canonical text, so downstream consumers get an exact match.
    expect(result.findings[0].originalText).toBe(BULLET_TEXT);
  });

  it('accepts a verbatim fragment of a bullet, not only the whole bullet', () => {
    // A model fixing one clause quotes that clause. Requiring equality with the entire bullet
    // rejected these, which cost every bullet-level finding in one observed live review.
    const { result, dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'action_verb_strength',
            severity: 'improvement',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: 'Worked on the billing service',
            suggestedText: 'Owned the billing service',
            reason: 'Weak opener.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(dropped).toHaveLength(0);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].originalText).toBe('Worked on the billing service');
    expect(BULLET_TEXT).toContain(result.findings[0].originalText);
  });

  it('still drops a fragment that is not actually in the referenced bullet', () => {
    const { dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'action_verb_strength',
            severity: 'improvement',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: 'Worked on the payments gateway',
            suggestedText: null,
            reason: 'Weak opener.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(dropped[0].reason).toBe('original-text-not-verbatim');
  });

  it('allows an empty originalText for a finding about something absent', () => {
    const { result } = run(
      makeOutput({
        findings: [
          {
            dimension: 'section_completeness',
            severity: 'critical',
            targetBulletId: null,
            targetSection: 'Education',
            originalText: '',
            suggestedText: null,
            reason: 'No education section is present.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(result.findings).toHaveLength(1);
  });

  it('drops a finding that targets nothing at all', () => {
    const { dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'signal_to_length',
            severity: 'polish',
            targetBulletId: null,
            targetSection: null,
            originalText: '',
            suggestedText: null,
            reason: 'Vague.',
            addedPlaceholders: [],
          },
        ],
      })
    );

    expect(dropped[0].reason).toBe('no-target');
  });
});

/* =====================================================================================
 * Persona gating — enforced in code, never by prompt
 * ===================================================================================== */

describe('persona gating', () => {
  const evidenceOutput = makeOutput({
    projectSuggestions: [
      { title: 'P', scope: 's', skillDemonstrated: 'k', groundedIn: 'g', estimatedEffort: '2 weeks' },
    ],
    internshipGuidance: { platformIds: ['linkedin'], approach: ['Apply weekly.'], leverageExisting: 'Use your projects.' },
  });

  it.each<ReviewPersona>(['mid_level', 'senior'])(
    'strips project suggestions and internship guidance for %s',
    (persona) => {
      // A mid-level or senior candidate told to go get an internship closes the tab. This must
      // not depend on the model having followed instructions.
      const { result } = run(evidenceOutput, { persona });

      expect(result.projectSuggestions).toBeNull();
      expect(result.internshipGuidance).toBeNull();
      expect(result.resolvedPlatforms).toBeNull();
    }
  );

  it.each<ReviewPersona>(['student', 'early_career'])('keeps evidence guidance for %s', (persona) => {
    const { result } = run(evidenceOutput, { persona, region: 'India' });

    expect(result.projectSuggestions).toHaveLength(1);
    expect(result.internshipGuidance).not.toBeNull();
  });

  it('caps project suggestions at three', () => {
    const many = makeOutput({
      projectSuggestions: Array.from({ length: 5 }, (_, i) => ({
        title: `P${i}`,
        scope: 's',
        skillDemonstrated: 'k',
        groundedIn: 'g',
        estimatedEffort: '2 weeks',
      })),
    });

    expect(run(many, { persona: 'student' }).result.projectSuggestions).toHaveLength(3);
  });

  it('strips the narrative assessment for every persona except senior', () => {
    const withNarrative = makeOutput({
      narrativeAssessment: {
        progression: 'p',
        scopeGrowth: 's',
        spaceAllocation: 'a',
        influenceBeyondDelivery: 'i',
        overall: 'o',
      },
    });

    expect(run(withNarrative, { persona: 'student' }).result.narrativeAssessment).toBeNull();
    expect(run(withNarrative, { persona: 'mid_level' }).result.narrativeAssessment).toBeNull();
    expect(run(withNarrative, { persona: 'senior' }).result.narrativeAssessment).not.toBeNull();
  });

  it('drops findings on a dimension that is not active for the persona', () => {
    const { result, dropped } = run(
      makeOutput({
        findings: [
          {
            dimension: 'evidence_portfolio',
            severity: 'critical',
            targetBulletId: BULLET_ID,
            targetSection: null,
            originalText: BULLET_TEXT,
            suggestedText: null,
            reason: 'No projects.',
            addedPlaceholders: [],
          },
        ],
      }),
      { persona: 'senior' }
    );

    expect(result.findings).toHaveLength(0);
    expect(dropped[0].reason).toBe('dimension-not-active-for-persona');
  });

  it('resolves platform ids through the registry and drops unknown ones', () => {
    const { result } = run(
      makeOutput({
        internshipGuidance: {
          platformIds: ['internshala', 'totally-made-up', 'linkedin'],
          approach: ['Apply.'],
          leverageExisting: 'x',
        },
      }),
      { persona: 'student', region: 'India' }
    );

    expect(result.internshipGuidance?.platformIds).toEqual(['internshala', 'linkedin']);
    expect(result.resolvedPlatforms?.map((p) => p.url)).toEqual([
      'https://internshala.com',
      'https://www.linkedin.com/jobs',
    ]);
  });
});

/* =====================================================================================
 * Caps
 * ===================================================================================== */

describe('findings caps', () => {
  function manyFindings(count: number, severity: 'critical' | 'polish') {
    return Array.from({ length: count }, () => ({
      dimension: 'action_verb_strength' as const,
      severity,
      targetBulletId: null,
      targetSection: 'Experience',
      originalText: '',
      suggestedText: null,
      reason: 'r',
      addedPlaceholders: [],
    }));
  }

  it('enforces the persona total cap', () => {
    const { result } = run(makeOutput({ findings: manyFindings(30, 'improvement' as 'critical') }), {
      persona: 'student',
    });
    expect(result.findings.length).toBeLessThanOrEqual(10);
  });

  it('never drops a critical finding to make room for a polish one', () => {
    const output = makeOutput({ findings: [...manyFindings(12, 'polish'), ...manyFindings(3, 'critical')] });
    const { result } = run(output, { persona: 'student' });

    expect(result.findings).toHaveLength(10);
    expect(result.findings.filter((f) => f.severity === 'critical')).toHaveLength(3);
  });

  it('applies the senior asymmetric per-role cap', () => {
    // Rubric §3: 6 findings allowed on each of the two most recent roles, 3 on anything older.
    const segment = makeSegment({
      roles: [
        {
          id: 'role-recent',
          title: 'Staff Engineer',
          company: 'Acme',
          location: null,
          startDate: '2022',
          endDate: 'Present',
          durationMonths: 36,
          isInternship: false,
          bullets: Array.from({ length: 10 }, (_, i) => ({ id: `recent-b-${i}`, text: `Recent bullet number ${i} here.` })),
        },
        {
          id: 'role-second',
          title: 'Senior Engineer',
          company: 'Beta',
          location: null,
          startDate: '2018',
          endDate: '2022',
          durationMonths: 48,
          isInternship: false,
          bullets: [{ id: 'second-b-0', text: 'Second role bullet.' }],
        },
        {
          id: 'role-old',
          title: 'Engineer',
          company: 'Gamma',
          location: null,
          startDate: '2014',
          endDate: '2018',
          durationMonths: 48,
          isInternship: false,
          bullets: Array.from({ length: 10 }, (_, i) => ({ id: `old-b-${i}`, text: `Old bullet number ${i} here.` })),
        },
      ],
    });

    const findingsFor = (ids: string[], texts: string[]) =>
      ids.map((id, i) => ({
        dimension: 'action_verb_strength' as const,
        severity: 'improvement' as const,
        targetBulletId: id,
        targetSection: null,
        originalText: texts[i],
        suggestedText: null,
        reason: 'r',
        addedPlaceholders: [],
      }));

    const { result } = run(
      makeOutput({
        findings: [
          ...findingsFor(
            Array.from({ length: 8 }, (_, i) => `recent-b-${i}`),
            Array.from({ length: 8 }, (_, i) => `Recent bullet number ${i} here.`)
          ),
          ...findingsFor(
            Array.from({ length: 6 }, (_, i) => `old-b-${i}`),
            Array.from({ length: 6 }, (_, i) => `Old bullet number ${i} here.`)
          ),
        ],
      }),
      { persona: 'senior', segment }
    );

    const recentCount = result.findings.filter((f) => f.targetBulletId?.startsWith('recent-b')).length;
    const oldCount = result.findings.filter((f) => f.targetBulletId?.startsWith('old-b')).length;

    expect(recentCount).toBe(6);
    expect(oldCount).toBe(3);
  });
});

/* =====================================================================================
 * Against-job path
 * ===================================================================================== */

describe('requirement traceability', () => {
  const jobDescription: JobDescription = {
    title: 'Platform Engineer',
    company: 'Northwind',
    location: 'Remote',
    descriptionText:
      'We are looking for someone with 3+ years of production Kubernetes experience, strong PostgreSQL skills, and a track record of owning services end to end.',
    sourceUrl: null,
    retrievalMethod: 'paste',
  };

  it('keeps a requirement traceable to the job description', () => {
    const { result } = run(
      makeOutput({
        requirementCoverage: [
          {
            requirement: '3+ years of production Kubernetes experience',
            status: 'partial',
            evidenceInResume: null,
            howToAddress: 'Name the clusters you actually operated.',
          },
        ],
      }),
      { path: 'against_job', jobDescription }
    );

    expect(result.requirementCoverage).toHaveLength(1);
  });

  it('keeps a requirement the model annotated with punctuation', () => {
    // Observed live: "(Nice to have)" made every word fail a naive substring match, dropping a
    // requirement that is plainly in the job description.
    const { result, dropped } = run(
      makeOutput({
        requirementCoverage: [
          {
            requirement: 'Owning services end to end. (Nice to have)',
            status: 'partial',
            evidenceInResume: null,
            howToAddress: 'Name the service you owned.',
          },
        ],
      }),
      { path: 'against_job', jobDescription }
    );

    expect(dropped.filter((d) => d.reason === 'requirement-not-traceable')).toHaveLength(0);
    expect(result.requirementCoverage).toHaveLength(1);
  });

  it('drops a requirement the job description never stated', () => {
    const { result, dropped } = run(
      makeOutput({
        requirementCoverage: [
          {
            requirement: 'Must hold an active security clearance and a pilot licence',
            status: 'absent',
            evidenceInResume: null,
            howToAddress: 'Obtain clearance.',
          },
        ],
      }),
      { path: 'against_job', jobDescription }
    );

    expect(result.requirementCoverage).toHaveLength(0);
    expect(dropped.some((d) => d.reason === 'requirement-not-traceable')).toBe(true);
  });

  it('strips against-job output entirely on the independent path', () => {
    const { result } = run(
      makeOutput({
        recruiterScan: {
          whatLandsFirst: 'a',
          whatIsMissingUpTop: 'b',
          fifteenSecondVerdict: 'c',
          worksWell: [],
          worksAgainst: [],
        },
        requirementCoverage: [
          { requirement: 'x', status: 'covered', evidenceInResume: null, howToAddress: 'y' },
        ],
      }),
      { path: 'independent' }
    );

    expect(result.recruiterScan).toBeNull();
    expect(result.requirementCoverage).toBeNull();
  });
});

describe('result shape', () => {
  it('carries no numeric score field, on either path', () => {
    // Rubric §7 — deliberate, and worth a test so it cannot be added back casually.
    const { result } = run(makeOutput());
    const keys = Object.keys(result);
    expect(keys).not.toContain('score');
    expect(keys).not.toContain('rating');
    expect(JSON.stringify(result)).not.toMatch(/"score"|"rating"|"outOf"/);
  });
});
