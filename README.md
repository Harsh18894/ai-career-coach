# Hachi — your career pal

Talk through where your career is going, and get three specific paths — each traceable to something real in your background — plus a week-by-week plan for the one you pick.

Built with **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**. Hachi guides candidates through a sharp, conversational coaching session that surfaces professional goals and constraints, culminating in exactly 3 personalized, traceable career path recommendations — and a concrete, week-by-week roadmap once you pick one.

---

## ⚡️ Key Features

- **Five ways to start**: pick a PDF (the picker opens straight from the CTA), export and upload your LinkedIn profile as a PDF, paste resume text, skip the resume entirely and build a profile through a short adaptive Q&A, or run the whole thing on one of three fictional sample profiles.
- **Adaptive, not scripted, intake**: both the no-resume guided questions and the understanding-phase chat are generated turn-by-turn from everything said so far — nothing already answered gets re-asked, and a student is never asked about "years of experience."
- **Personalized Opener**: Hachi's first message cites a real transition, tenure pattern, skill, or project from the candidate's resume/profile — never a generic greeting.
- **Explicit State Machine**: the session tracks one of seven stages at all times instead of inferring intent from raw chat text:
  `PROFILE_BUILDING → UNDERSTANDING → (ASK_COUNTRY) → RECOMMENDING → (ASK_PREFERENCES) → ROADMAP → CLOSED`
  (`ASK_COUNTRY` and `ASK_PREFERENCES` are conditional detours, not every session hits them.)
