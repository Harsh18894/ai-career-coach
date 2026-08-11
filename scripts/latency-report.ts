/**
 * Aggregates the structured log stream into the latency picture Pass B is judged against.
 *
 * Usage:
 *   npm run latency:report -- <logfile> [more logfiles...]
 *   vercel logs --json | npm run latency:report
 *   npm run latency:report -- run.log --markdown > evals/baselines/latency-before.md
 *
 * Reads NDJSON, ignores anything that is not one of ours, and reports:
 *
 *   - per call site: count, TTFT and total-duration percentiles, token percentiles
 *   - session roll-ups: the two browser-measured spans from lib/journey.ts
 *
 * Why both halves matter, and why neither is sufficient alone: per-call numbers tell you where
 * the model time goes, which is what you optimise. Session spans tell you what a person waited
 * for, which is what you are optimising FOR. A change that halves generatePaths and leaves the
 * session span untouched has optimised something nobody was waiting on.
 *
 * P95 output tokens per call site is here because Task B4 sets its caps from it. Reading them
 * off this table is the whole point — a cap chosen from intuition is a truncation waiting to
 * happen.
 */

import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

/* =====================================================================================
 * Records
 * ===================================================================================== */

type LlmCallLine = {
  event: 'llm_call';
  sessionId?: string;
  call: string;
  model: string;
  streamed?: boolean;
  ok?: boolean;
  durationMs?: number;
  ttftMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  reasoningEffort?: string;
  maxOutputTokens?: number;
  finishReason?: string;
  isSample?: boolean;
};

type JourneyLine = {
  event: 'journey_span';
  sessionId?: string;
  span: string;
  durationMs: number;
};

/* =====================================================================================
 * Statistics
 * ===================================================================================== */

/**
 * Nearest-rank percentile on a sorted array.
 *
 * Nearest-rank rather than interpolated on purpose: every value here is a real measurement of
 * a real call, and at the sample sizes this script runs on (tens of calls per site, not
 * thousands) an interpolated P95 invents a number that never happened. Reporting "the 95th
 * percentile call took 8,412ms" is defensible; reporting 8,406.5ms is not.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

type Stats = { count: number; p50: number; p95: number; max: number };

function statsOf(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

/* =====================================================================================
 * Accumulation
 * ===================================================================================== */

type CallSiteBucket = {
  call: string;
  models: Set<string>;
  efforts: Set<string>;
  streamed: boolean;
  durations: number[];
  ttfts: number[];
  promptTokens: number[];
  outputTokens: number[];
  reasoningTokens: number[];
  cachedTokens: number[];
  costs: number[];
  failures: number;
  truncations: number;
};

function emptyBucket(call: string): CallSiteBucket {
  return {
    call,
    models: new Set(),
    efforts: new Set(),
    streamed: false,
    durations: [],
    ttfts: [],
    promptTokens: [],
    outputTokens: [],
    reasoningTokens: [],
    cachedTokens: [],
    costs: [],
    failures: 0,
    truncations: 0,
  };
}

type Report = {
  callSites: Map<string, CallSiteBucket>;
  spans: Map<string, number[]>;
  sessions: Set<string>;
  sessionCosts: Map<string, number>;
  totalLines: number;
};

function newReport(): Report {
  return {
    callSites: new Map(),
    spans: new Map(),
    sessions: new Set(),
    sessionCosts: new Map(),
    totalLines: 0,
  };
}

