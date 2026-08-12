'use client';

import React from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import type { ReviewResult, Severity } from '@/lib/resume-review/schemas';
import { SEVERITY_ORDER } from '@/lib/resume-review/rubric';
import { FindingCard } from './FindingCard';
import { PlaceholderNote } from './ReviewPrimitives';
import {
  EvidenceGuidanceSection,
  NarrativeAssessmentSection,
  RecruiterScanSection,
  RequirementCoverageSection,
} from './ReviewSections';

/* =====================================================================================
 * Assembles a review.
 *
 * Ordering is the design decision here, not decoration. Whatever matters most at this persona
 * and path goes first, and the line-level findings — which are the least important output for
 * a student with no projects, or a senior whose career has no visible arc — come last.
 * ===================================================================================== */

export type FindingGroup = { id: string; label: string; bulletIds: string[] };

type Group = { key: string; label: string; findings: ReviewResult['findings'] };

/** Groups findings by the role their bullet belongs to, so a candidate reads them in the same
 * order they would edit the document. Section-level findings collect into their own group. */
function groupFindings(result: ReviewResult, groupIndex: FindingGroup[]): Group[] {
  const bulletToRole = new Map<string, { id: string; label: string; order: number }>();

  groupIndex.forEach((group, index) => {
    for (const bulletId of group.bulletIds) {
      bulletToRole.set(bulletId, { id: group.id, label: group.label, order: index });
    }
  });

  const groups = new Map<string, Group & { order: number }>();

  for (const finding of result.findings) {
    const role = finding.targetBulletId ? bulletToRole.get(finding.targetBulletId) : undefined;
    const key = role?.id ?? `section:${finding.targetSection ?? 'general'}`;
    const label = role?.label ?? finding.targetSection ?? 'Overall';
    // Structural findings sort above roles: they are usually about the document as a whole.
    const order = role?.order ?? -1;

    const existing = groups.get(key);
    if (existing) existing.findings.push(finding);
    else groups.set(key, { key, label, order, findings: [finding] });
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ key, label, findings }) => ({
      key,
      label,
      findings: [...findings].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      ),
    }));
}

function countBySeverity(findings: ReviewResult['findings']): Record<Severity, number> {
  return findings.reduce(
    (counts, finding) => ({ ...counts, [finding.severity]: counts[finding.severity] + 1 }),
    { critical: 0, improvement: 0, polish: 0 } as Record<Severity, number>
  );
}

export function ReviewResults({
  result,
  groupIndex,
  onVote,
}: {
  result: ReviewResult;
  groupIndex: FindingGroup[];
  onVote: (findingId: string, verdict: 'up' | 'down') => void;
}) {
  const groups = groupFindings(result, groupIndex);
  const counts = countBySeverity(result.findings);
  const hasPlaceholders = result.findings.some((finding) => finding.addedPlaceholders.length > 0);
  const noCritical = counts.critical === 0;

  return (
    <div className="space-y-5">
      {/* Headline read */}
      <section className="rounded-2xl border border-border-soft bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">The honest read</h2>
        <p className="mt-2 leading-relaxed text-ink">{result.overallRead}</p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-rose-800">
            {counts.critical} critical
          </span>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-amber-900">
            {counts.improvement} improvement
          </span>
          <span className="rounded-full border border-border-soft bg-paper px-2.5 py-0.5 text-ink">
            {counts.polish} polish
          </span>
        </div>

        {/* The strong-resume state: said plainly and positively, with nothing padded to fill
            the space. Rubric §5 — manufacturing criticism to look useful is a failure. */}
        {noCritical && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm leading-relaxed text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Nothing here is likely to cost you an interview at this level. That is a genuine result,
              not an empty list — anything below is worth doing, but none of it is urgent.
            </span>
          </p>
        )}
      </section>

      {/* Path- and persona-specific sections, ahead of line edits by design. */}
      {result.recruiterScan && <RecruiterScanSection scan={result.recruiterScan} />}
      {result.requirementCoverage && result.requirementCoverage.length > 0 && (
        <RequirementCoverageSection coverage={result.requirementCoverage} />
      )}
      <EvidenceGuidanceSection
        projectSuggestions={result.projectSuggestions}
        internshipGuidance={result.internshipGuidance}
        platforms={result.resolvedPlatforms}
      />
      {result.narrativeAssessment && <NarrativeAssessmentSection narrative={result.narrativeAssessment} />}

      {/* Line-level findings */}
      {result.findings.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-ink-muted" />
            <h2 className="text-base font-bold text-ink">Line-by-line</h2>
          </div>

          {hasPlaceholders && <PlaceholderNote />}

          {groups.map((group) => (
            <div key={group.key} className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">{group.label}</h3>
              {group.findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  onVote={(verdict) => onVote(finding.id, verdict)}
                />
              ))}
            </div>
          ))}
        </section>
      )}

      {result.dimensionNotes.length > 0 && (
        <details className="rounded-2xl border border-border-soft bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            What was checked
          </summary>
          <dl className="mt-3 space-y-2">
            {result.dimensionNotes.map((note) => (
              <div key={note.dimension}>
                <dt className="text-xs font-semibold text-ink-muted">{note.dimension.replace(/_/g, ' ')}</dt>
                <dd className="text-sm leading-relaxed text-ink">{note.note}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
