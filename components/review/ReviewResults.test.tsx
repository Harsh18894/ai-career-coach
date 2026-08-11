import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewResults } from './ReviewResults';
import { PlaceholderText } from './ReviewPrimitives';
import type { Finding, ReviewResult } from '@/lib/resume-review/schemas';

/* =====================================================================================
 * The review UI's job is to make the no-fabrication rule visible and the priority ordering
 * obvious. Both are things a refactor could quietly break without any test failing elsewhere.
 * ===================================================================================== */

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'find-1',
    dimension: 'quantified_impact',
    severity: 'improvement',
    targetBulletId: 'bullet-1',
    targetSection: null,
    originalText: 'Worked on the billing service.',
    suggestedText: 'Owned the billing service.',
    reason: 'States a duty rather than an outcome.',
    addedPlaceholders: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    persona: 'mid_level',
    careerSwitcher: false,
    path: 'independent',
    overallRead: 'Competent but under-quantified.',
    dimensionNotes: [],
    findings: [],
    projectSuggestions: null,
    internshipGuidance: null,
    resolvedPlatforms: null,
    narrativeAssessment: null,
    recruiterScan: null,
    requirementCoverage: null,
    ...overrides,
  };
}

const GROUPS = [{ id: 'role-1', label: 'Engineer · Acme', bulletIds: ['bullet-1', 'bullet-2'] }];

function renderResults(result: ReviewResult) {
  return render(<ReviewResults result={result} groupIndex={GROUPS} onVote={vi.fn()} />);
}

