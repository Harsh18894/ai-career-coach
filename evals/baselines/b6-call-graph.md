# B6 — LLM call dependency graph, concurrency, and merge proposals

Mapped from the actual orchestration in `components/ChatWindow.tsx`, `app/page.tsx` and
`components/ResumeUpload.tsx`, not from the README's description of it.

Timings are post-B3/B4/B5 P50s from `evals/baselines/latency-b3.log`.

---

## The graph

```
INTAKE (resume)                                       9.0s  ── strictly sequential
  parse-resume ──▶ extractProfile        7.6s
        │ profile
        ▼
  generate-opener ──▶ generateOpeningMessage   5.3s
                                                       ~12.9s total

INTAKE (no resume)                                    ── strictly sequential
  next-profile-question  x3 (adaptive)   2.7s each     each needs all prior answers
        │ answers
        ▼
  build-profile ──▶ buildProfileFromAnswers            (not exercised by evals or harness)

UNDERSTANDING TURN  (x2 per session — the hot path)
  analyze ──▶ analyzeSignals             4.7s
        │ nextSignals
        │   └── decides the branch: decline | recommend | continue
        ▼
  ┌── continue ──▶ understanding-turn ──▶ generateUnderstandingTurn   4.4s
  ├── recommend ──▶ (below)
  └── decline   ──▶ chat[insufficient_info] (streamed)
                                                       ~9.1s per turn

RECOMMEND
  recommend ──▶ generatePaths            31.9s         single call, nothing to overlap
        └── needsCountry ──▶ chat[ask_country] (streamed)   sequential, and correctly so
        └── notReady    ──▶ understanding-turn              sequential, and correctly so

PATH LOCK                                              ── ALREADY PARALLEL ✓
  ┌─ roadmap ──▶ generateRoadmap         35.6s ─┐
  └─ chat[path_locked] (streamed)         3.3s ─┘
                                                       ~35.6s, not 38.9s
```

## Independent pairs

Exactly one genuinely independent pair exists in the whole session, and it was already
parallelised: **`generateRoadmap` + the streamed closing reflection** at path lock. The
README's claim is accurate — verified in `handleSelectPath`, which fires the roadmap request
before awaiting the stream.

Everything else is a real data dependency, not an oversight:

| Pair | Why it cannot overlap |
|---|---|
| extractProfile → generateOpeningMessage | The opener's entire purpose is citing a fact from the profile. |
| analyzeSignals → understanding-turn | The branch decision (decline / recommend / continue) reads `nextSignals`. Running the turn concurrently means running it before knowing whether it should run at all. |
| next-profile-question ×3 | Each adaptive question is generated from every prior answer. That is the feature. |
| recommend → ask_country | The country question is only asked because `recommend` said it was needed. |

**Nothing new was parallelised, because there is nothing left that is safe to parallelise.** The
remaining overlap opportunities all require speculating on a branch that has not been decided —
which is a merge/elimination question, below, not a concurrency one.

## What was fixed: the concurrent pair's error handling

The existing parallelism had a real defect. Both halves lived in one `try` block:

```ts
const roadmapPromise = fetch(...);                    // starts
await streamCoachTurn(...);                           // if this throws...
const roadmapData = await parseCoachResponse(await roadmapPromise);   // ...never reached
```

If the stream failed, control jumped to `catch` and `roadmapPromise` was **never awaited**. Two
consequences, both silent:

1. An **unhandled promise rejection** if the roadmap request also failed.
2. A roadmap that had already been generated — and paid for — was **discarded**, because the
   only code that would have written it to state was skipped.

The closing reflection is a few sentences of encouragement. The roadmap is the artefact the user
locked a path to get. Losing the second because the first died is exactly backwards.

Each half now settles independently, a `.catch` is attached at creation so a rejection can never
be unhandled, and the roadmap's error is reported in preference to the stream's when both fail.
Three tests in `components/ChatWindow.test.tsx` pin it, including the specific case that was
broken: **stream fails, roadmap survives and renders.**

---

# Merge and elimination proposals — for your decision

Presented, not implemented, per the brief. Ordered by value.

## Proposal 1 — Speculatively run `understanding-turn` alongside `analyze`

**Saves ~4.4s per turn, ~8.8s per session** (of a 63.7s intake→paths P50). The single largest
remaining win.

Today `analyzeSignals` (4.7s) must finish before `generateUnderstandingTurn` (4.4s) starts,
because its result decides whether the turn happens at all. Firing both together and discarding
the turn when the branch goes elsewhere would make the pair cost `max()` instead of `sum()`.

**Why I did not just do it.** The understanding turn would be generated from the *previous*
turn's signals. Its prompt contains a "What you ALREADY know — do NOT ask about any of these
again" block built from exactly those signals, and rules 4 and 5 gate the question on whether
motivations/constraints are still empty. Running it a turn behind means the coach can re-ask
something the candidate just answered — which is the specific failure the block exists to
prevent, and it would show up as the coach seeming not to listen.