- **Hard recommendation gates**: Hachi will not generate paths until the conversation has yielded at least one concrete skill/domain *and* a genuine sense of direction (grow-in-place vs. switch, what they're optimizing for, or a real constraint) — both checked programmatically, never trusted from the model's self-assessment alone.
- **Market-aware recommendations**: if a resume spans multiple countries, Hachi asks once which market to target so salaries and role framing calibrate correctly.
- **Traceable Recommendations**: exactly 3 path cards per deck, each citing a specific fact or statement from the candidate, with an indicative market-calibrated salary range, concrete upskills, a first move for the month, and an honest "ambition check" (calling out targets that are too high or too low for the evidence).
- **Decline & Refine Loop**: declining a deck generates a fresh, non-overlapping deck (up to 3 decks, 9 paths total). After two declined decks, Hachi stops reshuffling blindly and asks directly what you'd change before generating a tailored final deck.
- **Execution Roadmaps**: locking in a path generates a phased (course/project/practice/application), week-by-week roadmap classified to your actual skill level for *that specific path* — and the session stays open afterward for follow-up chat or roadmap adjustments.
- **Tailored Session Closure**: streams a customized wrap-up reflecting the selected path, or honestly naming the pattern across rejected directions.
- **Eval harness**: an LLM-as-judge eval suite (`evals/`) with a free/cheap mode and a live/full mode, guarding the coach's behavior (scope discipline, opener grounding, path traceability, roadmap calibration, prompt-injection resistance, and more) against regressions.

---

## 🚪 Getting in: one page, no dead ends

The landing page and the product are the **same route**. There is no `/coach`. It never earned
its own URL — it was the same session the landing page was selling, one navigation away, and the
split meant anyone who started a session lost the page explaining what was about to happen.
`app/page.tsx` stays a server component and passes the server-rendered marketing sections into
`components/HomeExperience.tsx` as a prop, so the fold still arrives in the initial HTML and the
LCP budget survives; only the swap between "landing" and "session" is client-side.

**"Try Hachi" is a chooser, not a link.** Every CTA used to be a silent deep link that dropped
you into a running conversation with a stranger's resume already loaded. The dialog now answers
two questions before anything starts — what is about to happen, and *whose* resume it will use.

**The upload row is the upload.** Clicking it opens the OS file picker directly and the chosen
PDF goes straight into the conversation; there is no intermediate screen re-offering the thing
you just clicked. If this browser already holds your resume it skips the picker entirely and says
so. A sample resume is never offered back to you as "the resume you already gave me" — samples
share the same stash, so the session's sample flag is what separates them. The quiet
"No PDF? Answer a few questions instead" link opens the guided conversation immediately.

All four intake sources — picker, dropzone, pasted text, sample profile — run through one
pipeline in `lib/intake.ts`. It used to be hand-written per surface, and the copies had drifted:
only one of them recorded the funnel event, only one stashed the resume before generating the
opener. Because a `File` cannot travel in a URL, a PDF picked from another route rides a
take-once module holder (`lib/pending-intake.ts`) across the single client-side navigation.

---

## 📄 Resume review

A second surface, separate from the coaching conversation. Being coached toward a direction and
having a document marked up are different jobs; folding the second into the first would have
meant bending a seven-stage conversation around something that is not a conversation. You can
use either without the other.

Most of what is interesting about it is in the constraints, not the features.

**The bar moves with the candidate.** The same bullet is fine from a student and a failure from
someone eight years in, so the review works out roughly where the candidate is — `student`,
`early_career`, `mid_level`, `senior` — and judges everything at that bar. A harsher bar means
more things count as findings, never that the tone gets meaner. The persona is always shown with
the reasoning behind it and a one-click override that re-runs the review, because misclassifying
here is the worst thing the tool could do: telling an experienced engineer to go get an
internship would end the session and deserve to. Borderline calls say so and ask rather than
asserting. `career_switcher` is a separate flag rather than a fifth bucket — ten years in
marketing moving toward data means senior-level writing ability and entry-level domain evidence,
and both readings have to apply at once.

**It never invents a number.** Turning "worked on the billing service" into "drove a 40%
reduction in billing latency" reads better and is a lie the candidate has to defend in an
interview they then fail. Where a rewrite needs a figure that was not supplied, it emits a
labelled blank — `Reduced billing latency by [X%]` — for the candidate to fill in. This is not
trusted to the prompt: every rewrite is checked in code before it is returned, and any number
not present in the candidate's own words and not inside a blank causes the whole finding to be
discarded and logged. An eval enforces the same rule on real output at every build, and fails
the build if a fabrication is introduced deliberately.

**Links are chosen, not generated.** Student reviews suggest where to look for internships from
a hardcoded, region-filtered registry; the model picks by id and the URL is looked up in code, so
it never has a web address in its context to invent a variation of. This is a direct consequence
of the Phase 0 link baseline — a model asked for a URL will confidently produce one that has
never existed. A CI check (`npm run check:platform-links`) fails if any registry link dies.

**A good resume is allowed to come back quiet.** A tool that always finds ten problems is
decorative rather than thorough, so a strong resume returns few or zero critical findings and
says so plainly. Being strict about senior resumes means more things count *if they are wrong*,
not that something must be found.

**Two paths.** On its own merits, or against one specific job. The against-job path leads with
what a recruiter sees in ten to fifteen seconds, then walks the job's stated requirements as
covered / partly covered / not addressed — explicitly a surface match, never a verdict on whether
the candidate would get the job. Pasting a job description always works; fetching a URL often
will not, because the largest job sites block server-side access, so that failure drops straight
into the paste field rather than being retried. URL fetching is guarded against SSRF: https only,
every resolved address checked against private and cloud-metadata ranges, and re-checked after
each redirect.

The quality bar was written down before any of it was built — see
[docs/resume-review-rubric.md](docs/resume-review-rubric.md), which remains the source of truth
where it and the code disagree.

---

## 🔒 Staying online: limits, bots, and spend

This is a public, unauthenticated demo that spends real money per request, so anything a caller
controls the size of has a number written next to it.

- **`lib/limits.ts`** is the single place every ceiling lives — message length, resume and job
  description size, array bounds, JSON body bytes, upload bytes, and the per-session caps on
  model calls and tokens. It is dependency-free so the browser imports the same constants it is
  held to, which turns a limit into a character counter instead of a rejected request.
- **Rate limiting and a daily USD budget** (`lib/rate-limit.ts`, backed by Upstash Redis):
  5 new sessions/hour/IP, 60 model calls/hour/IP, and a global per-UTC-day spend ceiling. Past it,
  LLM-backed routes return a friendly "demo limit reached for today" rather than an error.
- **Invisible bot check** (Cloudflare Turnstile, `lib/bot-protection.ts`) on session-creation
  entry points only. Chat turns are deliberately not gated — a challenge between a person and
  their next sentence costs more than the abuse it prevents. Fails *closed* on a rejected token,
  *open* if Cloudflare is unreachable, degrading to the rate limiter and the budget.
- Per-session ceilings key off a client-supplied session id and are therefore trivially rotated.
  They stop a runaway client, a retry loop, or a tab left open overnight — **not** a determined
  evader. The per-IP limiters and the daily budget are what bound that case, and the code says so
  rather than implying otherwise.

Every one of these is optional in local development: absent the Upstash and Turnstile variables,
the corresponding layer is skipped after one startup warning, so `npm run dev` needs no external
accounts.

---

## 📊 Measurement, without a third-party pixel

The privacy page says, in two places, that there are no analytics trackers and no third-party
pixels. That sentence is worth more than a hosted dashboard, so the funnel is collected
first-party through the app's own endpoint instead (`lib/analytics.ts` → `/api/events`).

The trade is real and named in the source: no retention curves, no session replay, no UI. What
there is — one structured log line per step, in the same stream as the model calls, joined by the
same opaque session id, and read back with a script:

```bash
npm run funnel:report -- <logfile>     # drop-off by step, segmented by intake path
npm run latency:report -- <logfile>    # per-call-site percentiles + the two journey spans
```

Both also accept a piped stream (`vercel logs --json | npm run funnel:report`).

Every property is an enum, a bounded integer, or a referrer *hostname* with the path stripped —
which makes "did this come from Reddit" answerable without recording which thread. No resume
text, no message content, no field derived from a resume, ever.

`lib/journey.ts` marks the two spans a visitor actually feels — `intake_to_first_paths` and
`lock_to_roadmap` — measured in the browser rather than at the server, because the number that
matters is the one the person waits through. `latency:report` rolls those up alongside per-call-site
percentiles, and the timeout budgets are sized against them.

---

## 🗺️ Where things live

```
app/
  page.tsx                 server shell; renders the landing sections into HomeExperience
  about/ privacy/ review/  the three other surfaces
  api/                     coach, parse-resume, generate-opener, resume-review,
                           job-description, events, journey, review-feedback
components/
  HomeExperience.tsx       landing ⇄ session swap; owns intake state and errors
  StartHachi.tsx           the "Try Hachi" chooser dialog (file picker lives here)
  ResumeUpload.tsx         the intake screen: dropzone, paste box, sample picker
  ChatWindow.tsx           the conversation
  landing/ plan/ review/ shell/ trajectory/
lib/
  intake.ts                one parse-resume → generate-opener pipeline, all surfaces
  pending-intake.ts        carries a picked File across one client navigation
  ai/                      coach.ts, schemas, output-limits, resilience
  resume-review/           the second surface's pipeline, schemas, persona, registry
  limits.ts rate-limit.ts bot-protection.ts turnstile.ts   the ceilings
  analytics.ts journey.ts telemetry.ts                     the measurement
docs/
  resume-review-rubric.md  quality bar, written before the code; source of truth
  landing-design.md        the design process behind the landing page
evals/                     LLM-as-judge suite, snapshots, baselines — see evals/README.md
scripts/                   funnel-report, latency-report, check-platform-links
```

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router), React 19
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS v4, with the palette and spacing tokens declared via `@theme inline`
- **Validation**: Zod v4 schemas for every structured AI output (profile, paths, roadmap, review), using OpenAI's strict structured-output mode
- **State**: React `useState` with `localStorage` persistence (no backend database, no auth)
- **LLM Integration**: OpenAI API, with the model sized to the task —
  - `gpt-5-nano` for structured extraction/classification (resume parsing, persona classification, conversation signal tracking)
  - `gpt-5-mini` for generation the user reads directly (chat replies, path decks, roadmaps), streamed where read live
  - `max_completion_tokens` is sized per call site in `lib/ai/output-limits.ts`, because on this model family it bounds **reasoning plus visible output** — sizing it from the visible answer truncates everything
