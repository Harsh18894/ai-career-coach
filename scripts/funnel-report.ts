/**
 * Reads the funnel out of the structured log stream.
 *
 * Usage:
 *   npm run funnel:report -- <logfile> [more...]
 *   vercel logs --json | npm run funnel:report
 *
 * This is what replaces a hosted analytics dashboard. The trade is deliberate — see the header
 * of lib/analytics.ts — and this script is the other half of it: without something that turns
 * the log lines into drop-off, the events would be write-only.
 */

import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { FUNNEL_EVENTS, type FunnelEvent } from '../lib/analytics-events';

type FunnelLine = {
  event: 'funnel';
  sessionId?: string;
  step?: string;
  path?: string;
  turn?: number;
  errorCode?: string;
  answer?: string;
  referrerHost?: string;
  msToFirstCta?: number;
};

/** The ordered funnel. Everything else is reported separately rather than being forced into a
 * sequence it does not belong to. */
const STEPS: FunnelEvent[] = [
  'landing_view',
  'sample_cta_click',
  'upload_cta_click',
  'profile_parsed',
  'first_coach_message',
  'chat_turn',
  'deck_shown',
  'path_locked',
  'roadmap_viewed',
];

type Report = {
  /** Sessions that reached each step at least once. Counting sessions rather than events is what
   * makes the numbers a funnel — a chat_turn fired five times by one person is one person. */
  reached: Map<string, Set<string>>;
  byPath: Map<string, Map<string, Set<string>>>;
  referrers: Map<string, Set<string>>;
  ctaTimings: number[];
  feedback: Map<string, number>;
  errors: Map<string, number>;
  lines: number;
};

function newReport(): Report {
  return {
    reached: new Map(),
    byPath: new Map(),
    referrers: new Map(),
    ctaTimings: [],
    feedback: new Map(),
    errors: new Map(),
    lines: 0,
  };
}

function ingest(report: Report, raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return;
  }

  const line = parsed as Partial<FunnelLine> & { event?: string };
  if (line.event !== 'funnel' || !line.step) return;

  report.lines += 1;
  const session = line.sessionId ?? 'unattributed';

  const set = report.reached.get(line.step) ?? new Set<string>();
  set.add(session);
  report.reached.set(line.step, set);

  if (line.path) {
    const perPath = report.byPath.get(line.path) ?? new Map<string, Set<string>>();
    const stepSet = perPath.get(line.step) ?? new Set<string>();
    stepSet.add(session);
    perPath.set(line.step, stepSet);
    report.byPath.set(line.path, perPath);
  }

  if (line.referrerHost) {
    const refs = report.referrers.get(line.referrerHost) ?? new Set<string>();
    refs.add(session);
    report.referrers.set(line.referrerHost, refs);
  }

  if (typeof line.msToFirstCta === 'number') report.ctaTimings.push(line.msToFirstCta);
  if (line.answer) report.feedback.set(line.answer, (report.feedback.get(line.answer) ?? 0) + 1);
  if (line.step === 'client_error' || line.step === 'rate_limited' || line.step === 'budget_exceeded') {
    const key = `${line.step}${line.errorCode ? ` (${line.errorCode})` : ''}`;
    report.errors.set(key, (report.errors.get(key) ?? 0) + 1);
  }
}

function table(rows: string[][]): string {
  if (!rows.length) return '';
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  const line = (r: string[]) => `| ${r.map((c, i) => (c ?? '').padEnd(w[i])).join(' | ')} |`;
  return [line(rows[0]), `|${w.map((n) => '-'.repeat(n + 2)).join('|')}|`, ...rows.slice(1).map(line)].join('\n');
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function render(report: Report): string {
  if (report.lines === 0) return 'No funnel events found. Check the log contains lines with "event":"funnel".';

  const out: string[] = ['## Funnel', ''];
  const top = report.reached.get('landing_view')?.size ?? 0;

  const rows = [['Step', 'Sessions', '% of landing', 'Drop from previous']];
  let previous = 0;
  for (const step of STEPS) {
    const n = report.reached.get(step)?.size ?? 0;
    if (n === 0 && previous === 0) continue;
    const pct = top ? `${((n / top) * 100).toFixed(0)}%` : '—';
    const drop = previous > 0 ? `${(((previous - n) / previous) * 100).toFixed(0)}%` : '—';
    rows.push([step, String(n), pct, drop]);
    previous = n;
  }
  out.push(table(rows), '');

  if (report.byPath.size) {
    out.push('## By intake path', '');
    const paths = [...report.byPath.keys()];
    const header = ['Step', ...paths];
    const pathRows = [header];
    for (const step of STEPS) {
      const cells = paths.map((p) => String(report.byPath.get(p)?.get(step)?.size ?? 0));
      if (cells.every((c) => c === '0')) continue;
      pathRows.push([step, ...cells]);
    }
    out.push(table(pathRows), '');
  }

  if (report.referrers.size) {
    out.push('## Referrers', '');
    out.push(
      table([
        ['Host', 'Sessions'],
        ...[...report.referrers.entries()]
          .sort((a, b) => b[1].size - a[1].size)
          .map(([host, set]) => [host, String(set.size)]),
      ]),
      ''
    );
  }

  out.push('## Engagement', '');
  out.push(
    table([
      ['Metric', 'Value'],
      ['Median time to first CTA', report.ctaTimings.length ? `${(median(report.ctaTimings) / 1000).toFixed(1)}s` : '—'],
      ['Feedback: useful', String(report.feedback.get('useful') ?? 0)],
      ['Feedback: partly', String(report.feedback.get('partly') ?? 0)],
      ['Feedback: not useful', String(report.feedback.get('not_useful') ?? 0)],
    ]),
    ''
  );

  if (report.errors.size) {
    out.push('## Errors and limits', '');
    out.push(
      table([
        ['Event', 'Count'],
        ...[...report.errors.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)]),
      ])
    );
  }

  return out.join('\n');
}

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const report = newReport();
  const sources: NodeJS.ReadableStream[] = files.length
    ? files.map((f) => createReadStream(f))
    : [process.stdin as unknown as Readable];

  for (const source of sources) {
    const rl = createInterface({ input: source, crlfDelay: Infinity });
    for await (const line of rl) ingest(report, line);
  }

  // Referenced so an event added to the union without a place in STEPS is a visible omission
  // rather than a silently missing row.
  const unplaced = FUNNEL_EVENTS.filter(
    (e) => !STEPS.includes(e) && !['session_feedback', 'client_error', 'rate_limited', 'budget_exceeded'].includes(e)
  );

  process.stdout.write(`${render(report)}\n`);
  if (unplaced.length) {
    process.stdout.write(`\n_Not placed in the funnel: ${unplaced.join(', ')}_\n`);
  }
}

main().catch((error) => {
  console.error('[funnel-report] failed:', error);
  process.exit(1);
});
