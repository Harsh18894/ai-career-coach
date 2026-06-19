# AI Career Coach | Tailored 3-Path Recommendations

A hosted, demo-ready web application built using **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**. It guides candidates through a sharp, conversational coaching session that surfaces professional goals and constraints, culminating in exactly 3 personalized, traceable career path recommendations.

---

## ⚡️ Key Features
- **PDF Resume Parser**: Local server-side PDF text extraction using `pdf-parse` (with size guards, corruption checks, and a fallback text-paste area for scanned/unreadable documents).
- **Personalized Opener**: The coach immediately cites a real transition, tenure pattern, or skill gap from the candidate's resume, bypassing generic greetings to establish mentor credibility.
- **Dynamic State Machine**: Controls the session flow through distinct phases:
  `UPLOAD → PARSING → OPENING → UNDERSTANDING → RECOMMENDING → (REGENERATING ↺) → CLOSED`
- **Background Signal Extraction**: Analytically extracts preferences (motivations, intent, constraints, rejections) after each user message without interrupting the chat stream, feeding them directly into the career recommendation engine.
- **Traceable Recommendations**: Proposes exactly 3 cards matching the profile and chat statements, including indicative salaries, concrete upskills, and first-month actions.
- **Refinement Loop**: Allows users to decline paths (with optional feedback, e.g. *"too sales-y"*) to trigger a fresh set of 3 different paths, capped at a maximum of 3 decks (9 paths total).
- **Tailored Session Closure**: Streams a customized wrap-up reflecting selected paths or identifying overall rejection patterns.

---

## 🛠️ Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **State**: React state and reducer with `localStorage` persistence.
- **LLM Integration**: OpenAI API (`gpt-4o` and `gpt-4o-mini` with JSON Mode)

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

---

## 📖 How to Demo (Step-by-Step Flow)

1. **Upload Resume**:
   - Drag and drop a standard PDF resume, or select a file.
   - *Alternative Test*: Try uploading a scanned image PDF. Watch it trigger the fallback textarea box, allowing you to paste resume text manually.
2. **Review the Hook**:
   - The mentor's first response is highly personalized. Verify it mentions a specific title transition, tenure duration, or skill cluster present only in your uploaded resume, framing a tension point.
3. **Engage in the Chat**:
   - Respond to the mentor's questions. Try testing edge cases:
     - *One-word answers* (e.g., *"Money"*): The coach will gently call it out and probe deeper.
     - *Contradiction*: State that you want startup ownership, then say you want to stay in your current corporate firm. The coach will directly call out the tension.
     - *Happy IC*: Say *"Nothing is missing, I love my job"*. The coach will pivot to what next-level growth looks like.
4. **View Recommendations**:
   - On the 3rd user message, the coach will transition to recommending paths.
   - Look at the 3 side-by-side cards. Confirm that the **Why this fits you** section explicitly cites a fact from your resume or statements from the chat.
5. **Refine / Regenerate**:
   - Click **Show me 3 different paths**. 
   - An optional feedback input will appear. Type a rejection reason (e.g. *"no coding"* or *"avoid sales"*).
   - Verify that the next set of 3 paths generates different roles and honors your constraint.
6. **Finalize the Session**:
   - Select a path and click **Lock in [Role Title]**, or click **Decline all paths**.
   - Watch the coach stream a custom closing message summarizing next moves (for selection) or noting your rejection pattern (for decline all), terminating the session.
7. **Inspect the Architecture**:
   - Click the **About the Logic** link in the header. Review the assumptions, steps taken, and the state-machine diagram written for non-technical reviewers.
