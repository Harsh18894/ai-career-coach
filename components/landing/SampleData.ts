import type { Destination } from '@/components/trajectory/Trajectory';

/* =====================================================================================
 * The sample deck and roadmap shown on the landing page.
 *
 * Every field below is REAL MODEL OUTPUT, copied from committed eval snapshots:
 *   evals/.cache/snapshots/generatePaths:R-grow-01:c3.json
 *   evals/.cache/snapshots/generateRoadmap:R-grad-01:g1.json
 *
 * Nothing here is written to sound good. The fit rationales name a company, a system and a
 * metric because that is what the model actually produced for that fixture — which is the
 * entire argument the page is making, and inventing better copy would hollow it out.
 *
 * The candidate is fictional (see evals/fixtures), so no real person's career is on the page.
 *
 * WHY THERE ARE NO PERCENTAGES. A path carries `tier` and an `ambitionCheck` verdict, not a
 * score — see CareerPathSchema. A "% fit" would be a number this product never computes.
 * ===================================================================================== */

export type SamplePath = {
  id: string;
  index: string;
  title: string;
  tier: 'conservative' | 'realistic' | 'ambitious';
  timeline: string;
  salaryRange: string;
  /** One line, for the collapsed card. */
  summary: string;
  /** The verbatim fitRationale — the evidence, shown when the card expands. */
  fitRationale: string;
  /** The specific fragments of the resume this points at. Rendered as evidence markers. */
  evidence: string[];
  ambition: { verdict: 'aligned' | 'too_high' | 'too_low'; note: string };
  upskills: string[];
  firstMove: string;
};

export const SAMPLE_PROFILE_SUMMARY = {
  name: 'Sample profile',
  headline: 'Senior Analyst · 5 years · Revenue operations, B2B SaaS',
  facts: [
    'Promoted to Senior Analyst with team-lead scope',
    'Built the first SQL-based commission engine',
    'Owns the executive revenue dashboard',
    'Cut forecast variance from 18% to 7%',
  ],
};

export const SAMPLE_PATHS: SamplePath[] = [
  {
    id: 'revops-manager',
    index: '01',
    title: 'Revenue Operations Manager',
    tier: 'conservative',
    timeline: '1–2 months',
    salaryRange: 'CAD 110,000 – 140,000',
    summary: 'Formalise the lead scope you already carry into a manager title where you are.',
    fitRationale:
      'You already carry lead responsibilities at Ledgerly: you were promoted to Senior Analyst with team-lead scope, ran a three-person workstream, mentored two junior analysts, and cut forecast variance from 18% to 7%.',
    evidence: ['team-lead scope', 'three-person workstream', 'mentored two junior analysts', 'variance 18% → 7%'],
    ambition: {
      verdict: 'aligned',
      note: 'The scope is already yours; this is a title catching up with the work, not a leap.',
    },
    upskills: ['Headcount planning and performance conversations', 'Formal budget ownership'],
    firstMove:
      'Create a one-page manager proposal summarising outcomes, and ask for a 30-minute meeting about a formal title.',
  },
  {
    id: 'revops-systems-lead',
    index: '02',
    title: 'Principal Revenue Operations — Systems & Analytics Lead',
    tier: 'realistic',
    timeline: '3–4 months',
    salaryRange: 'CAD 120,000 – 160,000',
    summary: 'Stay technical. Own the platform rather than the people.',
    fitRationale:
      'You built Ledgerly’s first SQL-based commission calculation engine, own the executive revenue dashboard, and redesigned the forecasting model (variance 18% → 7%). If you prefer to keep shipping technical systems and own platform-level reliability rather than people management, this role matches your demonstrated technical impact.',
    evidence: ['SQL commission engine', 'executive revenue dashboard', 'redesigned forecasting model'],
    ambition: {
      verdict: 'aligned',
      note: 'You already shipped the commission engine and executive dashboard; pushing those artifacts to production-grade is a natural, supported step rather than a stretch.',
    },
    upskills: [
      'Productionize the commission engine: tests, CI, rollback plans',
      'Dashboard governance: SLAs and data lineage docs',
    ],
    firstMove:
      'Audit the commission engine and executive dashboard for two weeks, then present a roadmap with risks and SLOs.',
  },
  {
    id: 'gtm-finance',
    index: '03',
    title: 'GTM Finance Lead, mid-stage SaaS',
    tier: 'ambitious',
    timeline: '6–8 months',
    salaryRange: 'CAD 140,000 – 180,000',
    summary: 'Take the same skills somewhere with a wider remit — and a real step up in scope.',
    fitRationale:
      'You have the exact technical and domain signals hiring managers for Sales Finance want: SQL, NetSuite, forecasting, commission design and financial modeling, plus the concrete result of redesigning the quarterly forecast and building the first SQL commission calculation engine.',
    evidence: ['SQL, NetSuite, forecasting', 'commission design', 'quarterly forecast redesign'],
    ambition: {
      verdict: 'too_high',
      note: 'This is a genuine stretch. Expect one intermediate move, or a longer runway than the other two — the finance remit is broader than what your current title covers.',
    },
    upskills: ['Accounting and FP&A fundamentals — monthly close, IFRS basics', 'Board-level financial storytelling'],
    firstMove:
      'Meet the FP&A lead and propose a 30-day shadow project on month-end close or the budget build.',
  },
];

/** The hero diagram reads from the same deck, so the fold and the section below cannot drift. */
export const HERO_DESTINATIONS: Destination[] = SAMPLE_PATHS.map((p) => ({
  id: p.id,
  label: p.title.split('—')[0].split(',')[0].trim(),
  tier: p.tier,
  calibration: p.ambition.note,
  evidence: p.evidence[0],
}));

export type RoadmapMilestone = {
  week: string;
  phase: string;
  title: string;
  detail: string;
  items: string[];
};

/** From generateRoadmap:R-grad-01:g1.json — a real 12-week plan, four of its milestones. */
export const SAMPLE_ROADMAP_MILESTONES: RoadmapMilestone[] = [
  {
    week: 'Week 01',
    phase: 'Skills',
    title: 'Advanced SQL & query optimization',
    detail: 'Close the specific gaps before building anything, so the project is not the place you learn the basics.',
    items: ['Study window functions, CTEs, partitioning', 'Practice with explain plans on sample queries'],
  },
  {
    week: 'Week 04',
    phase: 'Project',
    title: 'Project scoping and data ingestion',
    detail: 'Start the portfolio piece — the thing you will actually point at in an interview.',
    items: ['Define dataset and create sample file', 'Set up Git repo and project structure'],
  },
  {
    week: 'Week 08',
    phase: 'Proof',
    title: 'Orchestration and transformations',
    detail: 'Make it real: scheduled, tested, and documented well enough that someone else could run it.',
    items: ['Schedule the pipeline end to end', 'Write tests and a short design note'],
  },
  {
    week: 'Week 12',
    phase: 'Apply',
    title: 'Targeted applications',
    detail: 'Apply narrowly and specifically, with the project as the centre of the story.',
    items: ['Shortlist roles that match the built stack', 'Rewrite the resume around the project'],
  },
];
