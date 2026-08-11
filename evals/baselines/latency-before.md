# Latency baseline — before Pass B

Captured 2026-08-12, before any optimisation. Every later task in this pass is judged against
this file and against `quality-before.md`.

**How it was produced**

```
npm run build && npm run start     # Upstash deliberately unconfigured
npm run latency:baseline -- --sessions 6
npm run latency:report -- <server log>   # raw log committed as latency-before.log
```

Six sessions, two full passes over the three sample profiles, driven through the real HTTP
routes by `scripts/latency-baseline.ts`. All six reached a path deck and a roadmap.

Three things about the method worth knowing before reading the numbers:

- **Rate limiting was off.** Six scripted sessions exceed Pass A's 5-sessions-per-hour and
  60-calls-per-hour limits, and a baseline containing 429s would be a measurement of the rate
  limiter. Upstash was unset for the run, which disables those checks while leaving telemetry
  intact.
- **Session spans are `harness`-measured, not browser-measured.** They stop when the response
  arrived, not when React painted. They are a floor on the real wait. The report labels the
  provenance rather than blending the two.
- **No cold-start effects.** A local production server, warm. A Vercel deployment will be worse
  on the first request of an idle function, not better.

---

## Per call site

| Call site | n | Model | Effort | Total | % time | TTFT p50 | TTFT p95 | Dur p50 | Dur p95 | Dur max | Out p95 | Reason p95 | Cached p50 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| generateRoadmap | 6 | gpt-5-mini | default | 216.0s | 22% | — | — | 33.9s | 51.5s | 51.5s | 1807 | 1728 | 0 |
| generatePaths | 6 | gpt-5-mini | default | 192.6s | 20% | — | — | 30.3s | 37.1s | 37.1s | 1007 | 2048 | 0 |
| extractProfile | 6 | gpt-5-nano | default | 160.5s | 17% | — | — | 24.9s | 34.7s | 34.7s | 541 | 4288 | 0 |
| analyzeSignals | 12 | gpt-5-nano | default | 146.4s | 15% | — | — | 10.7s | 17.1s | 17.1s | 226 | 2304 | 0 |
| generateUnderstandingTurn | 12 | gpt-5-mini | default | 107.9s | 11% | — | — | 8.0s | 14.2s | 14.2s | 129 | 1216 | 0 |
| generateOpeningMessage | 6 | gpt-5-mini | default | 72.8s | 8% | — | — | 10.2s | 14.6s | 14.6s | 157 | 1152 | 0 |
| streamChatTurn | 6 | gpt-5-mini | default | 48.2s | 5% | 7.1s | 8.9s | 7.9s | 9.5s | 9.5s | 81 | 704 | 0 |
| generatePaths:repair | 1 | gpt-5-mini | default | 19.2s | 2% | — | — | 19.2s | 19.2s | 19.2s | 944 | 576 | 1920 |

Ordered by total time contributed, not by P50 — `analyzeSignals` looks cheap at 10.7s and is
the fourth-largest consumer because it runs twice a session.

Zero truncations. Zero failed calls.

## Session roll-ups

| Span | Measured | n | P50 | P95 | Max |
|---|---|---|---|---|---|
| Resume upload → first path card | harness | 6 | **109.8s** | **142.1s** | 142.1s |
| Path lock → roadmap rendered | harness | 6 | **34.0s** | **51.5s** | 51.5s |

## Sessions

| Metric | Value |
|---|---|
| Sessions | 6 |
| LLM calls | 55 |
| Calls per session | 9.2 |
| Cost per session p50 | $0.0243 |
| Cost per session p95 | $0.0287 |
| Total model time | 963.7s |

---

## What the data says

**1. The product is unusably slow, and it is not close.** A user waits **110 seconds at the
median** between handing over their resume and seeing a recommendation, and **142s at P95**.
Nothing else in this document matters as much as that number.

**2. Reasoning tokens are not a contributing factor — they are the whole thing.**

| Call site | Reasoning p95 | Visible output p95 | Ratio |
|---|---|---|---|
| extractProfile | 4,288 | 541 | **7.9×** |
| analyzeSignals | 2,304 | 226 | **10.2×** |
| generatePaths | 2,048 | 1,007 | 2.0× |
| generateRoadmap | 1,728 | 1,807 | 1.0× |
| generateUnderstandingTurn | 1,216 | 129 | **9.4×** |
| generateOpeningMessage | 1,152 | 157 | **7.3×** |
| streamChatTurn | 704 | 81 | **8.7×** |

The two worst offenders are `extractProfile` and `analyzeSignals` — both `gpt-5-nano`, both
producing structured data judged by schema conformance, both spending eight to ten tokens
thinking for every token they emit. These are precisely the call sites B3 identifies as lowest
risk, and together they are **32% of all model time**.

**3. Streaming currently buys almost nothing.** `streamChatTurn` has a TTFT of 7.1s against a
total duration of 7.9s. The model reasons in silence for seven seconds and then delivers the
entire reply in under a second. The stream is real, but there is nothing to stream until the
thinking stops — so the user experiences it as a hang, not as a response arriving.

**4. Prompt caching is completely unclaimed — with one accidental proof that it works.**
`cachedTokens` is **0 at every call site except `generatePaths:repair`, which recorded 1,920**.
The repair path re-sends the original messages verbatim with the failed output appended, which
is exactly the stable-prefix shape OpenAI caches. So the mechanism demonstrably works against
this app's prompts; nothing is currently arranged to trigger it. That is B5's target, and this
row is the evidence that it is worth doing.

**5. One schema repair fired in six sessions.** `generatePaths` returned output that failed
validation once and cost an extra 19.2s to fix. A ~17% repair rate on the single most
product-critical call is a reliability finding, not a latency one, and it means the P95 a real
user sees is worse than the 37.1s in the table — that user waited 56s.

## What this implies for the rest of the pass

The brief anticipated that one call site might dominate and narrow the work. That is not what
happened: the top four sites are 22%, 20%, 17% and 15%, and no single fix moves the session
number much. What generalises instead is the *cause* — reasoning effort is inflating every call
site at once, so B3 is the high-leverage task and B4/B5 compound it. Per-call surgery would not
have found this.

Against the two session numbers, a 40–50% reduction in intake→paths would still leave a
55-second wait. B7's perceived-latency work is therefore not cosmetic; on these numbers it is
load-bearing.
