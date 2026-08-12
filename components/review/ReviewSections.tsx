'use client';

import React from 'react';
import { Compass, ExternalLink, Lightbulb, Route, Search, Sparkles } from 'lucide-react';
import type {
  InternshipGuidance,
  NarrativeAssessment,
  ProjectSuggestion,
  RecruiterScan,
  RequirementCoverage,
  ResolvedPlatform,
} from '@/lib/resume-review/schemas';
import { CoverageChip } from './ReviewPrimitives';

/* =====================================================================================
 * The sections that sit ABOVE the line-level findings, because at their respective personas
 * and paths they are the more important output.
 * ===================================================================================== */

function SectionShell({
  icon: Icon,
  title,
  subtitle,
  accent = 'indigo',
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  accent?: 'indigo' | 'emerald' | 'violet';
  children: React.ReactNode;
}) {
  const accents = {
    indigo: 'border-hachi/30 bg-hachi/5',
    emerald: 'border-emerald-200 bg-emerald-50/40',
    violet: 'border-hachi/30 bg-hachi/5',
  } as const;

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${accents[accent]}`}>
      <header className="mb-3 flex items-start gap-2.5">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
        <div>
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/* ---- student / early-career evidence ---------------------------------------------------- */

export function EvidenceGuidanceSection({
  projectSuggestions,
  internshipGuidance,
  platforms,
}: {
  projectSuggestions?: ProjectSuggestion[] | null;
  internshipGuidance?: InternshipGuidance | null;
  platforms?: ResolvedPlatform[] | null;
}) {
  if (!projectSuggestions?.length && !internshipGuidance) return null;

  return (
    <SectionShell
      icon={Sparkles}
      accent="emerald"
      title="Start here: build evidence"
      subtitle="At this stage, projects and internships move the needle far more than any wording change below."
    >
      {projectSuggestions && projectSuggestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">Projects worth building</h3>
          {projectSuggestions.map((project, index) => (
            <div key={index} className="rounded-xl border border-border-soft bg-white p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-semibold text-ink">{project.title}</h4>
                <span className="text-xs font-medium text-ink-muted">{project.estimatedEffort}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{project.scope}</p>
              <dl className="mt-2.5 space-y-1 text-xs text-ink-muted">
                <div className="flex gap-1.5">
                  <dt className="font-semibold">Shows:</dt>
                  <dd>{project.skillDemonstrated}</dd>
                </div>
                <div className="flex gap-1.5">
                  {/* Grounding is shown, not just enforced — it is how the candidate can tell
                      this was written for their resume rather than pasted from a list. */}
                  <dt className="font-semibold">Suggested because:</dt>
                  <dd className="italic">{project.groundedIn}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      {internshipGuidance && (
        <div className={projectSuggestions?.length ? 'mt-5' : ''}>
          <h3 className="text-sm font-semibold text-ink">Finding an internship</h3>
          {internshipGuidance.leverageExisting && (
            <p className="mt-1.5 text-sm leading-relaxed text-ink">{internshipGuidance.leverageExisting}</p>
          )}
          {internshipGuidance.approach.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {internshipGuidance.approach.map((step, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {step}
                </li>
              ))}
            </ul>
          )}

          {platforms && platforms.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Where to look</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {platforms.map((platform) => (
                  <a
                    key={platform.id}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-xl border border-border-soft bg-white p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      {platform.name}
                      <ExternalLink className="h-3 w-3 text-ink-muted/70 group-hover:text-emerald-600" />
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{platform.notes}</span>
                  </a>
                ))}
              </div>
              {/* Attribution is the point: these are the only URLs in the product, and they are
                  hand-checked rather than model-generated. */}
              <p className="mt-2 text-xs text-ink-muted">
                These come from a small hand-checked list kept in this app, filtered to your region — not
                generated by the model, so they cannot be made up.
              </p>
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

/* ---- senior narrative -------------------------------------------------------------------- */

export function NarrativeAssessmentSection({ narrative }: { narrative: NarrativeAssessment }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Progression', value: narrative.progression },
    { label: 'Scope growth', value: narrative.scopeGrowth },
    { label: 'Where the space goes', value: narrative.spaceAllocation },
    { label: 'Influence beyond delivery', value: narrative.influenceBeyondDelivery },
  ];

  return (
    <SectionShell
      icon={Route}
      accent="violet"
      title="The story your resume tells"
      subtitle="At this level this matters more than any single bullet. A tidy resume is not automatically a good senior resume."
    >
      <p className="rounded-xl border border-border-soft bg-white p-3.5 text-sm leading-relaxed font-medium text-ink">
        {narrative.overall}
      </p>
      <dl className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-border-soft bg-white p-3">
            <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{row.label}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </SectionShell>
  );
}

/* ---- against-job ------------------------------------------------------------------------- */

export function RecruiterScanSection({ scan }: { scan: RecruiterScan }) {
  return (
    <SectionShell
      icon={Search}
      title="The 10–15 second scan"
      subtitle="What a recruiter sees before deciding whether to keep reading."
    >
      <p className="rounded-xl border border-border-soft bg-white p-3.5 text-sm leading-relaxed font-medium text-ink">
        {scan.fifteenSecondVerdict}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border-soft bg-white p-3">
          <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Lands first</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink">{scan.whatLandsFirst}</p>
        </div>
        <div className="rounded-xl border border-border-soft bg-white p-3">
          <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Missing up top</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink">{scan.whatIsMissingUpTop}</p>
        </div>
      </div>

      {(scan.worksWell.length > 0 || scan.worksAgainst.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {scan.worksWell.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Works for you</h3>
              <ul className="mt-1.5 space-y-1">
                {scan.worksWell.map((item, index) => (
                  <li key={index} className="flex gap-2 text-sm leading-relaxed text-ink">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {scan.worksAgainst.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-rose-700 uppercase">Works against you</h3>
              <ul className="mt-1.5 space-y-1">
                {scan.worksAgainst.map((item, index) => (
                  <li key={index} className="flex gap-2 text-sm leading-relaxed text-ink">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

export function RequirementCoverageSection({ coverage }: { coverage: RequirementCoverage[] }) {
  if (coverage.length === 0) return null;

  return (
    <SectionShell
      icon={Compass}
      title="What the job asks for"
      subtitle="Whether your resume already shows each requirement — a surface match, not a judgement of whether you would get the job."
    >
      <ul className="space-y-2.5">
        {coverage.map((item, index) => (
          <li key={index} className="rounded-xl border border-border-soft bg-white p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{item.requirement}</p>
              <CoverageChip status={item.status} />
            </div>
            {item.evidenceInResume && (
              <p className="mt-2 border-l-2 border-border-soft pl-2.5 text-sm text-ink-muted italic">
                &ldquo;{item.evidenceInResume}&rdquo;
              </p>
            )}
            <p className="mt-2 flex gap-1.5 text-sm leading-relaxed text-ink">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              {item.howToAddress}
            </p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
