# Resume review rubric

This document is the quality bar for resume review, written before any review code exists. It
is the thing implementation gets checked against — if the code and this document disagree, this
document is right and the code has a bug, not the other way around, until this document is
deliberately revised.

Resume review is a **separate surface** from the coaching session (`lib/ai/coach.ts`, the
`ConversationState` machine). It does not touch, gate on, or feed into path recommendations or
roadmaps. It has its own persona system, defined below, which is intentionally **not** the
coaching app's `ExperienceBand` (`fresh`/`early`/`building`/`experienced`/`senior`, keyed off
`deriveExperienceBand` in `lib/ai/coach.ts`) or `Profile['inferredPersona']`
(`pivot`/`grow`/`early_career`/`unknown`). Those exist to shape a *conversation*. This exists to
judge a *document* against a bar appropriate to the person who wrote it. The two systems share
some vocabulary (`early_career` appears in both) by coincidence of describing the same world,
not because one is derived from the other — do not attempt to unify them.

A note on terminology before anything else: the task brief specified three tiers (student /
mid-level / 6+ years). This document uses **four** — `student`, `early_career`, `mid_level`,
`senior` — because someone eighteen months into their first full-time job is neither a college
student nor a mid-level candidate, and forcing them into either bucket produces advice that is
actively wrong (a `student` bar would tell them to add a Projects section they've outgrown; a
`mid_level` bar would flag their still-thin scope as a critical failure it isn't yet). This is
flagged as a decision for review, not asserted quietly.

---

## 1. The severity scale

Three levels, defined by **consequence at this persona's bar**, not by how the finding feels to
write or read.

| Severity | Definition | Signal to the candidate |
|---|---|---|
| `critical` | Likely to cost this candidate an interview, at their persona's bar, if unaddressed. | Fix this before you send this resume anywhere. |
| `improvement` | A meaningful lift — makes a stronger case, but its absence alone is unlikely to be the reason a resume gets rejected. | Worth doing before your next application round. |
| `polish` | Marginal — correct without it, better with it. | Fix it if you have five more minutes. |

Severity is not a proxy for how much the reviewer minds something. A comma splice is `polish`
for every persona. A missing Education section is `critical` for `student` and does not exist
as a checkable dimension for `senior` (see §3, dimension 1). The scale answers one question only:
*what does leaving this alone cost the candidate, given who they are and what stage they're at.*

---

## 2. The eight dimensions

Each dimension states what it measures, why it matters, one good and one bad example, and how
it's assessed — **deterministic** (computed in code from the segmented resume, no model
judgement, no variance between runs) or **model-judged** (requires understanding meaning, not
just counting or pattern-matching). Several dimensions are a deterministic *pre-pass* feeding a
model-judged decision; that split is called out explicitly, because it is what makes evals 1–6
(Task 7) possible to run with zero API calls in `eval:cheap`.

### 2.1 Section completeness

**What it measures.** Whether the sections a reader expects at this persona's stage are present.
**Why it matters.** A missing section isn't neutral — a recruiter reads absence as "this
candidate has nothing to put there," even when that's false. A student with real project work
who simply forgot a Projects heading loses that evidence entirely to a scanning reader.
**Assessment.** Deterministic. Section presence/absence is read directly off the segmented
`ResumeSegment` output (Task 4) — no model judgement needed once segmentation has happened.
**Good:** a student resume with Education (with graduation date), Projects, Technical Skills,
Experience-or-Internships, and a reachable Contact block.
**Bad:** a student resume with no Education section at all — a reader cannot tell if this
person has a degree, is enrolled, or dropped out, and won't ask; they'll assume the worst and
move to the next resume.

### 2.2 Quantified-impact density

