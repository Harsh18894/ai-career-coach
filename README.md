# Aria | AI Career Coach

A hosted, demo-ready web application built using **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**. Aria guides candidates through a sharp, conversational coaching session that surfaces professional goals and constraints, culminating in exactly 3 personalized, traceable career path recommendations — and a concrete, week-by-week roadmap once you pick one.

---

## ⚡️ Key Features

- **Four ways to start**: upload a resume PDF, export and upload your LinkedIn profile as a PDF, paste resume text directly, or skip the resume entirely and build a profile through a short adaptive Q&A.
- **Adaptive, not scripted, intake**: both the no-resume guided questions and the understanding-phase chat are generated turn-by-turn from everything said so far — nothing already answered gets re-asked, and a student is never asked about "years of experience."
- **Personalized Opener**: Aria's first message cites a real transition, tenure pattern, skill, or project from the candidate's resume/profile — never a generic greeting.
- **Explicit State Machine**: the session tracks one of seven stages at all times instead of inferring intent from raw chat text:
  `PROFILE_BUILDING → UNDERSTANDING → (ASK_COUNTRY) → RECOMMENDING → (ASK_PREFERENCES) → ROADMAP → CLOSED`
  (`ASK_COUNTRY` and `ASK_PREFERENCES` are conditional detours, not every session hits them.)
- **Hard recommendation gates**: Aria will not generate paths until the conversation has yielded at least one concrete skill/domain *and* a genuine sense of direction (grow-in-place vs. switch, what they're optimizing for, or a real constraint) — both checked programmatically, never trusted from the model's self-assessment alone.
- **Market-aware recommendations**: if a resume spans multiple countries, Aria asks once which market to target so salaries and role framing calibrate correctly.
- **Traceable Recommendations**: exactly 3 path cards per deck, each citing a specific fact or statement from the candidate, with an indicative market-calibrated salary range, concrete upskills, a first move for the month, and an honest "ambition check" (calling out targets that are too high or too low for the evidence).
- **Decline & Refine Loop**: declining a deck generates a fresh, non-overlapping deck (up to 3 decks, 9 paths total). After two declined decks, Aria stops reshuffling blindly and asks directly what you'd change before generating a tailored final deck.
- **Execution Roadmaps**: locking in a path generates a phased (course/project/practice/application), week-by-week roadmap classified to your actual skill level for *that specific path* — and the session stays open afterward for follow-up chat or roadmap adjustments.
- **Tailored Session Closure**: streams a customized wrap-up reflecting the selected path, or honestly naming the pattern across rejected directions.
- **Eval harness**: an LLM-as-judge eval suite (`evals/`) with a free/cheap mode and a live/full mode, guarding the coach's behavior (scope discipline, opener grounding, path traceability, roadmap calibration, prompt-injection resistance, and more) against regressions.

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

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router), React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Validation**: Zod schemas for every structured AI output (profile, paths, roadmap)
- **State**: React `useState` with `localStorage` persistence (no backend database, no auth)
- **LLM Integration**: OpenAI API, with the model sized to the task —
  - `gpt-5-nano` for structured extraction/classification (resume parsing, conversation signal tracking)
  - `gpt-5-mini` for generation the user reads directly (chat replies, path decks, roadmaps), streamed where read live
- **Testing**: Vitest-based eval suite with snapshot caching for cheap, deterministic CI runs

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
```

Upstash also backs the short-lived store that lets a resume review span two requests; without
it the review re-parses the resume instead, which is slower but behaves identically.

### 3. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. (Optional) Run the eval suite
```bash
npm run eval:cheap            # free, deterministic, snapshot-cached checks
npm run eval                  # full live run against the OpenAI API (costs tokens)
npm run check:platform-links  # free; fails if a curated platform link has died
```

`eval:cheap` makes no API calls and still enforces the resume review's output invariants —
no fabricated numbers, verbatim grounding, placeholder correctness, registry integrity, persona
gating, requirement traceability — against committed snapshots. The behavioural evals
(classification accuracy, student branching, senior criticality, stability, restraint, refusal,
injection resistance) need live calls and are skipped there.

---

## 📖 How to Demo (Step-by-Step Flow)

1. **Get started**:
   - Drag and drop a standard PDF resume, or select a file.
   - *No resume?* Click **Build your profile in chat instead** for a short adaptive Q&A, or **Or share your LinkedIn profile** for instructions on exporting your LinkedIn profile as a PDF first.
   - *Edge case*: upload a scanned-image PDF with no text layer — it's rejected with a clear error, since there's no text to parse.
2. **Review the Hook**:
   - Aria's first response is highly personalized. Verify it mentions a specific title transition, tenure duration, skill, or project present only in your profile, framing a genuine tension or opportunity.
3. **Engage in the Chat**:
   - Respond to Aria's questions. Try testing edge cases:
     - *One-word answers* (e.g., *"Money"*): Aria will gently call it out and probe deeper.
     - *Contradiction*: say you want startup ownership, then say you want to stay at your current corporate firm. Aria will directly name the tension.
     - *Happy IC*: say *"Nothing is missing, I love my job"*. Aria pivots to what next-level growth looks like.
     - *Deflection*: ask Aria to "just write me a resume bullet" — it declines and re-asks its real question in plain terms instead of doing the task for you.
4. **Multi-country resumes**: if your resume references more than one country, Aria asks once which market to target before recommending anything.
5. **View Recommendations**:
   - Once Aria has a concrete skill/domain and a real sense of direction from you, it transitions to recommending paths.
   - Look at the 3 cards. Confirm the **fit rationale** explicitly cites a fact from your resume/profile or a statement from the chat, and check the ambition-check note on each.
6. **Refine / Regenerate**:
   - Click **Show me more paths** to decline a deck and get a fresh, non-overlapping set (up to 3 decks total).
   - After declining 2 decks, Aria asks directly what you'd change before generating the final, tailored deck.
7. **Lock in a path**:
   - Click into a path and lock it in. Aria streams a tailored closing reflection *and* generates a full execution roadmap in parallel.
   - Review the phased, week-by-week roadmap. Keep chatting or request roadmap adjustments — the session stays open.
   - Alternatively, click **Decline all paths** to end the session with an honest closing instead.
8. **Try the resume review** (a separate surface — **Resume review** in the header, or the link
   under the upload box):
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