function ingest(report: Report, raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Vercel interleaves plain text with JSON lines; skipping non-JSON is expected, not an
    // error worth reporting.
    return;
  }

  // A permissive shape rather than `Partial<LlmCallLine & JourneyLine>`: intersecting the two
  // gives `event: 'llm_call' & 'journey_span'`, which is `never`, which collapses the whole
  // object. Each branch below narrows on `event` before touching its own fields.
  const line = parsed as Partial<Omit<LlmCallLine, 'event'>> &
    Partial<Omit<JourneyLine, 'event'>> & { event?: string };

  if (line.event === 'llm_call' && typeof line.call === 'string') {
    report.totalLines += 1;
    const bucket = report.callSites.get(line.call) ?? emptyBucket(line.call);

    if (line.model) bucket.models.add(line.model);
    // 'default' names the real state of an unset parameter, so the effort column never has a
    // blank that could be read as "not measured".
    bucket.efforts.add(line.reasoningEffort ?? 'default');
    if (line.streamed) bucket.streamed = true;

    if (line.ok === false) {
      bucket.failures += 1;
    } else {
      // Failed calls are counted but kept OUT of the latency percentiles: a call that timed
      // out at 60s is a 60s measurement of the timeout, not of the model, and mixing them
      // makes a P95 that describes neither.
      if (typeof line.durationMs === 'number') bucket.durations.push(line.durationMs);
      if (typeof line.ttftMs === 'number') bucket.ttfts.push(line.ttftMs);
      if (typeof line.promptTokens === 'number') bucket.promptTokens.push(line.promptTokens);
      if (typeof line.cachedTokens === 'number') bucket.cachedTokens.push(line.cachedTokens);
      if (typeof line.reasoningTokens === 'number') bucket.reasoningTokens.push(line.reasoningTokens);
      if (typeof line.estimatedCostUsd === 'number') bucket.costs.push(line.estimatedCostUsd);

      // Prefer the explicit visible-output count; fall back to completionTokens for lines
      // written before that field existed, so old baselines stay comparable.
      const output =
        typeof line.outputTokens === 'number'
          ? line.outputTokens
          : typeof line.completionTokens === 'number'
            ? line.completionTokens
            : undefined;
      if (output !== undefined) bucket.outputTokens.push(output);
    }

    if (line.finishReason === 'length') bucket.truncations += 1;

    report.callSites.set(line.call, bucket);

    if (line.sessionId && line.sessionId !== 'unattributed') {
      report.sessions.add(line.sessionId);
      if (typeof line.estimatedCostUsd === 'number') {
        report.sessionCosts.set(
          line.sessionId,
          (report.sessionCosts.get(line.sessionId) ?? 0) + line.estimatedCostUsd
        );
      }
    }
    return;
  }

  if (line.event === 'journey_span' && typeof line.span === 'string' && typeof line.durationMs === 'number') {
    report.totalLines += 1;
    const existing = report.spans.get(line.span) ?? [];
    existing.push(line.durationMs);
    report.spans.set(line.span, existing);
    if (line.sessionId && line.sessionId !== 'unattributed') report.sessions.add(line.sessionId);
  }
}

/* =====================================================================================
 * Rendering
 * ===================================================================================== */

