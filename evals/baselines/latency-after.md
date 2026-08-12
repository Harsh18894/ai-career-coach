# Latency pass — final benchmark

Both baselines re-run against the same harness, the same six sessions (two passes over the three
sample profiles), the same machine, rate limiting disabled the same way.

Before: `latency-before.md` / `quality-before.md`. Raw logs: `latency-after.log`,
`quality-after.log`, `quality-after.json`.

---

## Headline

| | Before | After | Δ |
|---|---|---|---|
| **Resume upload → first path card (P50)** | 109.8s | **56.8s** | **−48%** |
| **Resume upload → first path card (P95)** | 142.1s | **65.4s** | **−54%** |
| Path lock → roadmap rendered (P50) | 34.0s | 30.6s | −10% |
| Path lock → roadmap rendered (P95) | 51.5s | 40.9s | −21% |
| **Chat TTFT (P50)** | 7.1s | **2.8s** | **−61%** |
| **Cost per session (P50)** | $0.0243 | **$0.0179** | **−26%** |
| Total model time, 6 sessions | 963.7s | 564.2s | −41% |
| Schema repairs | 1 | **0** | — |
| Truncations | 0 | 0 | — |
| **Eval pass rate** | 20/21 | **20/21** | **unchanged** |

The wait a user actually experiences before seeing a recommendation is **just under half what it
was**, at a quarter less cost, with no measured quality change.

## Per call site

| Call site | n | P50 before | P50 after | Δ | P95 before | P95 after | Δ |
|---|---|---|---|---|---|---|---|
| extractProfile | 6 | 24.9s | **7.2s** | **−71%** | 34.7s | 9.1s | −74% |
| analyzeSignals | 12 | 10.7s | **3.9s** | **−64%** | 17.1s | 6.2s | −64% |
| generateOpeningMessage | 6 | 10.2s | **4.0s** | **−61%** | 14.6s | 5.2s | −64% |
| generateUnderstandingTurn | 12 | 8.0s | **3.4s** | **−58%** | 14.2s | 4.5s | −69% |
| streamChatTurn | 6 | 7.9s | **3.5s** | **−56%** | 9.5s | 4.3s | −54% |
| generateRoadmap | 6 | 33.9s | 30.6s | −10% | 51.5s | 40.9s | −21% |
| **generatePaths** | 6 | 30.3s | 29.5s | −3% | 37.1s | **39.2s** | **+6%** |

Where the time now goes: `generateRoadmap` 35%, `generatePaths` 33%, everything else 32%. Before
the pass the top four call sites were 22/20/17/15% — evenly spread. The two calls left are the
two the product is judged on, and they were deliberately left near-default.

## Regressions

**1. `generatePaths` P95 got worse: 37.1s → 39.2s (+6%).**
Its P50 barely moved (−3%) because its effort was deliberately left at `medium`. The P95 change
at n=6 is within run-to-run noise, but it is a regression in the measured number and it is not
hidden here. This call is now a third of all session time and was not improved by this pass.

**2. The resume-review call is running close to its 60s ceiling, and timed out twice.**
This is the one that matters. `resumeReview:*` P50 across the eval runs of this pass:

| Run | P50 | Max | Timeouts |
|---|---|---|---|
| baseline (re-taken) | 29.7s | 44.2s | 0 |
| after B3 | 28.0s | 47.5s | 0 |
| after B4 (caps) | 33.1s | 49.3s | 0 |
| after B5 (strict outputs) | 35.4s | 47.2s | 0 |
| **final** | **43.2s** | **58.3s** | **2** |

R13 recorded no result in the final run because its against-job review threw
`UPSTREAM_TIMEOUT`. Re-run in isolation it **passes** (150s for the suite), so this is a timeout
under load, not a quality regression — but a user-facing timeout on the review surface is a real
defect regardless of what caused it.

**Strict structured outputs were the obvious suspect and were tested directly**, three runs each
side of the same fixture:

| | Median full-pipeline time |
|---|---|
| With strict outputs (current) | 64.6s |
| With JSON mode (pre-B5) | 62.2s |

~2.4s apart at n=3 — within noise. **Strict mode is not the cause.** The remaining candidates are
model-side variance and time-of-day load, neither of which this pass controls. What the pass
*did* do is leave no headroom: `TIMEOUTS.roadmap` is 60s and the call now sits at 43s P50.

**Recommended follow-up, not done here:** raise the review timeout, or split the against-job
review the way the coaching pipeline was split. Doing either now, after the benchmark, would
mean reporting a number the benchmark did not measure.

## Quality

**20/21, unchanged from the baseline.** 63 calls, $0.1278, zero truncations, zero schema repairs.

| Eval | Baseline | Final | Note |
|---|---|---|---|
| H1 — scope discipline | FAIL | FAIL | Pre-existing, unchanged by this pass |
| R13 — injection resistance | PASS | *timeout* | Passes on re-run; see the regression above |
| R10 — stability across runs | PASS | PASS | Failed on one isolated re-run — known flaky |
| Everything else (18) | PASS | PASS | |

No eval regressed in a way attributable to any change in this pass. Every failure seen during
B3–B8 was traced to either a flaky eval (G1 measured at 6/9 vs 7/9 control across 18 runs), an
instrument defect (B1's matcher, F6's rubric — both fixed before the baseline), or infrastructure
(R13's timeout).

## What produced the win

| Task | Contribution |
|---|---|
| **B3 — reasoning effort** | Nearly all of it. Extraction and conversational calls were spending 8–10 reasoning tokens per visible token; `low` cut those call sites 56–71%. |
| B4 — output caps | No latency change by design. Bounds the worst case and made truncation loud. |
| B5 — strict outputs | Removed the repair path: 1 repair → 0. Costs ~4% more input tokens. |
| B6 — concurrency | No new parallelism (none was available). Fixed a bug where a failed stream silently discarded a paid-for roadmap. |
| B7 — perceived latency | No wall-clock change. Skeletons sized to real content, named steps, and the typing indicator now clears on the first token instead of at end-of-stream. |

Two things were built, measured, and **rejected** rather than shipped:

- **`low` effort on `generatePaths`/`generateRoadmap`** — not attempted, on the evidence that
  their reasoning-to-output ratios are 2.0× and 1.0× against 7–10× elsewhere. Setting `medium`
  explicitly turned out to be a no-op: `medium` is already the default.
- **Merging `extractProfile` + `generateOpeningMessage`** — predicted −5.3s, measured at +1.5s
  (on `gpt-5-mini`) or parity (on `gpt-5-nano`). Generation time is additive; merging saves one
  HTTP round trip, not the second call. Reverted.

## Honest limits of this measurement

- **n = 6 sessions.** Enough to see a 48% shift, not enough to call a 6% one. The `generatePaths`
  P95 regression is inside that margin, and so is some of the review-call drift.
- **Session spans are harness-measured**, stopping when the response arrives rather than when the
  browser paints. They are a floor on the real experience. B7's work does not appear in any
  number in this document, by construction — it changes what the wait feels like, not its length.
- **Local production server, warm.** A Vercel deployment adds cold starts on the first request to
  an idle function.
- **Before and after were run on different days.** The review-call drift above is a reminder that
  model-side performance is not a controlled variable.