- **Testing**: Vitest, in two layers — component/unit tests (`components/**/*.test.tsx`, `lib/**/*.test.ts`) run with `npm test`, and the LLM-as-judge eval suite (`evals/`) with snapshot caching for cheap, deterministic CI runs

---

## 🚀 Setup & Installation

### 1. Clone & Install Dependencies
Navigate to the project folder and run:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and fill it in. Only the first is required:

```env
OPENAI_API_KEY=your-openai-api-key-here

# Optional. Without these, rate limiting and the daily spend cap are disabled and every
# request is allowed, after one warning at startup — fine locally, not for a public deploy.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DAILY_BUDGET_USD=5.00

# Optional. Invisible Cloudflare Turnstile on session-creation entry points. Absent, the
# check is skipped entirely, so local development needs no Cloudflare account.
# The site key is PUBLIC by design; the secret key must never be. Do not swap them.
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

Upstash also backs the short-lived store that lets a resume review span two requests; without
it the review re-parses the resume instead, which is slower but behaves identically.

`.env.example` is the authoritative list and explains each variable at length, including what
breaks when it is absent. Nothing outside it is read at runtime — that is deliberate, so
`grep process.env` and the example file can be checked against each other.

### 3. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

Security headers (CSP, HSTS, Referrer-Policy, Permissions-Policy, nosniff) are set in
`next.config.ts`. The CSP is deliberately a strong exfiltration control and a weak injection
one — `script-src` carries `'unsafe-inline'` because Next's App Router streams the RSC payload
through inline scripts, and the nonce-based alternative costs static rendering. The comment
above the policy says so, so nobody assumes otherwise.

`/privacy` is a plain-language note on what is sent to OpenAI, what is stored where and for how
long, and how to clear it. Every claim on it was checked against the code — including the two
that came out inconvenient: a parsed resume does sit in Redis for up to 30 minutes during a
review, and IP addresses are rate-limiting keys for an hour. Both are disclosed rather than
finessed. If that page and the code disagree, the page is the bug.

### 4. Tests and checks
```bash
npm test                      # free; component + unit tests (Vitest, jsdom)
npm run lint                  # free
npm run eval:cheap            # free, deterministic, snapshot-cached checks
npm run eval                  # full live run against the OpenAI API (costs tokens)
npm run eval:warm             # regenerates missing snapshots; needs OPENAI_API_KEY
npm run check:platform-links  # free; fails if a curated platform link has died
```

`eval:cheap` makes no API calls and still enforces the resume review's output invariants —
no fabricated numbers, verbatim grounding, placeholder correctness, registry integrity, persona
gating, requirement traceability — against committed snapshots. The behavioural evals
(classification accuracy, student branching, senior criticality, stability, restraint, refusal,
injection resistance) need live calls and are skipped there.

---

## 📖 How to Demo (Step-by-Step Flow)

1. **Get started** — click **Try Hachi** in the header or any CTA on the page. The chooser asks
   whose resume to use:
   - **Upload my resume** opens the file picker immediately. Pick a PDF and the conversation
     starts on the analysis screen — no intermediate page. Open the chooser a second time and
     the row now reads *"Use the resume you already gave me"* and skips the picker entirely.
   - **No PDF? Answer a few questions instead** goes straight into the guided Q&A.
   - **Or try it on a sample** runs the whole product on one of three fictional profiles, each
     named and described so "sample" is never mistaken for "yours".
   - Cancel the picker and nothing happens — the dialog is still there behind it.
   - *Edge cases*: a scanned-image PDF with no text layer is rejected with a clear error (there
     is no text to parse) and the paste box opens in place. Drop a non-PDF on the dropzone and it
     is refused locally, before a request is spent. Retry the exact same file after a failure —
     it works, which it did not before the input's value was reset between picks.
2. **Review the Hook**:
   - Hachi's first response is highly personalized. Verify it mentions a specific title transition, tenure duration, skill, or project present only in your profile, framing a genuine tension or opportunity.
3. **Engage in the Chat**:
   - Respond to Hachi's questions. Try testing edge cases:
     - *One-word answers* (e.g., *"Money"*): Hachi will gently call it out and probe deeper.
     - *Contradiction*: say you want startup ownership, then say you want to stay at your current corporate firm. Hachi will directly name the tension.
     - *Happy IC*: say *"Nothing is missing, I love my job"*. Hachi pivots to what next-level growth looks like.
     - *Deflection*: ask Hachi to "just write me a resume bullet" — it declines and re-asks its real question in plain terms instead of doing the task for you.
4. **Multi-country resumes**: if your resume references more than one country, Hachi asks once which market to target before recommending anything.
5. **View Recommendations**:
   - Once Hachi has a concrete skill/domain and a real sense of direction from you, it transitions to recommending paths.
   - Look at the 3 cards. Confirm the **fit rationale** explicitly cites a fact from your resume/profile or a statement from the chat, and check the ambition-check note on each.
6. **Refine / Regenerate**:
   - Click **Show me more paths** to decline a deck and get a fresh, non-overlapping set (up to 3 decks total).
   - After declining 2 decks, Hachi asks directly what you'd change before generating the final, tailored deck.
7. **Lock in a path**:
   - Click into a path and lock it in. Hachi streams a tailored closing reflection *and* generates a full execution roadmap in parallel.
   - Review the phased, week-by-week roadmap. Keep chatting or request roadmap adjustments — the session stays open.
   - Alternatively, click **Decline all paths** to end the session with an honest closing instead.
8. **Try the resume review** (a separate surface — **Resume review** in the header, the link in
   the chooser, or the link under the upload box):
   - Pick a sample profile again if you would rather not upload anything; if you already
     supplied a resume to the coach, it carries over.
   - Check the detected experience level at the top, and the reasoning behind it. Override it to
     `Student` and watch the whole review re-run at a different bar — project suggestions and
     internship platforms appear, and the tone of what counts as serious changes.
   - Look for a rewrite containing a blank like `[X%]`. That is the tool refusing to invent a
     number; the note beside it explains why. Copy a rewrite with the button on it.
   - Try the **student, no projects or internships** case by pasting a short student resume with
     only coursework: project suggestions and internship platforms move above the formatting
     notes, because at that stage they matter more.
   - Switch to **Review against a job** and paste a job description. It leads with what a
     recruiter sees in fifteen seconds, then walks the requirements one by one. Try a Greenhouse,
     Lever or Ashby link too; a LinkedIn link will fail on purpose, straight into the paste box.
9. **Inspect the Architecture**:
   - Click the **About the Logic** link in the header. Review the assumptions, the full step-by-step flow, the conversation state-machine diagram, and the section on how the resume review decides what to hold you to — all written for non-technical reviewers.