**Cost:** roughly one wasted `generateUnderstandingTurn` per session (~$0.0005) on turns that
branch to recommend or decline.

**Recommendation: don't, unless the wasted-turn quality risk is tested first.** If you want it, the
honest version is a 10-run A/B on H1 and I1 with the stale-signals variant, not a straight swap.

## Proposal 2 — Merge `extractProfile` + `generateOpeningMessage` into one call

**Saves ~5.3s of a 12.9s intake**, and removes an entire HTTP round trip from the slowest,
most abandonment-prone moment in the product — the wait right after upload, before anything has
appeared on screen.

One `gpt-5-mini` call returning `{ profile, opener }` against a combined schema.

**Arguments against, honestly:**
- It forces the opener onto whichever model parses the profile. Today extraction runs on
  `gpt-5-nano` at `low` effort (7.6s) and the opener on `gpt-5-mini` (5.3s). A merged call must
  be `gpt-5-mini`, so the extraction half gets more expensive per token.
- B1 (opener grounding) and R12 (non-resume refusal) both depend on this path. The non-resume
  case is the awkward one: `hasSufficientInfo: false` means there is no profile *and* no opener,
  so the merged schema needs a discriminated shape rather than a flat object.
- It couples two concerns that currently fail independently. Today a failed opener still leaves a
  usable profile; merged, one bad response loses both.

**Recommendation: worth doing, with the discriminated schema.** This is the wait users actually
abandon on, and 5.3s off it is the best remaining ratio of gain to risk in the app.

### UPDATE — implemented, measured, REVERTED

Built and measured on request. **The premise was wrong and the saving does not exist.**

| Configuration | Intake cost |
|---|---|
| Split: `extractProfile` (nano) 7.6s + `generateOpeningMessage` (mini) 5.3s | **12.9s** |
| Merged on `gpt-5-mini` | **14.4s** — 1.5s *worse* |
| Merged on `gpt-5-nano` | **~12.5s** — a wash, within run-to-run noise |

The estimate above assumed the merged call would cost roughly what extraction alone cost — that
the opener's 5.3s would be absorbed. It is not. The model still has to generate both halves and
generation time is close to additive, so **merging saves one HTTP round trip (~200ms), not the
opener's 5.3s.** On `gpt-5-mini` it actively loses, because extraction moves off `gpt-5-nano`
onto the slower model.

The `gpt-5-nano` variant reaches parity, but pays for it by having the weaker model write the
first thing the candidate ever reads. Parity is not worth that.

Reverted in full. Everything else in this document stands.

Two things worth keeping from the attempt:

- **The first measurement was invalid and said the merge cost +10s.** `scripts/latency-baseline.ts`
  was still calling `/api/generate-opener` separately, so sessions ran the merged call *and* the
  standalone opener. The per-call telemetry is what caught it — `generateOpeningMessage` appearing
  with n=6 in a run that should not have called it at all. A session-level number alone would
  have produced a confidently wrong conclusion in either direction.
- **The non-resume path is the real hazard in any future attempt.** `hasSufficientInfo: false`
  has to mean no profile *and* no opener, which needs `opener` nullable in the schema and a
  `bailIf` that fires before validation. It worked, and it is the part most likely to be got
  wrong by someone retrying this.

## Proposal 3 — Eliminate `analyzeSignals` on the final turn before recommending

When `understandingMessageCount` has reached `MAX_UNDERSTANDING_TURNS`, the branch goes to
recommend **regardless of what the signals say**. The `analyzeSignals` call on that turn (4.7s)
is computed and then only partly used — `generatePaths` does receive the signals, so it is not
pure waste, but the *gating* half of its purpose is moot.

**Recommendation: don't.** The saving requires passing staler signals into the single most
important call in the product, to save 4.7s once per session. Bad trade, and I would rather
name it than quietly leave it unexamined.

## Proposal 4 — Merge `detectCareerSwitch` into `segmentResume`

Both are `gpt-5-nano` review-pipeline calls reading the same resume. Merging saves ~2.2s of the
review's ~14s prepare phase.

**Recommendation: don't, for now.** `detectCareerSwitch` was deliberately split out during the
review phase as the one genuine judgement call in an otherwise arithmetic classifier, and R7
(persona classification accuracy) is the eval that would catch a regression. The 2.2s is not
worth re-entangling a boundary that was drawn on purpose — but it is a legitimate option if the
review's prepare phase ever becomes the bottleneck.

---

## Summary

- **Implemented:** the concurrent pair's error handling, so one failure cannot discard the
  other's result. Three regression tests.
- **Not implemented, by design:** no new parallelism, because every other pair has a real data
  dependency.
- **Attempted and reverted:** proposal 2. Measured at parity-to-worse, not the predicted 5.3s
  saving. See the update above.
- **Still awaiting a decision:** proposals 1, 3 and 4 — all of which I recommend against.

With proposal 2 measured and rejected, **there is no remaining call-elimination win in this app
that does not cost output quality.** The two calls left worth attacking, generatePaths and
generateRoadmap at 30% of session time each, are the two the product is judged on.