**What it measures.** The proportion of bullets that state an *outcome* (what changed, and by
how much) versus a *duty* (what the person was assigned to do).
**Why it matters.** "Responsible for the checkout flow" is unfalsifiable and forgettable. "Cut
checkout abandonment 18% by simplifying the payment step" tells a reader what actually happened
and lets them picture the candidate's judgement, not just their job description.
**Assessment.** Hybrid. A deterministic pre-pass counts bullets containing a number, percentage,
or magnitude word per role — cheap, exact, gives a coarse ratio. Whether a *number's presence*
actually reflects outcome-framing (rather than a stray date or headcount mentioned in passing) is
model-judged, because voice matters as much as the digit: "Managed a team of 5" is still a duty
statement wearing a number.
**Good:** "Reduced P95 API latency from 340ms to 90ms by introducing a caching layer in front of
the settlement service."
**Bad:** "Worked on improving API performance for the settlement service."

### 2.3 ATS parse safety

**What it measures.** Whether the document's structure survives automated parsing — the same
class of failure this app's own resume pipeline already contends with (see the `< 150` character
scanned-PDF check in `app/api/parse-resume/route.ts`).
**Why it matters.** Most resumes are read by a parser before a human ever sees them. A resume
that parses into gibberish never reaches a person, regardless of how good the underlying career
is.
**A scoping honesty note for implementers.** By the time review code sees a resume, it has
already been through `pdf-parse` (or arrived as pasted text) — this app has the **linearized
text**, not the original PDF's visual geometry. It cannot literally detect "this resume uses a
two-column layout" the way a layout-aware tool could. What it *can* detect from text alone:
interleaved/jumbled sentence fragments consistent with column-order confusion, tab- or
pipe-heavy pseudo-tables, a suspiciously short extracted-text length relative to the stated
experience (consistent with content trapped in a text box or image `pdf-parse` couldn't reach),
private-use-area or icon-range Unicode characters (bullet icons, social-media glyphs that render
as `` boxes to a parser), and section headers that don't match any recognizable convention
(the segmentation model failing to identify a section at all is itself the signal). This
dimension's scope in this app is therefore **artifacts visible in extracted text**, not layout
analysis — say so in the finding's `reason` when it fires, so the candidate understands what was
actually checked.
**Assessment.** Deterministic pre-pass (regex/heuristic checks above) surfacing candidates for
model judgement on ambiguous cases (e.g., is this genuinely jumbled, or just an unusual but
parseable structure).
**Good:** clean linear text, standard section headers ("Experience," "Education," "Skills"),
plain ASCII bullets.
**Bad:** a role's bullets interleaved mid-sentence with an adjacent column's bullets, or a resume
whose extracted length is 400 characters for someone claiming eight years of experience — the
real content almost certainly didn't make it through extraction.

### 2.4 Action-verb strength and voice

**What it measures.** Whether bullets lead with a strong, specific verb versus a passive
construction or a filler opener ("Responsible for," "Helped with," "Worked on," "Assisted in").
**Why it matters.** Leading with weak or passive framing buries the candidate's actual role —
readers skim first words, and "Helped with X" reads as *someone else did X, they were nearby.*
**Assessment.** Hybrid. A deterministic pre-pass flags a fixed list of known-weak openers
(cheap, exact). Genuine verb-strength judgement — "Built" vs. "Developed" vs. "Owned" carry
different claims of scope — is model-judged.
**Good:** "Owned the migration of two services off a shared monolith, coordinating across three
teams over five months."
**Bad:** "Was involved in helping migrate some services to a new database."

### 2.5 Signal-to-length ratio

**What it measures.** Bullets per role, words per bullet, and how much total space is given to
recent/relevant work versus old or peripheral work.
**Why it matters.** A ten-year-old internship with five bullets and a role from eighteen months
ago with one line tells a reader the candidate doesn't know what's relevant about their own
career — or worse, that the recent role wasn't substantial. Space is the strongest implicit
priority signal a resume sends, stronger than anything stated explicitly.
**Assessment.** Deterministic. Word counts, bullet counts, and role-recency are all computable
directly from `ResumeSegment` with no model call. Thresholds are persona-specific (§3).
**Good:** a senior candidate's current role carries 5–7 substantial bullets; a role from nine
years ago carries one line of context, if it's kept at all.
**Bad:** a candidate's first internship, from six years ago, still carries four detailed bullets
while their current senior role has two.

### 2.6 Narrative coherence — `mid_level` and `senior` only

**What it measures.** Whether the sequence of roles reads as a deliberate arc — growing scope,
increasing ambiguity handled, a visible thread — or as an unconnected list of jobs.
**Why it matters.** At this stage, a reader isn't just asking "can this person do the job," they're
asking "where is this person's career going, and does hiring them fit that trajectory." A resume
that is merely tidy — clean bullets, correct tenses, zero typos — has not answered that question,
and a senior reviewer must say so even when there's nothing to flag line-by-line.
**Assessment.** Model-judged. This requires reading role-to-role, not bullet-by-bullet: does
scope (team size, budget, blast radius, ambiguity) expand across roles; is the most recent and
most senior work given the most space (ties to §2.5); is there evidence of influence beyond
individual delivery (mentoring, cross-team leverage, decisions that outlived the person).
**Good:** IC → tech lead of a 3-person team → owns a service used org-wide → mentors two
engineers and sets the team's technical direction — each role's bullets show the *next* role's
responsibility already emerging.
**Bad:** four roles at four companies, each described with the same register of task-level
bullets, no role's scope visibly larger than the last, no bullet mentioning another person.

### 2.7 Evidence portfolio — `student` and `early_career` only

**What it measures.** The presence, count, and quality of projects and internships — the primary
evidence available to someone with little or no full-time track record.
**Why it matters.** At this stage, "no full-time experience" is expected and not itself a
problem — the problem is having *nothing* that substitutes for it. This is the dimension that
drives the student branching logic in §3.2.
**Assessment.** Hybrid. Presence and count are deterministic (read off `ResumeSegment.projects`
and internship-flagged roles). Whether a project or internship is *well-described* — grounded,
specific, showing real decisions rather than a tutorial followed step-by-step — is model-judged.
**Good:** "Built a recommender system for a MovieLens-style dataset; implemented both a
collaborative-filtering baseline and a content-based variant, and wrote the evaluation harness
myself" — specific, shows judgement, names what was actually built.
**Bad:** "Completed a machine learning project" — no evidence of what was actually done or
decided.

### 2.8 Requirement coverage — against-job path only

**What it measures.** Whether the resume's existing content maps to what a specific job
description states it wants.
**Why it matters.** This is the dimension that makes the against-job path different from the
independent path — it's read through a specific recruiter's checklist, not a general bar.
**This is explicitly a surface-match signal, not a fit judgement.** It says "this requirement is
covered, partially covered, or not addressed by anything in the resume" — it does not say
whether the candidate is a good hire for the role, is under- or over-qualified, or would enjoy
the job. Presenting it as anything more than surface matching would be a confidence the tool
hasn't earned and shouldn't claim.
**Assessment.** Model-judged, with a hard deterministic constraint: every `requirement` string
must be traceable verbatim to the job description text (enforced in post-validation, Task 4/7).
The model is not free to infer or invent requirements the JD doesn't state.
**Good:** JD requirement "3+ years with production Kubernetes" → resume shows "deploy and debug,
not cluster administration" → status `partial`, with `evidenceInResume` quoting that exact
phrase and `howToAddress` naming the concrete gap (cluster administration).
**Bad:** inventing a requirement like "leadership experience" that the JD never actually stated,
or upgrading a `partial` match to `covered` because the keyword happens to appear somewhere.

---

## 3. The persona matrix

Persona sets the **expectation bar** — what counts as a finding and how severely it's scored.
It is not a tone dial. A harsher persona means *more things are checked and weighted heavier*,
never meaner language. The review of a senior candidate's weak bullet uses the same voice as
the review of a student's — it just doesn't let it slide.

| | `student` | `early_career` | `mid_level` | `senior` |
|---|---|---|---|---|
| **Definition** | Enrolled, or graduated ≤12 months ago; no full-time professional role | 0–2 years full-time | 2–6 years full-time | 6+ years full-time |
| **Expected sections** | Contact, Education (with graduation date), Projects *or* Internships/Experience, Skills | Contact, Experience, Education, Skills | Contact, Experience, Education, Skills (Projects optional) | Contact, Experience, Education (Skills often folded into Experience) |
| **Missing-section severity** | `critical` | `critical` | `critical` | `improvement` (a senior resume missing e.g. Skills is a smaller loss — scope is demonstrated in Experience) |
| **Active dimensions** | 2.1, 2.3, 2.4, 2.5, 2.7 | 2.1, 2.2, 2.3, 2.4, 2.5, 2.7 | 2.1, 2.2, 2.3, 2.4, 2.5 | 2.1 (loosely), 2.2, 2.3, 2.4, 2.5, 2.6 |
| **Dimension 2.7 (evidence portfolio)** | Governs the branching logic below — the single highest-leverage part of a student review | Applies, softer weight than `student` — some full-time signal already exists | N/A — stripped in code, never shown | N/A — stripped in code, never shown |
| **Dimension 2.6 (narrative)** | N/A — no career arc exists yet to assess | N/A — too early for an arc | N/A — not yet the primary lens, though scope trend within one role can start to matter | Primary lens — gets its own section in the UI, above line-level findings |
| **Findings cap (total)** | 10 | 12 | 12 | 15 |
| **Findings cap (per role/section)** | 4 | 5 | 5 | 6 for the two most recent roles, 3 for any role older than that |

The senior per-role cap is asymmetric on purpose: it's the code-level enforcement of dimension
2.5's own claim (recent, relevant work deserves the most space) applied to the *review itself*,
not just the resume being reviewed — a senior review that spends six findings picking apart a
role from nine years ago has the same problem it's supposed to be catching.

### 3.1 The escalation example

A bullet with no quantification, otherwise well-written, escalates by persona:

| Persona | Severity | Why |
|---|---|---|
| `student` | `polish` | No professional track record is expected to produce a metric yet; a clean, specific duty-statement is already a reasonable outcome for this stage. |
| `early_career` | `improvement` | Some real work now exists to quantify; not doing so is a missed opportunity, not yet a failure. |
| `mid_level` | `critical` | Quantified impact is the literal bar for this persona (§ definition table) — a mid-level bullet with no outcome at all is the single most common reason a mid-level resume reads as junior. |
| `senior` | `critical` | Same reasoning as `mid_level`, compounded — at this level, the absence of quantification on a role that plausibly had real scope reads as either the scope wasn't real or the candidate can't articulate it. Either reading is costly. |

This table is the pattern every other escalation decision in the system should follow: name the
consequence at that bar, don't just scale a number up.

### 3.2 Student branching (dimension 2.7 in practice)

This is the required decision tree for every `student`-persona review, run before anything else
in the review is assembled:

1. **Has neither projects nor internships.** This is the single highest-leverage finding in the
   entire review and must outrank every formatting note in presentation order (see Task 6 UI
   spec — it sits above the findings list, not mixed into it). State plainly that projects and
   internships are the strongest lever available right now. Then provide both:
   - 2–3 concrete project suggestions (capped at 3), each grounded in something actually on the
     resume — a listed course, the stated degree, a named language or interest. "Build a to-do
     app" is a failure mode by name; a suggestion that could have been given to any student
     regardless of what they wrote is not grounded and must not ship.
   - Concrete internship-seeking guidance, including platforms drawn only from the curated
     registry (Task 3) — never a model-invented URL.
2. **Has projects, no internships.** Acknowledge the existing projects specifically (by name —
   "your recommender system project" not "your project experience"), then push toward
   internships, explicitly framing the existing projects as leverage in those applications.
3. **Has internships, no projects.** Suggest projects that extend the internship's actual domain
   rather than starting from an unrelated area — the internship already proved domain interest;
   a disconnected project suggestion wastes that.
4. **Has both.** Normal review at the `student` bar. Do not manufacture a gap that isn't there —
   see §5.

**Project suggestion quality bar.** Each suggestion needs: a one-line scope, the specific skill
it demonstrates, roughly how long it should take, and a `groundedIn` citation to the exact
resume element (course name, degree, stated interest) that justified suggesting it. A suggestion
that could be copy-pasted into a review of a different student's resume without editing has
failed this bar regardless of how well-written it is.

---

## 4. Findings caps (summary)

Restated from §3 as one table, since it's the number most likely to be checked against directly
in eval 5 (Task 7):

| Persona | Total cap | Per-role/section cap |
|---|---|---|
| `student` | 10 | 4 |
| `early_career` | 12 | 5 |
| `mid_level` | 12 | 5 |
| `senior` | 15 | 6 (two most recent roles) / 3 (older) |

Caps apply **after** severity-ordering: if a resume genuinely has more findings than the cap
allows, keep the highest-severity ones and drop the rest — never drop a `critical` finding to
make room for a `polish` one. Actionable beats exhaustive at every persona level; a candidate
who receives 15 findings and fixes none of them was not served by the review having been
thorough.

---

## 5. The strong-resume rule

A genuinely good resume must be allowed to return few, or zero, `critical` findings — **at its
own persona's bar.** This is not a failure of the review; it is the review working correctly.

Two failure modes this rule exists to prevent:

- **Manufacturing criticism to appear useful.** A tool that always finds ten things wrong,
  regardless of input quality, is not calibrated — it's decorative. If the resume is strong,
  say so plainly and positively, and stop (see Task 6's "strong-resume state," which must not
  pad the list to look thorough).
- **Treating a higher bar as license to invent findings.** `senior` is the strictest persona,
  but "strictest" means *more things count if they're actually wrong*, not *find something
  regardless of whether anything is actually wrong*. `senior-strong` (Task 7's fixture) is
  designed specifically to test this: a resume that is genuinely excellent by senior standards
  must still land at or below one `critical` finding, even though it's being read at the
  hardest bar in the system.

The corollary case — `senior-tidy-but-flat` — exists precisely to prove the rule isn't an excuse
for laziness in the other direction: formatting cleanliness is not the same thing as narrative
coherence (§2.6), and a resume with zero line-level problems can and should still surface
`critical` narrative findings if the career arc genuinely isn't there.

---

## 6. The career-switcher modifier

`careerSwitcher` is a **boolean flag, not a fifth persona.** The years-based persona (§3) still
governs section expectations and the general bar; the flag changes *what counts as a gap*
within that bar.

Concretely: someone with ten years in marketing targeting an entry-level data role is
`senior`-or-`mid_level` by tenure (their writing ability, scope-of-work articulation, and
narrative-coherence dimension should be assessed at that level — they know how to write a
resume) but has `student`-or-`early_career`-level *domain evidence* in the target field. The
flag tells the review to:

- Assess writing craft, structure, and narrative (§2.2–2.6) at the persona implied by total
  years of experience — this person is not bad at describing their work.
- Assess domain-specific evidence (relevant projects, coursework, transferable-skill framing)
  against the *target* domain's expectations, not their years-of-experience persona's — ten
  years of marketing bullets do not, on their own, satisfy a data-domain evidence bar.
- Never apply §3.2's student branching logic (internship/project guidance) wholesale — a
  career switcher does not need to be told to seek an internship the way an 18-year-old does;
  if evidence-building is genuinely the gap, the guidance should read as "build a project that
  demonstrates the new domain," not "here's how to get your first internship."

Flag detection is a model judgement (Task 2: "whether a domain shift constitutes a career
switch" is explicitly listed as one of the judgement calls left to `gpt-5-nano`), not a
deterministic rule — there's no clean numeric threshold that reliably distinguishes a career
switch from a lateral move within the same field.

---

## 7. What this tool deliberately does not do

Stated formally, because each of these is a design decision someone could reasonably expect
and its absence needs to read as intentional, not missing:

- **No score out of 100, and no numeric score field anywhere in the schema.** A single number
  invites false precision and a false sense of comparability that this review cannot honestly
  provide.
- **No ranking against other candidates.** This tool never sees other candidates and has no
  basis to claim one.
- **No hire/no-hire prediction.** That is a recruiter's call, made with information (team
  context, other candidates, interview signal) this tool structurally does not have.
- **No rewriting the whole document.** Findings are targeted, bullet-level or section-level
  diffs — never a wholesale regeneration of the candidate's resume in the tool's own voice.
- **No fit verdict on the against-job path.** Requirement coverage (§2.8) reports *matching*,
  explicitly not fit — see that section for why the distinction is load-bearing.

---

## 8. The no-fabrication rule

This is the single most important constraint in the entire feature and is stated here formally
so its enforcement (Task 4) can be checked against unambiguous text.

**The review must never invent an accomplishment, metric, or fact the candidate did not
provide.** The canonical failure this rule exists to prevent: rewriting "Worked on the billing
service" into "Drove a 40% reduction in billing latency, saving $2M annually" — a number the
candidate never stated, attached to a claim they cannot defend the moment an interviewer asks
"how did you measure that." That is not a improved rewrite. It is coaching a candidate to
misrepresent their work in a conversation they will then fail, and the tool that produced it
carries the responsibility for that failure.

**The rule, precisely:**

1. Every `Finding.originalText` must appear **verbatim**, character-for-character, in the
   source resume text. If it doesn't, the finding is fabricated context and must be dropped.
2. Every number, company name, technology, or job title that appears in `suggestedText` must
   either (a) already appear in that finding's `originalText`, or (b) be a bracketed
   placeholder — e.g. `[X%]`, `[N services]`, `[team size]` — listed in that finding's
   `addedPlaceholders`. There is no third option. A model that wants to suggest quantification
   the candidate hasn't provided must ask for it via a placeholder, never supply a plausible-
   sounding number of its own.
3. This applies with **full force** on the against-job path, where the pull toward "just add
   this keyword so the match looks better" is strongest. Suggesting a candidate claim a skill,
   tool, or experience they have no evidence for in the source resume is the exact same failure
   wearing a different hat — a keyword match that doesn't survive the first follow-up question
   in an interview.
4. Rule 1 and rule 2 are **enforced programmatically**, in post-validation, not left to the
   prompt (Task 4). A prompt instruction is a request; a candidate's interview is a
   consequence. This rule gets code, not good intentions.

**The placeholder convention, formally.** A placeholder is bracketed text standing in for a
number or specific detail only the candidate can supply: `[X%]`, `[N]`, `[$ amount]`,
`[team size]`, `[duration]`. It must render visually distinct from the rest of the suggested
text in the UI (Task 6), and the interface itself — not only this document or the README — must
carry a standing explanation of why the tool declines to fill these in. The candidate fills in
their own real numbers because they are the only one who knows them, and a tool that guessed
would be doing exactly the thing this rule exists to prevent.

---

## Open items for review

1. **The four-persona split** (§ intro) — adopted here in place of the originally specified
   three, with reasoning given. Flagging per instruction; proceed with four unless told
   otherwise.
2. **Exact word/bullet-count thresholds for §2.5** are deliberately left as "persona-specific,
   defined in code" rather than hardcoded in this document — they're the kind of number that
   benefits from being tuned against the eval fixtures (Task 7) rather than guessed here in the
   abstract. Task 4 should pick concrete numbers and this document should be updated to state
   them once chosen, so the rubric stays the source of truth.
3. **The senior asymmetric per-role cap** (6 recent / 3 older, §3) is a judgement call with no
   external precedent to check it against — flagging it explicitly as the one cap number in this
   document I'd most want a second opinion on.
