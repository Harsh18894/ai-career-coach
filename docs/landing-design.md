# Hachi — landing page design

For the page that gets posted to Reddit for feedback.

---

## A note on method, before anything else

**Stages 1 and 2 below are structured assumption-making, not research.** There are no
interviews behind them, no surveys, no analytics from real traffic — there is no real traffic
yet. What they actually are: the personas already encoded in the product (`student`,
`early_career`, `mid_level`, `senior`, plus the `career_switcher` flag in
`lib/resume-review/persona.ts`), reasoned outward into who arrives at a link and what they are
worried about.

That is a legitimate way to start and a bad thing to disguise. Written up as though it were
research, it would be the kind of claim the audience for this page is specifically good at
spotting.

**The Reddit post is the test stage.** Section 5 says what would falsify the choice made here.

---

# 1. Empathise

Three personas, mapped to the buckets the product already reasons in.

## Persona A — "I don't know what to aim at"
**Maps to:** `student` / `early_career`. Final year, or 0–2 years in.

| | |
|---|---|
| **Hired to do** | Turn an open field into two or three named roles they could actually apply for tomorrow. |
| **Arrives feeling** | Behind. Everyone else seems to have a plan. Applying broadly and hearing nothing, which they read as a verdict on them rather than on the funnel. |
| **Prior experience of career advice** | University careers service: a CV template, "have you tried networking", a list of graduate schemes. Correct, generic, and useless for choosing between things. |
| **Objections** | "I don't have anything to put in." Their résumé is coursework and one internship, and they expect a tool like this to have nothing to say to them — or worse, to tell them they're underqualified in a way they already suspect. |

The product-specific fear: that it will read their thin résumé and confirm the thing they are
afraid of. This is why the fold cannot open with anything that sounds like assessment.

## Persona B — "I'm stuck and I can't name why"
**Maps to:** `mid_level` / `senior`. Four to fifteen years in, competent, no longer moving.

| | |
|---|---|
| **Hired to do** | Name the thing that has stalled, and give them a next move that isn't just "apply for the next title up". |
| **Arrives feeling** | Not desperate — this is the important difference from A. Mildly embarrassed to be reading a career page at all. Competent at their job, plateaued, and privately unsure whether the problem is the company or them. |
| **Prior experience of career advice** | Has been told to "build your brand" and "find a mentor". Has read enough LinkedIn to be allergic to it. May have paid a coach once and got a CV rewrite. |
| **Objections** | The real one is **"this is a toy"**. They will decide in about four seconds whether a person with fourteen years of experience should be seen taking this seriously. A recommendation that is obviously generic — "have you considered Product Management?" — ends it permanently. |

This persona is the reason the brand tension in section 6 exists. They are the hardest to keep
and the most valuable to convince, because they are also the ones with Reddit karma.

## Persona C — "I want out, and I don't know if my experience counts"
**Maps to:** any bucket with `careerSwitcher: true`. Six years in one field, self-taught in another.

| | |
|---|---|
| **Hired to do** | Tell them honestly which of their existing experience transfers and which does not, and what the realistic first step across is. |
| **Arrives feeling** | Impatient and slightly defensive. Has usually already decided to switch and is looking for a route, not permission. Braced to be told to start over. |
| **Prior experience of career advice** | Bootcamp marketing that promised a six-figure job in twelve weeks; or the opposite, a friend in the target field who was discouraging. Both were selling something. |
| **Objections** | "It'll either tell me to do a bootcamp, or tell me my six years of marketing are worthless." They are looking for the tool to be wrong in one of two predictable directions, and will leave the moment it is. |

## What all three share

None of them arrive wanting to *use a tool*. They arrive wanting a decision made easier. And all
three have been burned by advice that was fluent and generic — which is precisely what an LLM
produces by default, and precisely what the product's traceability constraint exists to prevent.
That is the thing worth putting on the page.

---

# 2. Define

**Point-of-view statements:**

- A final-year student who is applying broadly and hearing nothing **needs** to see two or three
  named roles they could plausibly aim at **because** an open field cannot be acted on, and every
  week of untargeted applying reinforces the belief that the problem is them.