function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function table(rows: string[][]): string {
  if (rows.length === 0) return '';
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  const line = (r: string[]) => `| ${r.map((c, i) => (c ?? '').padEnd(widths[i])).join(' | ')} |`;
  const divider = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`;
  return [line(rows[0]), divider, ...rows.slice(1).map(line)].join('\n');
}

function render(report: Report): string {
  const out: string[] = [];

  if (report.totalLines === 0) {
    return 'No llm_call or journey_span records found.\n\nCheck that the log file contains the JSON lines emitted by lib/telemetry.ts.';
  }

  const buckets = [...report.callSites.values()].sort(
    (a, b) => sum(b.durations) - sum(a.durations)
  );

  out.push('## Per call site');
  out.push('');
  out.push(
    'Ordered by TOTAL time contributed, not by P50. A 900ms call made nine times a session ' +
      'costs a user more than a 6s call made once, and optimising the slow-looking one first is ' +
      'how a latency pass ends with nothing to show.'
  );
  out.push('');

  const totalAll = buckets.reduce((acc, b) => acc + sum(b.durations), 0);

  out.push(
    table([
      ['Call site', 'n', 'Model', 'Effort', 'Total', '% time', 'TTFT p50', 'TTFT p95', 'Dur p50', 'Dur p95', 'Dur max', 'Out p95', 'Reason p95', 'Cached p50', 'Fail', 'Trunc'],
      ...buckets.map((b) => {
        const dur = statsOf(b.durations);
        const ttft = statsOf(b.ttfts);
        const outTok = statsOf(b.outputTokens);
        const reasonTok = statsOf(b.reasoningTokens);
        const cached = statsOf(b.cachedTokens);
        const total = sum(b.durations);
        return [
          b.call,
          String(dur.count),
          [...b.models].join(','),
          [...b.efforts].join(','),
          ms(total),
          totalAll ? `${((total / totalAll) * 100).toFixed(0)}%` : '—',
          b.ttfts.length ? ms(ttft.p50) : '—',
          b.ttfts.length ? ms(ttft.p95) : '—',
          ms(dur.p50),
          ms(dur.p95),
          ms(dur.max),
          String(outTok.p95),
          String(reasonTok.p95),
          String(cached.p50),
          b.failures ? String(b.failures) : '—',
          b.truncations ? String(b.truncations) : '—',
        ];
      }),
    ])
  );
  out.push('');

  out.push('## Session roll-ups');
  out.push('');
  out.push('What a person actually waited for, measured in the browser at the moment the content was on screen.');
  out.push('');

  const spanLabels: Record<string, string> = {
    intake_to_first_paths: 'Resume upload → first path card',
    lock_to_roadmap: 'Path lock → roadmap rendered',
  };

  const spanRows = [...report.spans.entries()].map(([span, values]) => {
    const s = statsOf(values);
    return [spanLabels[span] ?? span, String(s.count), ms(s.p50), ms(s.p95), ms(s.max)];
  });

  if (spanRows.length === 0) {
    out.push(
      '_No journey_span records in this log._ These are emitted by the browser, so they are ' +
        'absent from any run driven by scripts or the eval harness rather than by a real ' +
        'session in a browser. Per-call numbers above are still valid.'
    );
  } else {
    out.push(table([['Span', 'n', 'P50', 'P95', 'Max'], ...spanRows]));
  }
  out.push('');

  out.push('## Sessions');
  out.push('');
  const costs = [...report.sessionCosts.values()];
  const costStats = statsOf(costs);
  out.push(
    table([
      ['Metric', 'Value'],
      ['Sessions observed', String(report.sessions.size)],
      ['LLM calls', String(buckets.reduce((a, b) => a + b.durations.length + b.failures, 0))],
      ['Calls per session', report.sessions.size ? (buckets.reduce((a, b) => a + b.durations.length, 0) / report.sessions.size).toFixed(1) : '—'],
      ['Cost per session p50', costs.length ? `$${costStats.p50.toFixed(4)}` : '—'],
      ['Cost per session p95', costs.length ? `$${costStats.p95.toFixed(4)}` : '—'],
      ['Total model time', ms(totalAll)],
    ])
  );

  const truncated = buckets.filter((b) => b.truncations > 0);
  if (truncated.length > 0) {
    out.push('');
    out.push('## ⚠ Truncations');
    out.push('');
    out.push('Responses that stopped on the length limit. Any non-zero count here is a bug, not a statistic.');
    out.push('');
    out.push(table([['Call site', 'Count'], ...truncated.map((b) => [b.call, String(b.truncations)])]));
  }

  return out.join('\n');
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/* =====================================================================================
 * Entry point
 * ===================================================================================== */

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const report = newReport();

  const sources: NodeJS.ReadableStream[] = files.length
    ? files.map((f) => createReadStream(f))
    : [process.stdin as unknown as Readable];

  for (const source of sources) {
    const rl = createInterface({ input: source, crlfDelay: Infinity });
    for await (const line of rl) ingest(report, line);
  }

  process.stdout.write(`${render(report)}\n`);
}

main().catch((error) => {
  console.error('[latency-report] failed:', error);
  process.exit(1);
});
