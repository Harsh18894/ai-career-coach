import { describe, it, expect } from 'vitest';
import { loadJob, loadReviewResume } from '../adapter/review';
import { getReviewRun, SNAPSHOT_RUNS, specFor, type StoredReview } from '../lib/review-runs';
import {
  checkNoFabrication,
  checkPersonaGating,
  checkPlaceholders,
  checkPlatformIntegrity,
  checkRequirementTraceability,
  checkVerbatimGrounding,
  describeViolations,
  type Violation,
} from '../lib/review-invariants';
import { recordResult } from '../lib/report-collector';

/**
 * R1-R6 — deterministic output invariants for resume review.
 *
 * These run in BOTH modes. In cheap mode they read committed snapshots and make zero API
 * calls; in full mode they check freshly generated output. They are pure code either way,
 * which is what makes them safe to gate a build on.
 *
 * R1 in particular is zero-tolerance: a single fabricated number is a candidate walking into
 * an interview defending a figure nobody gave them.
 */

async function loadAll(): Promise<{ spec: (typeof SNAPSHOT_RUNS)[number]; run: StoredReview }[]> {
  return Promise.all(
    SNAPSHOT_RUNS.map(async (spec) => ({ spec, run: await getReviewRun(spec) }))
  );
}

function record(id: string, title: string, violations: Violation[], passMessage: string): void {
  recordResult({
    id,
    title,
    type: 'programmatic',
    pass: violations.length === 0,
    reason: violations.length === 0 ? passMessage : describeViolations(violations),
    meta: { violationCount: violations.length, violations: violations.slice(0, 20) },
  });
}

describe('R1 — no fabricated numbers', () => {
  it('every number in a rewrite is in the original or inside a placeholder', async () => {
    const runs = await loadAll();
    const violations = runs.flatMap(({ spec, run }) => checkNoFabrication(spec.fixtureId, run.result));

    const suggested = runs.reduce(
      (total, { run }) => total + run.result.findings.filter((f) => f.suggestedText).length,
      0
    );

    record(
      'R1',
      'No fabricated numbers',
      violations,
      `${suggested} rewrites across ${runs.length} reviews contain no number absent from their original.`
    );

    expect(violations.length, describeViolations(violations)).toBe(0);
  }, 300_000);
});

describe('R2 — verbatim grounding', () => {
  it('every originalText is present in the source resume', async () => {
    const runs = await loadAll();
    const violations = runs.flatMap(({ spec, run }) =>
      checkVerbatimGrounding(spec.fixtureId, run.result, loadReviewResume(spec.fixtureId))
    );

    const quoted = runs.reduce(
      (total, { run }) => total + run.result.findings.filter((f) => f.originalText.trim() !== '').length,
      0
    );

    record('R2', 'Verbatim grounding', violations, `All ${quoted} quoted findings trace to their source resume.`);
    expect(violations.length, describeViolations(violations)).toBe(0);
  }, 300_000);
});

describe('R3 — placeholder correctness', () => {
  it('placeholders in the text and the declared list match exactly, both directions', async () => {
    const runs = await loadAll();
    const violations = runs.flatMap(({ spec, run }) => checkPlaceholders(spec.fixtureId, run.result));

    const withPlaceholders = runs.reduce(
      (total, { run }) => total + run.result.findings.filter((f) => f.addedPlaceholders.length > 0).length,
      0
    );

    record(
      'R3',
      'Placeholder correctness',
      violations,
      `${withPlaceholders} findings use placeholders; every one is declared exactly.`
    );
    expect(violations.length, describeViolations(violations)).toBe(0);
  }, 300_000);
});

describe('R4 — platform registry integrity', () => {
  it('every platform id is real and region-appropriate, and no URL is model-generated', async () => {
    const runs = await loadAll();
    const violations = runs.flatMap(({ spec, run }) =>
      checkPlatformIntegrity(
        spec.fixtureId,
        run.result,
        run.classification.inferredRegion,
        loadReviewResume(spec.fixtureId)
      )
    );

    const platformCount = runs.reduce((total, { run }) => total + (run.result.resolvedPlatforms?.length ?? 0), 0);

    record(
      'R4',
      'Platform registry integrity',
      violations,
      `${platformCount} platform links across all reviews, every one resolved from the curated registry.`
    );
    expect(violations.length, describeViolations(violations)).toBe(0);
  }, 300_000);
});

describe('R5 — persona gating', () => {
  it('evidence guidance, narrative and against-job blocks appear only where they are allowed', async () => {
    const runs = await loadAll();
    const violations = runs.flatMap(({ spec, run }) => checkPersonaGating(spec.fixtureId, run.result));

    const personas = runs.map(({ run }) => run.result.persona).join(', ');

    record(
      'R5',
      'Persona gating',
      violations,
      `Gating correct across personas: ${personas}. No mid-level or senior review carries internship guidance.`
    );
    expect(violations.length, describeViolations(violations)).toBe(0);
  }, 300_000);
});

describe('R6 — requirement traceability', () => {
  it('every requirement traces to the job description it was reviewed against', async () => {
    const againstJobSpecs = SNAPSHOT_RUNS.filter((spec) => spec.jobId);
    expect(againstJobSpecs.length, 'no against-job snapshot is configured').toBeGreaterThan(0);

    const violations: Violation[] = [];
    let requirementCount = 0;

    for (const spec of againstJobSpecs) {
      const run = await getReviewRun(spec);
      requirementCount += run.result.requirementCoverage?.length ?? 0;
      violations.push(...checkRequirementTraceability(spec.fixtureId, run.result, loadJob(spec.jobId!)));
    }

    record(
      'R6',
      'Requirement traceability',
      violations,
      `All ${requirementCount} requirements trace to the job description text.`
    );
    expect(violations.length, describeViolations(violations)).toBe(0);
  }, 300_000);
});

/** Guards the guard: if a run key ever stops resolving, the checks above would silently pass
 * over an empty set. */
describe('R1-R6 preconditions', () => {
  it('every snapshot run resolves and produced findings to check', async () => {
    const runs = await loadAll();
    for (const { spec, run } of runs) {
      expect(specFor(spec.key).fixtureId, `spec drift for ${spec.key}`).toBe(spec.fixtureId);
      expect(run.result.persona, `no persona on ${spec.key}`).toBeTruthy();
    }
    const totalFindings = runs.reduce((total, { run }) => total + run.result.findings.length, 0);
    expect(totalFindings, 'no findings at all across every snapshot — the invariants would be vacuous').toBeGreaterThan(0);
  }, 300_000);
});
