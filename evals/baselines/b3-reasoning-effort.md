# B3 — reasoning effort, tiered by risk

Three steps, applied in the order the brief specified, with a full `npm run eval` after each.

## Decision table

| Step | Call sites | Model | Effort | P50 before | P50 after | Δ | Reasoning p50 | Eval | Decision |
|---|---|---|---|---|---|---|---|---|---|
| 1 | extractProfile | nano | default → **low** | 24.1s | 7.6s | **−68%** | 3072 → 640 | 19/21 | **KEEP** |
| 1 | analyzeSignals | nano | default → **low** | 20.2s | 4.7s | **−77%** | 3072 → 384 | 19/21 | **KEEP** |
| 1 | detectCareerSwitch | nano | default → **low** | 4.5s | 2.2s | **−51%** | 512 → 64 | 19/21 | **KEEP** |
| 2 | streamChatTurn | mini | default → **low** | 7.7s | 3.3s | **−57%** | 512 → 128 | 19/21 | **KEEP** |
| 2 | generateOpeningMessage | mini | default → **low** | 10.4s | 5.3s | **−49%** | 768 → 192 | 19/21 | **KEEP** |
| 2 | generateUnderstandingTurn | mini | default → **low** | 8.0s | 4.4s | **−45%** | 1216 → 384 | 19/21 | **KEEP** |
| 2 | nextGuidedProfileQuestion | mini | default → **low** | 4.7s | 2.7s | **−42%** | 320 → 64 | 19/21 | **KEEP** |
| 2 | buildProfileFromAnswers | mini | default → **low** | — | — | not exercised | — | 19/21 | KEEP |
| 3 | generatePaths | mini | default → **medium** | 30.3s | 31.9s | **+5%** | 2496 → 2368 | 19/21 | **KEEP (no-op)** |
| 3 | generateRoadmap | mini | default → **medium** | 33.9s | 35.6s | **+5%** | 1728 → 1792 | 19/21 | **KEEP (no-op)** |

`segmentResume` and the review generation call were already `low` from the resume-review phase.

## Session-level result — the number that matters

Six sessions, two passes over the three sample profiles, same harness as the baseline.

| | Before | After | Δ |
|---|---|---|---|
| **Resume upload → first path card (P50)** | 109.8s | **63.7s** | **−42%** |
| **Resume upload → first path card (P95)** | 142.1s | **71.7s** | **−50%** |
| Path lock → roadmap rendered (P50) | 34.0s | 35.6s | +5% |
| **streamChatTurn TTFT (P50)** | 7.1s | **2.5s** | **−65%** |
| **Cost per session (P50)** | $0.0243 | **$0.0177** | **−27%** |
| Total model time (6 sessions) | 963.7s | 626.1s | −35% |
| Schema repairs | 1 | **0** | — |
| Truncations | 0 | 0 | — |

The roadmap span did not move, which is expected: `generateRoadmap` is the one user-facing call
whose effort was left at the default.

## Step 3 was a no-op, and that is the finding

Setting `medium` explicitly changed nothing measurable — total model time across the eval suite
moved **−0%**, and reasoning tokens stayed in the same band (generatePaths 2,112 → 1,920;
generateRoadmap 1,280 → 1,280). The straightforward reading is that **`medium` is already the
gpt-5 default**, so step 3 wrote down what was already happening.

It is kept anyway, as a pin rather than a change: if OpenAI moves the default, the two call
sites the product is judged on should not silently start reasoning differently.

**`low` was not tried on these two.** The brief asked for conservatism and the baseline supports
it: these are the only two call sites where reasoning is *not* obviously wasted. Reasoning-to-
visible-output ratios at baseline —

| Call site | Ratio | |
|---|---|---|
| analyzeSignals | 10.2× | reclaimed |
| generateUnderstandingTurn | 9.4× | reclaimed |
| streamChatTurn | 8.7× | reclaimed |
| extractProfile | 7.9× | reclaimed |
| generateOpeningMessage | 7.3× | reclaimed |
| **generatePaths** | **2.0×** | left alone |
| **generateRoadmap** | **1.0×** | left alone |

At 1.0× the roadmap call spends essentially everything on the answer itself. There is little
deliberation there to remove, so `low` would buy proportionally little time and would be paid
for in the ambition check — a judgement that sometimes has to tell someone their target is
unrealistic, which is the first thing to degrade when a model stops deliberating.

These two are now **65% of remaining session time**. Cutting them further is the obvious next
lever and the one most likely to cost output quality; it is a decision worth taking explicitly
rather than folding into a latency pass.

## Eval results, and what is signal

Every run after the baseline scored **19–20 / 21**. No step produced a failure attributable to
the call sites it changed.

| Run | Failing | Attributable? |
|---|---|---|
| Baseline | H1 | pre-existing |
| Step 1 | H1, **I1** | **No** — I1 only calls `nextGuidedProfileQuestion`, untouched in step 1. Passed on an independent re-run. Votes were 1–2. |
| Step 2 | H1, **G1** | **No** — G1 calls none of step 2's sites. Measured directly: see below. |
| Step 3 | H1, **B1** | **No** — B1 calls `extractProfile` and `generateOpeningMessage`, neither changed in step 3. Token-construction weakness; see below. |

### G1 is flaky at ~70%, and it was measured rather than assumed

G1 failing after step 2 looked like a regression. It exercises `extractProfile` (changed in
step 1), so the possibility that low-effort extraction was degrading downstream roadmap
coherence had to be tested, not argued about. Nine independent runs each side, run cache cleared
between every one:

| | Pass rate |
|---|---|
| `extractProfile` at **low** (treatment) | **6 / 9** |
| `extractProfile` at **default** (control) | **7 / 9** |

Indistinguishable. G1 is an unstable eval — the judge is asked whether a roadmap's duration is
honest against a path's ambition note, which is a genuinely borderline call on this fixture.
**A single G1 result means nothing in either direction.**

A methodology note that changed the answer: re-running one suite with `npx vitest run` does
**not** clear `evals/.cache/run`, so the first "re-run" re-judged the same cached roadmap rather
than generating a new one. Every sample above clears the cache explicitly.

### B1 has a second token-construction weakness

Step 3's B1 failure, on a different fixture from the original one:

> Opener: "Maria Lindqvist — you spent **two years** as an **SDR** at **Brightloop** …"
> Tokens tried: `Sales Development Representative`, `Brightloop (B2B SaaS, workflow automation)`, `2 year`, …

The opener is plainly grounded. It fails because the profile's company token carries a
parenthetical descriptor the extractor appended (`Brightloop (B2B SaaS, workflow automation)`),
the role token is the expanded form of the abbreviation the opener naturally uses (`SDR`), and
the tenure token is digits where the opener wrote words (`2 year` vs "two years").

Same class as the hyphen defect fixed before the baseline, different mechanism. **Not fixed
here** — the instrument was already changed once during this pass, and changing it again in the
middle of B3's measurements would make the steps non-comparable. Flagged for a decision:
stripping parentheticals from company tokens is the contained fix and would catch this case.
Abbreviation and number-word matching are a larger question.

## What is left

Remaining session time is now concentrated where it was not before:

| Call site | Share of session model time |
|---|---|
| generateRoadmap | 34% |
| generatePaths | 31% |
| everything else | 35% |

The pass has done what the baseline said it should: removed reasoning that was being spent on
schemas and short conversational replies, and left the two calls that genuinely think. B4's
output caps, B5's cache alignment, and B6's parallelisation now act on a much smaller surface.
