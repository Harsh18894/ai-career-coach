/**
 * Drives full coaching sessions through the real HTTP routes and reports what they cost in
 * time, so the latency pass has something to be judged against.
 *
 * Usage:
 *   npm run build && npm run start        # in one shell, WITHOUT Upstash configured
 *   npm run latency:baseline -- --sessions 6
 *
 * Why through the routes rather than by importing lib/ai/coach directly: the eval adapter
 * already calls the library, and library timings would omit request parsing, validation, the
 * rate-limit round trip, and serialisation. Those are small, but the whole point of a baseline
 * is that it measures the thing being shipped.
 *
 * Why the server must run WITHOUT Upstash: six scripted sessions blow straight through the
 * 5-sessions-per-hour and 60-calls-per-hour limits from Pass A, and a baseline made of 429s
 * measures the rate limiter. With Upstash unset those checks are skipped (see lib/rate-limit.ts)
 * while telemetry still logs every call, which is what the report reads.
 *
 * The session spans this posts are labelled `source: 'harness'`, because they stop when the
 * response arrives rather than when a browser has painted. They are a floor on the real
 * experience, not the real experience.
 */

import { SAMPLE_PROFILES } from '../lib/samples';
import type { Profile, CareerPath } from '../lib/ai/schemas';
import type { UserSignals } from '../lib/state/conversation';

try {
  process.loadEnvFile(new URL('../.env.local', import.meta.url).pathname);
} catch {
  /* CI provides env directly */
}

const BASE_URL = process.env.BASELINE_BASE_URL ?? 'http://localhost:3000';

/** Two passes over the three sample profiles by default: five is the stated minimum, and six
 * gives two independent observations per profile rather than leaving one profile as an n=1
 * outlier that the percentiles then inherit. */
const DEFAULT_SESSIONS = 6;

const INITIAL_SIGNALS: UserSignals = {
  intentGuess: 'unknown',
  motivations: [],
  constraints: [],
  rejectedDirections: [],
  knownSkills: [],
  knownDomains: [],
  country: null,
  notes: [],
  readyForRecommendation: false,
  hasUsableInfo: true,
};

/**
 * What the scripted candidate says.
 *
 * Chosen to clear the recommendation gates honestly — a concrete skill/domain plus a real sense
 * of direction — because a session that stalls in UNDERSTANDING never reaches generatePaths or
 * generateRoadmap, and those are two of the three most expensive call sites. A baseline that
 * silently skipped them would understate the thing being optimised.
 */
const REPLIES = [
  "I'm a backend engineer and I want to move toward platform and infrastructure work. I know Go and Kubernetes reasonably well, and I want more ownership of systems end to end rather than shipping features off a board.",
  "Staying at my current company is fine if the scope changes, but I'd move for the right platform role. What I'm optimising for is depth and ownership, not title or salary.",
];

type Headers = Record<string, string>;

function headersFor(sessionId: string, sampleId: string): Headers {
  return {
    'Content-Type': 'application/json',
    // The origin check from Pass A rejects requests without one; this is the same value a
    // browser on the dev server would send.
    Origin: BASE_URL,
    'x-hachi-session-id': sessionId,
    'x-hachi-sample': '1',
    'x-hachi-sample-id': sampleId,
  };
}

async function postJson<T>(path: string, body: unknown, headers: Headers): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

/** Consumes a streamed response to completion. The text is discarded — the measurement that
 * matters (TTFT) is taken server-side in lib/telemetry.ts — but the stream must be drained or
 * the record is never emitted. */
async function drainStream(path: string, body: unknown, headers: Headers): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    throw new Error(`${path} -> ${response.status}`);
  }
  const reader = response.body.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function postSpan(
  span: 'intake_to_first_paths' | 'lock_to_roadmap',
  durationMs: number,
  headers: Headers
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/journey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ span, durationMs: Math.round(durationMs), source: 'harness' }),
    });
  } catch {
    /* A lost timing ping must not fail the run that produced it. */
  }
}

type SessionResult = {
  sessionId: string;
  sampleId: string;
  intakeToPathsMs: number | null;
  lockToRoadmapMs: number | null;
  note?: string;
};