- A competent engineer eight years in who has stopped moving **needs** the stall named in terms
  of their own history **because** they have already heard the generic advice, and anything that
  does not reference their actual work reads as proof this is another content mill.

- A marketer six years in who is teaching themselves SQL **needs** an honest split of what
  transfers and what doesn't **because** every previous source was either selling a bootcamp or
  protecting a moat, and they cannot tell which parts of the encouragement were real.

**Primary how-might-we:**

> **How might we make a skeptical stranger believe, within one screen and without giving us
> anything, that this will say something specific about *them* rather than something fluent
> about careers in general?**

Every constraint in the fold spec falls out of that sentence. "Without giving us anything" is the
sample-profile CTA and the trust line. "Something specific about them" is why a real path card is
in the fold. "Within one screen" is why it must fit 375px unscrolled.

**Secondary, and genuinely in tension with it:** how might we do that without the page feeling
cold — given persona A arrives anxious, and being assessed by a machine is exactly what they
fear?

---

# 3. Ideate — three first-fold concepts

### Concept 1 — Outcome-led
Lead with the result. *"Three career paths that actually cite your experience."* Headline is the
promise; the artifact appears below the fold.

**For:** clearest single sentence. Fastest to read. Works in a Reddit link preview, which is
where a lot of the first impression is formed.
**Against:** it is a claim, and this audience discounts claims by default. Every thin wrapper on
the front page makes the same one. It puts the burden of proof below the fold, where roughly half
the visitors will never go — and it's the persona-B skeptics who leave earliest.

### Concept 2 — Problem-mirror-led
Lead with the reader's situation. *"You've been applying for months and hearing nothing back."*
Mirror the feeling, then offer the tool.

**For:** highest emotional resonance, especially for A and C. Matches the "feel met, not
assessed" instruction in the brand brief. Warm without needing the illustration to carry it.
**Against:** it mirrors *one* persona and alienates the others — the sentence that lands for a
frustrated graduate is faintly insulting to a senior engineer who is employed and just bored.
Worse, mirroring pain is the signature move of the exact marketing register this audience
punishes. Doing it well and doing it manipulatively look identical from outside.

### Concept 3 — Show-the-artifact-led
Lead with a real, complete path card from a real sample run, at near-full size, immediately.
Headline and CTA sit beside or beneath it. The product demonstrates itself before it describes
itself.

**For:** answers the skeptic's actual question — *what does this thing produce?* — in the first
second, with evidence instead of a claim. It is the only one of the three that cannot be faked by
a thin wrapper, because a thin wrapper's output does not survive being shown at full size. It
also makes the sample CTA feel like a continuation rather than a leap: you have already seen the
output, clicking just makes it yours.
**Against:** it is denser and slower to parse than a headline. It risks reading as a screenshot
of a dashboard, which is a "tool" framing rather than a "pal" framing. And it stakes everything
on one path card being genuinely good — if the sample output is mediocre, this concept
broadcasts that immediately rather than hiding it.

---

# 4. Prototype — the choice

## Chosen: Concept 3, show-the-artifact-led, with a single line of Concept 2's warmth above it

**Why.** The primary how-might-we asks how to make a skeptic believe this says something specific
about *them*. Only one of the three concepts answers that with evidence rather than assertion.
Concepts 1 and 2 both require the reader to extend trust before seeing anything; concept 3 spends
that trust for them.

The against-argument that matters is the "dashboard, not a pal" risk, and it is real. The
resolution is not to soften the artifact but to put one human sentence above it and one
illustration beside it — warmth in the framing, rigour in the content. That is the same
positional resolution the brand brief already asks for, applied inside the fold rather than down
the page.

The other against-argument — that this stakes everything on the sample output being good — is a
feature. If the best path card the product produces is not convincing at full size, the page is
not the problem and no headline will fix it.

**What I am explicitly not doing:** leading with the mechanism ("AI-powered career coaching"),
naming the model, or using the words *revolutionary*, *powerful*, *seamless*, or *unlock*.

## Copy deck

### Fold

**Wordmark**
> Hachi — *Your career pal*

**Headline**
> Figure out what to aim for next.

**Subhead**
> Talk it through for a few minutes, and get three specific paths — each one pointing at
> something real in your background — plus a week-by-week plan for the one you pick.

