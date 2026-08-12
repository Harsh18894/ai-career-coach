import React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { TrajectoryHero, TrajectoryMark } from '@/components/trajectory/Trajectory';
import { PathExplorer } from '@/components/landing/PathExplorer';
import { RoadmapTimeline } from '@/components/landing/RoadmapTimeline';
import { HERO_DESTINATIONS, SAMPLE_PROFILE_SUMMARY } from '@/components/landing/SampleData';
import { LandingView } from '@/components/landing/LandingTracking';
import { CtaLink } from '@/components/landing/CtaLink';

/* =====================================================================================
 * The landing page. Personas and the concept rationale: docs/landing-design.md.
 *
 * Structure follows curiosity → demonstration → trust → action: show the artifact before
 * explaining it, explain only what the artifact does not already say, then get out of the way.
 *
 * IDENTITY: the trajectory carries it — a dot, branches, destinations, which is the product's
 * actual shape. The dog is gone from the landing page entirely; it survives in the waiting and
 * demo-limit states where warmth does real work. Personality, not mascot.
 *
 * Server component: the fold paints from HTML. Only the three interactive pieces — trajectory,
 * path cards, roadmap — are client islands.
 * ===================================================================================== */

export const metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
};

const PRIMARY_SAMPLE = 'backend-engineer';

