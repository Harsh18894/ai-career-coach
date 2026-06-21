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
Create a `.env.local` file in the root directory:
```env
# Required for LLM calls (server-side only)
OPENAI_API_KEY=your-openai-api-key-here
```

### 3. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. (Optional) Run the eval suite
```bash
npm run eval:cheap   # free, deterministic, snapshot-cached checks
npm run eval         # full live run against the OpenAI API (costs tokens)
```

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
8. **Inspect the Architecture**:
   - Click the **About the Logic** link in the header. Review the assumptions, the full step-by-step flow, and the conversation state-machine diagram written for non-technical reviewers.
