/**
 * The routes Vercel BotId protects — the one list, read by the client component that arms them
 * and by the test that keeps it honest.
 *
 * BotId's client-side protection is PER ROUTE: the browser only attaches a signal to paths named
 * here, and `checkBotId()` on a route missing from this list sees no signal and classifies the
 * request as a bot. So an expensive route absent from this array does not quietly go unprotected
 * — it breaks, loudly, for real users. That failure mode is why this is a shared constant rather
 * than an array typed out inside a JSX prop.
 *
 * WHAT IS ON THE LIST: everything that spends money. Every route that reaches a model, plus the
 * one that makes a server-side fetch on a user-supplied URL.
 *
 * WHAT IS DELIBERATELY NOT: /api/events, /api/journey and /api/review-feedback. They reach no
 * model and make no outbound call, so there is no spend to protect. They are also fire-and-
 * forget beacons sent several times per session — putting a network-bound classification in
 * front of them would add latency to every funnel step and create a failure mode on a path whose
 * first rule is that it must never be able to fail a user's session. They keep their per-IP rate
 * limits, which is the proportionate control for "writes a log line".
 */
export type ProtectedRoute = {
  path: string;
  method: string;
};

export const BOTID_PROTECTED_ROUTES: ProtectedRoute[] = [
  // --- The coaching conversation ---
  /** Session start (resume parse) and every chat turn, path deck and roadmap after it. */
  { path: '/api/parse-resume', method: 'POST' },
  { path: '/api/generate-opener', method: 'POST' },
  { path: '/api/coach', method: 'POST' },

  // --- The resume review ---
  { path: '/api/resume-review/prepare', method: 'POST' },
  { path: '/api/resume-review', method: 'POST' },
  { path: '/api/resume-review/against-job', method: 'POST' },

  /** No model, but it makes an outbound fetch to a URL the caller chose — so it is both a cost
   * and the SSRF surface guarded in lib/job-ingest. */
  { path: '/api/job-description', method: 'POST' },
];