describe('placeholder rendering', () => {
  it('marks placeholders so they cannot be mistaken for finished text', () => {
    render(<PlaceholderText text="Reduced latency by [X%] across [N] services." />);
    // <mark> is the semantic element; the visual treatment is on top of it, not instead of it.
    const marks = document.querySelectorAll('mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['[X%]', '[N]']);
  });

  it('leaves text without placeholders unmarked', () => {
    render(<PlaceholderText text="Owned the billing service." />);
    expect(document.querySelectorAll('mark')).toHaveLength(0);
  });

  it('explains in the interface why blanks are not filled in', () => {
    renderResults(
      makeResult({
        findings: [
          makeFinding({ suggestedText: 'Reduced latency by [X%].', addedPlaceholders: ['[X%]'] }),
        ],
      })
    );

    // The reasoning has to be visible to someone who never reads a README.
    expect(screen.getByText(/only you know your real numbers/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot defend in an interview/i)).toBeInTheDocument();
  });

  it('does not show the placeholder note when no finding uses one', () => {
    renderResults(makeResult({ findings: [makeFinding()] }));
    expect(screen.queryByText(/only you know your real numbers/i)).not.toBeInTheDocument();
  });
});

describe('finding presentation', () => {
  it('shows the original and the rewrite as a diff, not as abstract advice', () => {
    renderResults(makeResult({ findings: [makeFinding()] }));

    expect(screen.getByText('Currently')).toBeInTheDocument();
    expect(screen.getByText('Worked on the billing service.')).toBeInTheDocument();
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    expect(screen.getByText('Owned the billing service.')).toBeInTheDocument();
    expect(screen.getByText('States a duty rather than an outcome.')).toBeInTheDocument();
  });

  it('labels severity in text, never by colour alone', () => {
    renderResults(
      makeResult({
        findings: [
          makeFinding({ id: 'f1', severity: 'critical' }),
          makeFinding({ id: 'f2', severity: 'polish', targetBulletId: 'bullet-2' }),
        ],
      })
    );

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Polish')).toBeInTheDocument();
  });

  it('orders findings within a role by severity', () => {
    renderResults(
      makeResult({
        findings: [
          makeFinding({ id: 'f-polish', severity: 'polish' }),
          makeFinding({ id: 'f-critical', severity: 'critical', targetBulletId: 'bullet-2' }),
        ],
      })
    );

    const chips = screen.getAllByText(/^(Critical|Improvement|Polish)$/);
    expect(chips[0]).toHaveTextContent('Critical');
  });

  it('groups findings under the role their bullet belongs to', () => {
    renderResults(makeResult({ findings: [makeFinding()] }));
    expect(screen.getByRole('heading', { name: 'Engineer · Acme' })).toBeInTheDocument();
  });

  it('offers copy-to-clipboard on a rewrite', () => {
    renderResults(makeResult({ findings: [makeFinding()] }));
    expect(screen.getByRole('button', { name: /copy rewrite/i })).toBeInTheDocument();
  });

  it('omits the suggested block entirely when there is no single-line rewrite', () => {
    renderResults(
      makeResult({
        findings: [makeFinding({ suggestedText: null, targetSection: 'Education', targetBulletId: null })],
      })
    );
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
  });

  it('records a vote once, with the finding\'s shape', async () => {
    const onVote = vi.fn();
    const user = userEvent.setup();
    render(
      <ReviewResults
        result={makeResult({ findings: [makeFinding({ id: 'find-xyz' })] })}
        groupIndex={GROUPS}
        onVote={onVote}
      />
    );

    await user.click(screen.getByRole('button', { name: /was useful/i }));

    expect(onVote).toHaveBeenCalledWith('find-xyz', 'up');
    // Voting twice on the same finding would skew the Phase 3 signal.
    expect(screen.queryByRole('button', { name: /was useful/i })).not.toBeInTheDocument();
  });
});

describe('the strong-resume state', () => {
  it('says so plainly and positively when there are no critical findings', () => {
    renderResults(makeResult({ findings: [makeFinding({ severity: 'polish' })] }));
    expect(screen.getByText(/nothing here is likely to cost you an interview/i)).toBeInTheDocument();
    expect(screen.getByText(/genuine result/i)).toBeInTheDocument();
  });

  it('does not claim that when something critical was found', () => {
    renderResults(makeResult({ findings: [makeFinding({ severity: 'critical' })] }));
    expect(screen.queryByText(/nothing here is likely to cost you an interview/i)).not.toBeInTheDocument();
  });
});

describe('section ordering by persona and path', () => {
  it('puts evidence guidance above the line-by-line findings for a student', () => {
    // Rubric §3.2: for a student with no projects or internships this is the single
    // highest-leverage output and must outrank every formatting note.
    const { container } = renderResults(
      makeResult({
        persona: 'student',
        findings: [makeFinding({ severity: 'polish' })],
        projectSuggestions: [
          {
            title: 'Course Feedback Analysis',
            scope: 'Analyse a term of feedback data.',
            skillDemonstrated: 'SQL and pandas',
            groundedIn: 'SQL listed at coursework level',
            estimatedEffort: '2 weeks',
          },
        ],
        internshipGuidance: { platformIds: ['internshala'], approach: ['Apply weekly.'], leverageExisting: 'Use your coursework.' },
        resolvedPlatforms: [
          { id: 'internshala', name: 'Internshala', url: 'https://internshala.com', notes: 'India-specific.' },
        ],
      })
    );

    const html = container.innerHTML;
    expect(html.indexOf('Start here: build evidence')).toBeGreaterThan(-1);
    expect(html.indexOf('Start here: build evidence')).toBeLessThan(html.indexOf('Line-by-line'));
  });

  it('attributes platform links to the curated registry and opens them safely', () => {
    renderResults(
      makeResult({
        persona: 'student',
        internshipGuidance: { platformIds: ['internshala'], approach: [], leverageExisting: '' },
        resolvedPlatforms: [
          { id: 'internshala', name: 'Internshala', url: 'https://internshala.com', notes: 'India-specific.' },
        ],
      })
    );

    const link = screen.getByRole('link', { name: /internshala/i });
    expect(link).toHaveAttribute('href', 'https://internshala.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/hand-checked list/i)).toBeInTheDocument();
    expect(screen.getByText(/not.*generated by the model/i)).toBeInTheDocument();
  });

  it('puts the narrative assessment above line-level findings for a senior', () => {
    const { container } = renderResults(
      makeResult({
        persona: 'senior',
        findings: [makeFinding()],
        narrativeAssessment: {
          progression: 'Flat.',
          scopeGrowth: 'Not visible.',
          spaceAllocation: 'Even across roles.',
          influenceBeyondDelivery: 'No mention of others.',
          overall: 'Reads as a list of jobs.',
        },
      })
    );

    const html = container.innerHTML;
    expect(html.indexOf('The story your resume tells')).toBeLessThan(html.indexOf('Line-by-line'));
  });

  it('leads the against-job path with the recruiter scan, then coverage, then findings', () => {
    const { container } = renderResults(
      makeResult({
        path: 'against_job',
        findings: [makeFinding()],
        recruiterScan: {
          whatLandsFirst: 'Backend title.',
          whatIsMissingUpTop: 'No Kubernetes.',
          fifteenSecondVerdict: 'Probably a yes to a screen.',
          worksWell: ['Relevant stack'],
          worksAgainst: ['No infra ownership'],
        },
        requirementCoverage: [
          {
            requirement: '3+ years production Kubernetes',
            status: 'partial',
            evidenceInResume: 'deploy and debug, not cluster administration',
            howToAddress: 'Name what you actually operated.',
          },
        ],
      })
    );

    const html = container.innerHTML;
    const scan = html.indexOf('The 10–15 second scan');
    const coverage = html.indexOf('What the job asks for');
    const findings = html.indexOf('Line-by-line');

    expect(scan).toBeGreaterThan(-1);
    expect(scan).toBeLessThan(coverage);
    expect(coverage).toBeLessThan(findings);
  });

  it('labels coverage status in text, never by colour alone', () => {
    renderResults(
      makeResult({
        path: 'against_job',
        requirementCoverage: [
          { requirement: 'A', status: 'covered', evidenceInResume: null, howToAddress: 'x' },
          { requirement: 'B', status: 'partial', evidenceInResume: null, howToAddress: 'y' },
          { requirement: 'C', status: 'absent', evidenceInResume: null, howToAddress: 'z' },
        ],
      })
    );

    expect(screen.getByText('Covered')).toBeInTheDocument();
    expect(screen.getByText('Partly covered')).toBeInTheDocument();
    expect(screen.getByText('Not addressed')).toBeInTheDocument();
  });

  it('states that requirement coverage is a surface match, not a fit verdict', () => {
    renderResults(
      makeResult({
        path: 'against_job',
        requirementCoverage: [
          { requirement: 'A', status: 'covered', evidenceInResume: null, howToAddress: 'x' },
        ],
      })
    );
    expect(screen.getByText(/not a judgement of whether you would get the job/i)).toBeInTheDocument();
  });

  it('shows project grounding, so a suggestion is visibly tied to this resume', () => {
    renderResults(
      makeResult({
        persona: 'student',
        projectSuggestions: [
          {
            title: 'Course Feedback Analysis',
            scope: 'Analyse a term of feedback data.',
            skillDemonstrated: 'SQL and pandas',
            groundedIn: 'SQL listed at coursework level',
            estimatedEffort: '2 weeks',
          },
        ],
      })
    );

    expect(screen.getByText('Course Feedback Analysis')).toBeInTheDocument();
    expect(screen.getByText(/SQL listed at coursework level/)).toBeInTheDocument();
    expect(screen.getByText(/suggested because/i)).toBeInTheDocument();
  });
});
