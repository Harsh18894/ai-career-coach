import React from 'react';
import Link from 'next/link';
import { BackLink } from '@/components/shell/BackLink';
import { Clock, Database, Eye, HardDrive, Send, Trash2 } from 'lucide-react';

export const metadata = {
  title: 'What happens to your resume | Hachi',
  description:
    'Plainly: what is sent to OpenAI, what is stored and for how long, what stays in your browser, and how to clear it.',
};

/* =====================================================================================
 * Every claim on this page was checked against the code, not written from memory of how the
 * app is supposed to work. Two of them came out differently than the first draft assumed:
 *
 *   - "nothing is stored server-side" is FALSE. The resume review holds a parsed resume in
 *     Redis for up to 30 minutes so the pipeline can span two requests.
 *   - IP addresses are used as rate-limit keys, so they exist server-side for an hour.
 *
 * Both are disclosed below. If this page and the code ever disagree, the code is right and
 * this page is a bug — the specific files are named throughout so that is checkable.
 * ===================================================================================== */

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border-soft bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-hachi/8">
          <Icon className="h-4 w-4 text-hachi" />
        </span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

function Row({ what, where, howLong }: { what: string; where: string; howLong: string }) {
  return (
    <tr className="border-b border-border-soft/60 last:border-0">
      <td className="py-2.5 pr-4 align-top text-ink">{what}</td>
      <td className="py-2.5 pr-4 align-top text-ink-muted">{where}</td>
      <td className="py-2.5 align-top whitespace-nowrap text-ink-muted">{howLong}</td>
    </tr>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <BackLink />

      <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink">
        What happens to your resume
      </h1>
      <p className="mt-3 text-base leading-relaxed text-ink-muted">
        Hachi is a personal portfolio project, not a company. There are no accounts, no
        third-party trackers, no advertising, and nothing is ever sold or shared. This page is the specific
        version of that, because &ldquo;we take your privacy seriously&rdquo; tells you nothing.
      </p>

      <div className="mt-8 space-y-4">
        <Section icon={Send} title="What is sent to OpenAI">
          <p>
            Your resume text, the messages you write in the chat, and any job description you
            paste are sent to the OpenAI API to generate what you see. That is the whole product
            — there is no version of this that works without it.
          </p>
          <p>
            The models are <code className="rounded bg-paper px-1 py-0.5 text-xs">gpt-5-nano</code>{' '}
            for extraction and classification and{' '}
            <code className="rounded bg-paper px-1 py-0.5 text-xs">gpt-5-mini</code> for the
            text you read. Under OpenAI&rsquo;s API terms, data sent through the API is not used
            to train their models, and they retain it for a limited period for abuse monitoring.
            Their policy governs that, not this project —{' '}
            <a
              href="https://openai.com/policies/api-data-usage-policies"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-hachi underline underline-offset-2 hover:text-hachi"
            >
              read it here
            </a>
            .
          </p>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
            The practical advice: this is a demo on the public internet. If part of your resume
            is genuinely sensitive, edit it out before pasting. Nothing here needs your full
            address or date of birth to be useful.
          </p>
        </Section>

        <Section icon={Database} title="What is stored on the server">
          <p>
            There is no database and no user accounts. An uploaded PDF is parsed in memory and
            never written to disk. But &ldquo;nothing is stored&rdquo; would not be true, so
            here is everything that is:
          </p>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs font-semibold uppercase tracking-wide text-ink-muted/70">
                  <th className="pb-2 pr-4 font-semibold">What</th>
                  <th className="pb-2 pr-4 font-semibold">Where</th>
                  <th className="pb-2 font-semibold">How long</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  what="Your parsed resume, during a resume review only"
                  where="Upstash Redis"
                  howLong="30 minutes"
                />
                <Row
                  what="Counters: how many calls and tokens a session used"
                  where="Upstash Redis"
                  howLong="24 hours"
                />
                <Row
                  what="Your IP address, as a rate-limiting key"
                  where="Upstash Redis"
                  howLong="1 hour"
                />
                <Row
                  what="Logs: timings, token counts, cost, a random session id"
                  where="Vercel logs"
                  howLong="Vercel's retention"
                />
              </tbody>
            </table>
          </div>
          <p>
            The first row is the one worth explaining. A review runs as two requests — one to
            read and classify the resume, one to review it — so the parsed copy is held between
            them and expires on its own. It is kept on the server rather than passed through
            your browser on purpose: the check that stops the review inventing achievements
            compares every suggestion against the original text, and that check is worthless if
            the original could be edited in transit.
          </p>
          <p>
            <strong className="font-semibold text-ink">No log line contains your resume,
            your name, your email, or your phone number.</strong> Where a log needs to refer to a
            piece of text, it records a length and a fingerprint instead of the words.
          </p>
        </Section>

        <Section icon={HardDrive} title="What stays in your browser">
          <p>Your session lives on your own device, not on a server:</p>
          <ul className="ml-1 space-y-2">
            <li className="flex gap-2">
              <code className="mt-0.5 h-fit rounded bg-paper px-1.5 py-0.5 text-xs text-ink">
                localStorage
              </code>
              <span>
                Your conversation and the profile built from your resume, so a refresh does not
                lose it. Plus a random session id used to group cost telemetry — it identifies a
                session, not a person.
              </span>
            </li>
            <li className="flex gap-2">
              <code className="mt-0.5 h-fit rounded bg-paper px-1.5 py-0.5 text-xs text-ink">
                sessionStorage
              </code>
              <span>
                Your resume text, so moving from the coach to the resume review does not ask you
                to upload it twice. This one is cleared automatically when you close the tab.
              </span>
            </li>
          </ul>
          <p>There are no cookies, and nothing is shared with any third party from here.</p>
        </Section>

        <Section icon={Trash2} title="How to clear it">
          <ul className="ml-1 list-disc space-y-1.5 pl-4">
            <li>
              <strong className="font-semibold text-ink">Start over</strong> in the chat
              header wipes the conversation, the profile, and the stored resume text immediately.
            </li>
            <li>Closing the tab clears the stored resume text on its own.</li>
            <li>
              Clearing site data for this domain in your browser settings removes everything
              listed above.
            </li>
            <li>
              The server-side copy held during a review expires by itself within 30 minutes.
              There is no button for this because there is nothing to press — it is on a timer,
              not a shelf.
            </li>
          </ul>
        </Section>

        <Section icon={Eye} title="Third parties">
          <p>
            Three, and no others: <strong className="font-semibold text-ink">OpenAI</strong>{' '}
            for the models, <strong className="font-semibold text-ink">Vercel</strong> for
            hosting, and <strong className="font-semibold text-ink">Upstash</strong> for the
            short-lived storage above.
          </p>
          <p>
            Two invisible bot checks run on top of those, and neither asks you to do anything.{' '}
            <strong className="font-semibold text-ink">Vercel BotId</strong> checks any request
            that would cost money to answer — uploading a resume, each reply in the conversation,
            running a review. It is part of the hosting, so nothing new is contacted: your browser
            talks only to this site, and the check happens between this site and Vercel. If it is
            also switched on,{' '}
            <strong className="font-semibold text-ink">Cloudflare Turnstile</strong> runs a second
            check when you start a session. Both look at how the request was made — headers,
            timing, whether there is a real browser here — never at what is in it. Neither one
            sees your resume.
          </p>
          <p>
            No third-party analytics, no tag managers, no advertising pixels, no social embeds.
            Nothing on this site talks to anyone except the services above.
          </p>
          <p>
            There is one first-party counter: which step of the flow you reached — landed,
            started, saw recommendations — plus which site linked you here, recorded as a
            hostname only. It exists so I can tell whether people are getting stuck, and it goes
            to this app&rsquo;s own logs, not to anybody else. It never records anything you
            typed, and the field list is fixed in code so it cannot quietly grow.
          </p>
        </Section>

        <Section icon={Clock} title="If this page is wrong">
          <p>
            It is meant to describe the code, so a mismatch is a bug worth reporting rather than
            fine print. The relevant files are{' '}
            <code className="rounded bg-paper px-1 py-0.5 text-xs">lib/resume-review/prepared-cache.ts</code>{' '}
            for the 30-minute copy,{' '}
            <code className="rounded bg-paper px-1 py-0.5 text-xs">lib/rate-limit.ts</code> for
            the IP counters, and{' '}
            <code className="rounded bg-paper px-1 py-0.5 text-xs">lib/redact.ts</code> for
            what logs are allowed to contain.
          </p>
        </Section>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link
          href="/about"
          className="font-medium text-hachi underline underline-offset-2 hover:text-hachi"
        >
          How the coaching actually works
        </Link>
        <Link
          href="/"
          className="font-medium text-hachi underline underline-offset-2 hover:text-hachi"
        >
          Back to the app
        </Link>
      </div>
    </div>
  );
}