**Primary CTA**
> Try it with a sample profile

*Supporting line under the CTA, small:*
> No signup. Nothing to upload.

**Secondary CTA**
> Or use your own résumé — upload, paste, or just answer a few questions

**Trust line**
> Free · No account · Your résumé is never stored on our servers — [what happens to it](/privacy)

**The artifact.** A real path card from a sample run, rendered in the real component. Verbatim
from `evals/.cache/snapshots/generatePaths:R-grow-01:c3.json`:

> **Principal Revenue Operations — Systems & Analytics Lead**
> `CAD 120,000–160,000` · `realistic`
>
> **Why this fits you:** You built Ledgerly's first SQL-based commission calculation engine, own
> the executive revenue dashboard, and redesigned the forecasting model (variance 18% → 7%). If
> you prefer to keep shipping technical systems rather than managing people, this role matches
> your demonstrated technical impact.
>
> **Ambition check — aligned:** You already shipped the commission engine and executive
> dashboard; pushing those to production-grade is a natural step rather than a stretch.

The fit rationale is the whole argument. It names a company, a system, and a metric. No generic
tool produces that sentence, and no amount of copy asserts it as well as showing it.

### How it works
> **1. Tell it where you're at.** Upload a résumé, paste it, or answer a few questions if you'd
> rather not. Takes about a minute.
>
> **2. Have an actual conversation.** Four or five questions, adapting to what you say. It won't
> recommend anything until it has something real to go on.
>
> **3. Get three paths and a plan.** Each path cites something specific from your background.
> Pick one and it writes a week-by-week roadmap. The whole thing takes about five minutes, and
> the last step takes half a minute to generate.