async function runSession(sampleId: string, resumeText: string, index: number): Promise<SessionResult> {
  const sessionId = `baseline-${sampleId}-${index}`;
  const headers = headersFor(sessionId, sampleId);
  const result: SessionResult = { sessionId, sampleId, intakeToPathsMs: null, lockToRoadmapMs: null };

  const intakeStart = Date.now();

  // 1. Intake. The paste-text entry point, which is what the sample buttons use.
  const parsed = await postJson<{ profile?: Profile; insufficientInfo?: boolean }>(
    '/api/parse-resume',
    { text: resumeText },
    headers
  );
  if (!parsed.profile) {
    return { ...result, note: 'intake produced no profile' };
  }
  const profile = parsed.profile;

  // 2. The personalised opener.
  await postJson('/api/generate-opener', { profile }, headers);

  // 3-5. Two conversational turns, each followed by the signal analysis that feeds the gates.
  let signals = INITIAL_SIGNALS;
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'assistant', content: 'What do you want your next move to be?' },
  ];

  for (const reply of REPLIES) {
    messages.push({ role: 'user', content: reply });

    const analyzed = await postJson<{ signals: UserSignals }>(
      '/api/coach',
      { action: 'analyze', messages, signals },
      headers
    );
    signals = analyzed.signals;

    const turn = await postJson<{ message: string }>(
      '/api/coach',
      { action: 'understanding-turn', messages, profile, signals },
      headers
    );
    messages.push({ role: 'assistant', content: turn.message });
  }

  // 6. Recommend. `needsCountry` is a legitimate detour for a multi-country resume rather than
  // a failure, so it is answered and retried the way the UI answers it.
  let deck = await postJson<{
    paths?: CareerPath[];
    needsCountry?: boolean;
    detectedCountries?: string[];
    notReady?: boolean;
  }>('/api/coach', { action: 'recommend', profile, signals }, headers);

  if (deck.needsCountry) {
    signals = { ...signals, country: deck.detectedCountries?.[0] ?? 'United States' };
    deck = await postJson('/api/coach', { action: 'recommend', profile, signals }, headers);
  }

  if (!deck.paths?.length) {
    // Reported rather than retried into submission: a gate holding is real coach behaviour,
    // and quietly hammering it until it yields would produce a baseline of a session nobody
    // has.
    return { ...result, note: deck.notReady ? 'recommendation gate held' : 'no paths returned' };
  }

  result.intakeToPathsMs = Date.now() - intakeStart;
  await postSpan('intake_to_first_paths', result.intakeToPathsMs, headers);

  // 7. Lock a path. The UI fires the roadmap request and streams the closing reflection at the
  // same time, so the baseline does too — measuring them sequentially would invent a wait that
  // the product does not have.
  const chosenPath = deck.paths[0];
  const lockStart = Date.now();

  const roadmapPromise = postJson<{ roadmap: unknown }>(
    '/api/coach',
    { action: 'roadmap', profile, chosenPath, signals },
    headers
  );

  const closingPromise = drainStream(
    '/api/coach',
    {
      action: 'chat',
      messages,
      profile,
      signals,
      turn: { kind: 'path_locked', chosenPath },
    },
    headers
  );

  const [roadmapOutcome] = await Promise.allSettled([roadmapPromise, closingPromise]);
  if (roadmapOutcome.status === 'rejected') {
    return { ...result, note: `roadmap failed: ${String(roadmapOutcome.reason).slice(0, 120)}` };
  }

  result.lockToRoadmapMs = Date.now() - lockStart;
  await postSpan('lock_to_roadmap', result.lockToRoadmapMs, headers);

  return result;
}

function argValue(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main(): Promise<void> {
  const sessionCount = argValue('sessions', DEFAULT_SESSIONS);

  console.log(`Baseline: ${sessionCount} sessions against ${BASE_URL}`);
  console.log('Server must be running WITHOUT Upstash configured, or the rate limiter will');
  console.log('turn this into a measurement of itself.\n');

  const results: SessionResult[] = [];

  for (let i = 0; i < sessionCount; i += 1) {
    const sample = SAMPLE_PROFILES[i % SAMPLE_PROFILES.length];
    process.stdout.write(`[${i + 1}/${sessionCount}] ${sample.id} … `);
    const startedAt = Date.now();
    try {
      const result = await runSession(sample.id, sample.resumeText, i);
      results.push(result);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        result.note
          ? `${result.note} (${elapsed}s)`
          : `intake→paths ${(result.intakeToPathsMs! / 1000).toFixed(1)}s, lock→roadmap ${(result.lockToRoadmapMs! / 1000).toFixed(1)}s (${elapsed}s total)`
      );
    } catch (error) {
      console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        sessionId: `baseline-${sample.id}-${i}`,
        sampleId: sample.id,
        intakeToPathsMs: null,
        lockToRoadmapMs: null,
        note: 'request failed',
      });
    }
  }

  const complete = results.filter((r) => r.intakeToPathsMs !== null && r.lockToRoadmapMs !== null);
  console.log(`\n${complete.length}/${results.length} sessions completed end to end.`);
  console.log('Now aggregate the server log:  npm run latency:report -- <logfile>');
}

main().catch((error) => {
  console.error('[latency-baseline] failed:', error);
  process.exit(1);
});