function PrimaryCta({ label = 'See my career paths', className = '' }: { label?: string; className?: string }) {
  return (
    <CtaLink
      href={`/coach?sample=${PRIMARY_SAMPLE}`}
      event="sample_cta_click"
      className={`group inline-flex items-center justify-center gap-2 rounded-xl bg-hachi px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(17,17,17,0.08)] transition-all duration-150 hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(255,90,54,0.28)] focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${className}`}
    >
      {label}
      <span aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5">
        →
      </span>
    </CtaLink>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
      <TrajectoryMark className="h-3 w-11" />
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <>
      <LandingView />

      {/* ============================== HERO ============================== */}
      <section className="mx-auto max-w-[1280px] px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-16">
          <div>
            <Eyebrow>
              {BRAND.name} · {BRAND.tagline}
            </Eyebrow>

            <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[56px] lg:text-[64px]">
              Your career has more than one possible next move.
            </h1>

            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-muted sm:text-[19px]">
              Tell {BRAND.name} where you&rsquo;ve been. It&rsquo;ll show you three realistic
              directions — and what to do next.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <PrimaryCta />
              <CtaLink
                href="/coach"
                event="upload_cta_click"
                className="inline-flex items-center justify-center rounded-xl border border-ink/15 px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:border-ink/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Use my own résumé
              </CtaLink>
            </div>

            <p className="mt-4 text-[13px] text-ink-muted">
              No signup · Free ·{' '}
              <Link href="/privacy" className="underline decoration-border-soft underline-offset-2 hover:text-ink">
                Nothing stored permanently
              </Link>
            </p>
          </div>

          {/* The diagram demonstrates the product before a single click. */}
          <div className="lg:pl-4">
            <TrajectoryHero destinations={HERO_DESTINATIONS} />
          </div>
        </div>
      </section>

      {/* ====================== THE OUTPUT, IMMEDIATELY ====================== */}
      <section className="border-y border-border-soft bg-surface">
        <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <Eyebrow>The output</Eyebrow>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[44px]">
              It doesn&rsquo;t tell you what you are. It shows you where you could go.
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">
              Three paths from one background — real output from a sample run, not a mockup. Open
              any of them to see what it is pointing at.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-border-soft bg-paper p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-hachi">Sample profile</span>
              <span className="text-sm text-ink-muted">{SAMPLE_PROFILE_SUMMARY.headline}</span>
            </div>
            <PathExplorer />
          </div>
        </div>
      </section>

      {/* ============================ THE ROADMAP ============================ */}
      <section className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <Eyebrow>After you choose</Eyebrow>
          <h2 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[44px]">
            Pick a direction. {BRAND.name} turns it into a plan.
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">
            Twelve weeks, phased — skills, then a project, then proof, then applying. Open a
            milestone.
          </p>
        </div>

        <div className="mt-10">
          <RoadmapTimeline />
        </div>
      </section>

      {/* =========================== HOW IT WORKS =========================== */}
      <section className="border-y border-border-soft bg-surface">
        <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24">
          <Eyebrow>How it works</Eyebrow>
          <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {[
              {
                n: '01',
                title: 'Tell it where you are',
                body: 'A résumé, a paste, or a few questions if you have neither to hand.',
              },
              {
                n: '02',
                title: 'It finds the signal',
                body: 'Skills, scope, transitions — and it won’t recommend anything until it has something real.',
              },
              {
                n: '03',
                title: 'See what’s next',
                body: 'Three paths, then a week-by-week plan for the one you pick.',
              },
            ].map((step) => (
              <li key={step.n}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold tracking-widest text-hachi">{step.n}</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-border-soft" />
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===================== TRUST — NO ILLUSTRATION ===================== */}
      <section className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <Eyebrow>Why trust it</Eyebrow>
          <h2 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[44px]">
            Every recommendation has to point at something you&rsquo;ve actually done.
          </h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[
            {
              title: 'Evidence-based',
              body: 'Not “you seem analytical” — a company, a project, a number. If it can’t point at something specific, a test fails the build.',
            },
            {
              title: 'No invented numbers',
              body: 'It never turns “worked on billing” into “cut latency 40%”. Where a figure is missing it leaves a labelled blank for you to fill in.',
            },
            {
              title: 'It won’t guess',
              body: 'No recommendations until the conversation has produced a concrete skill and a real sense of direction. That gate is code, not a prompt.',
            },
            {
              title: 'Inspectable',
              body: 'The prompts, the gates and the eval suite that guards them are public. The reason to believe any of this is that you can go and read it.',
            },
          ].map((card) => (
            <article key={card.title} className="rounded-2xl border border-border-soft bg-surface p-6">
              <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-hachi" />
                {card.title}
              </h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">{card.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          <Link href="/about" className="font-semibold text-ink underline decoration-border-soft underline-offset-4 hover:decoration-hachi">
            See how it works →
          </Link>
          <a
            href="https://github.com/harshdeep-singh/hachi"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline decoration-border-soft underline-offset-4 hover:decoration-hachi"
          >
            Read the source →
          </a>
        </div>

        {/* Limits sit next to the trust cards on purpose: naming what it cannot do is part of
            the same argument, not a disclaimer buried further down. */}
        <div className="mt-12 border-t border-border-soft pt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">What it doesn&rsquo;t do</h3>
          <ul className="mt-4 grid gap-2.5 text-[15px] text-ink-muted sm:grid-cols-2">
            {[
              'Apply to jobs for you.',
              'Promise you’ll get any of these roles. Nobody can.',
              'Act as a recruiter — there are no jobs behind it.',
              'Replace talking to someone doing the work.',
            ].map((l) => (
              <li key={l} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-ink-muted" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ==================== PRIVACY — NO ILLUSTRATION ==================== */}
      <section className="border-y border-border-soft bg-surface">
        <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-16">
            <div>
              <Eyebrow>Privacy</Eyebrow>
              <h2 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[40px]">
                Your résumé stays yours.
              </h2>
              <Link
                href="/privacy"
                className="mt-5 inline-block text-[15px] font-semibold text-ink underline decoration-border-soft underline-offset-4 hover:decoration-hachi"
              >
                Read the full privacy details →
              </Link>
            </div>

            <dl className="grid gap-5 sm:grid-cols-3">
              {[
                { t: 'No account', d: 'You don’t need to create one, and there’s nothing to log in to.' },
                {
                  t: 'Temporary processing',
                  d: 'Résumé data is held only briefly, and only where the review genuinely needs it across two requests.',
                },
                { t: 'No résumé in logs', d: 'Personal résumé content is never written into application logs.' },
              ].map((item) => (
                <div key={item.t}>
                  <dt className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-hachi" />
                    {item.t}
                  </dt>
                  <dd className="mt-2 text-sm leading-relaxed text-ink-muted">{item.d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ============================ BUILT BY ============================ */}
      <section className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <Eyebrow>Built by Harsh</Eyebrow>
          <h2 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[40px]">
            Built because generic career advice says very little about the person asking.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-muted">
            I&rsquo;m Harsh. Most advice sounds reasonable and could have been written for anyone —
            so {BRAND.name} is built the other way round: it can&rsquo;t recommend anything it
            can&rsquo;t trace back to something you actually did.
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">
            It&rsquo;s named after the idea of a companion who sits beside you rather than assesses
            you. A side project, built in public, free, and it costs me a few cents each time
            someone uses it. If it&rsquo;s wrong about you, that&rsquo;s the most useful thing you
            could tell me.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            <a
              href="https://github.com/harshdeep-singh/hachi"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ink underline decoration-border-soft underline-offset-4 hover:decoration-hachi"
            >
              GitHub
            </a>
            <Link href="/about" className="font-semibold text-ink underline decoration-border-soft underline-offset-4 hover:decoration-hachi">
              About
            </Link>
          </div>
        </div>
      </section>

      {/* ============================ FINAL CTA ============================ */}
      <section className="border-t border-border-soft bg-ink">
        <div className="mx-auto max-w-[1280px] px-4 py-20 text-center sm:px-6 sm:py-28">
          <h2 className="mx-auto max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-paper sm:text-[48px]">
            See what your career could look like.
          </h2>
          <div className="mt-9 flex justify-center">
            <PrimaryCta label={`Try ${BRAND.name}`} />
          </div>
          <p className="mt-4 text-[13px] text-paper/55">
            Free · No signup · Start with a sample profile
          </p>
        </div>
      </section>
    </>
  );
}