### Why you can trust the recommendations *(no illustration)*
> **Every path has to cite you.** Not "you seem analytical" — a company, a project, a number, or
> something you said. If it can't point at something specific, that's a bug, and there's a test
> that fails the build when it happens.
>
> **It won't guess.** The coach can't move to recommendations until the conversation has produced
> at least one concrete skill or domain *and* a real sense of direction. That gate is code, not
> a polite instruction to the model.
>
> **You can check all of it.** The prompts, the gates, and the eval suite that guards them are in
> the repo. [How it works in detail](/about) · [Source on GitHub](#)

### What it doesn't do *(no illustration)*
> - It doesn't apply to jobs for you.
> - It can't promise you'll get any of these roles. Nobody can.
> - It isn't a recruiter and has no jobs to place you in.
> - It's no substitute for talking to someone actually doing the work. Use it to figure out who
>   to go and talk to.
> - If your résumé is thin, it will say so plainly rather than flatter you.

### Who built this
> I'm Harsh. I built Hachi because most career advice is fluent and generic, and the useful kind
> — someone who knows your actual situation telling you the specific thing — is hard to get.
>
> It's called Hachi because it's meant to sit beside you and be on your side. That's the whole
> idea: not an assessor, a companion who happens to have read a lot of résumés.
>
> It's a side project, it's free, and it costs me a few cents every time someone uses it. If it's
> useful, tell me. If it's wrong about you, definitely tell me.

### Repeat CTA
> **Try it with a sample profile** — no signup, nothing to upload

---

# 5. Test

## What gets measured
Per Task C6, no PII. The funnel:

`landing view → sample CTA → upload CTA → profile parsed → first coach message → Nth turn → deck shown → path locked → roadmap viewed`

Segmented by **referrer** (Reddit separable) and by **sample vs. own-résumé path**. Plus
time-on-page before first CTA click, and error/rate-limit events.

## What the chosen concept predicts

Concept 3 claims that *showing the artifact converts skeptics*. If true:

| Signal | Prediction |
|---|---|
| Sample CTA click-through | **> 25%** of landing views |
| Time before first CTA click | **short** — median under 30s. The artifact should make the decision fast. |
| Sample → own-résumé | **> 15%** of people who finish a sample session start a real one. This is the concept's core bet: seeing the output makes uploading plausible. |
| Deck shown, of sessions started | **> 60%** |
| Reddit comments | Objections about *quality of recommendations*, not about *what does it even do* |

## What would falsify it

- **High landing views, low sample CTA (< 10%), long dwell.** People are reading and not acting —
  the artifact is being parsed as a screenshot of someone else's result rather than an invitation.
  Concept 1's clearer promise would have been the better call.
- **Good sample completion, near-zero own-résumé conversion (< 5%).** The demo entertains but
  doesn't persuade; the trust line isn't doing its job, or the output isn't good enough to want
  for yourself. This would be the most useful failure — it points at the product, not the page.
- **Comments asking "what is this"**, i.e. the fold failed to communicate at all.
- **Mobile bounce far above desktop.** The fold didn't fit, and the artifact-led concept is the
  one most at risk of that.

## What is deliberately not measured
No A/B test. The traffic is one spike from one post; a split test on a few hundred sessions
measures noise. This is one concept, shipped, with a stated falsification condition — which is
the honest instrument at this sample size.

---

# 6. Brand

## What "Your career pal" commits us to

A pal is **on your side**, **talks straight**, and **doesn't perform**. In copy:

- **Second person, always.** "You've been applying for months", never "users often report".
- **Plain words.** *Job*, not *role opportunity*. *Pay*, not *compensation band*. *Résumé*, not
  *professional profile document*.
- **No hype vocabulary.** No *revolutionary*, *powerful*, *seamless*, *unlock*, *supercharge*,
  *game-changing*, *cutting-edge*.
- **Never talk down to a beginner.** No "don't worry!", no exclamation marks doing emotional
  labour. Explain the thing; assume they're capable.
- **Never over-explain to a senior.** They know what a career path is. Don't define terms they
  use daily.
- **Say the limits out loud.** A pal who only tells you good news isn't one.

## Where warmth helps, and where it costs

**Helps:** the fold, where persona A is deciding whether this is going to judge them. Waiting
states, where a 30-second roadmap generation is otherwise dead air. Error and budget-exhausted
states, where the alternative is a stranger's failed side project telling you no.

**Costs — and this is the risk to name explicitly:** persona B, the senior engineer with fourteen
years of experience, is asking one question in the first four seconds — *is this serious, or is it
a toy?* A dog illustration next to a claim about traceable recommendations answers "toy", and that
judgement doesn't get revisited. The credibility sections have to read like they were written by
someone who would be embarrassed to overclaim.

**The resolution is positional, not quantitative.** Not "less warmth everywhere" — warmth at the
top, rigour further down, and a hard line between them.

**Illustration-free, without exception:**

| Section | Why |
|---|---|
| Why you can trust the recommendations | This is the credibility argument. A mascot beside it undercuts the sentence it sits next to. |
| The eval suite / GitHub links | The one section speaking directly to engineers evaluating whether this is real work. |
| What it doesn't do | Stating limits is a seriousness signal. Decorating it reads as softening the limits. |
| Privacy | People read privacy copy adversarially. Nothing cute goes near it. |

Illustration is permitted, per the C3 budget of three total: **the fold** (one), **how it works**
(one, optional), and **one reusable figure** for waiting/empty/error states.

## On Hachikō

The name will remind some people of the Akita who waited outside Shibuya station. That is a
loyalty story and mostly an asset — but the ending is famously sad, and a career tool leaning on
it would strike a very strange note. **Use the warmth of the association; never tell the story.**
No station, no statue, no waiting, no "loyal to the end". If a line only works because the reader
knows the legend, cut it.

## Voice guidance

**1. Say the specific thing, not the category.**
> ✅ "Three paths, each pointing at something real in your background."
> ❌ "Personalised, AI-driven career recommendations tailored to your unique profile."

**2. Lead with what the reader gets, not with how it works.**
> ✅ "Figure out what to aim for next."
> ❌ "An intelligent coaching platform powered by advanced language models."

**3. State limits as plainly as benefits — it reads as confidence.**
> ✅ "It can't promise you'll get any of these roles. Nobody can."
> ❌ "Results may vary depending on individual circumstances and market conditions."

**One more, for the app itself, not just the page:** the coach's own copy already follows this —
error messages say what happened and what to do next, and the review tells people when a résumé
is thin. The landing page should not be written in a different voice from the product it opens.
