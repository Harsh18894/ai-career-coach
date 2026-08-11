/**
 * Baseline measurement: how many of the resource links Aria emits in a roadmap are real?
 *
 * Phase 2 intends to replace free-form, model-generated resource links with retrieval over a
 * curated catalog. That change can only be justified against a "before" number, and the
 * "before" number can only be captured before the change exists — hence this script.
 *
 * It deliberately does NOT touch the roadmap generator. The point is to record what the
 * current prompt produces, including if the answer is unflattering or simply "it emits no
 * links at all". Tuning the generator to improve the number would destroy the measurement.
 *
 * Costs real tokens. Requires --confirm. Never run this in CI.
 *
 *   npm run baseline:links -- --confirm
 *   npm run baseline:links -- --confirm --max-roadmaps 6      (cheaper, smaller sample)
 *   npm run baseline:links -- --confirm --skip-validation     (generation only, no network)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_PROFILES } from '../lib/samples';
import { extractProfile, generatePaths, generateRoadmap } from '../lib/ai/coach';
import { withTelemetryContext, readSessionCost } from '../lib/telemetry';
import { INITIAL_STATE, type UserSignals } from '../lib/state/conversation';
import type { Profile, CareerPath } from '../lib/ai/schemas';

/* =====================================================================================
 * Config
 * ===================================================================================== */

const CONFIG = {
  /** Stop generating once this many URLs have been collected. */
  targetUrlCount: 50,
  /** Hard ceiling on roadmap generations, so a zero-link run cannot bill indefinitely. */
  defaultMaxRoadmaps: 12,
  /** Per the task spec. */
  requestTimeoutMs: 8_000,
  concurrency: 4,
  outputDir: join('evals', 'baselines'),
  snapshotDir: join('evals', '.cache', 'snapshots'),
  fixtureDir: join('evals', 'fixtures', 'resumes'),
};

/* =====================================================================================
 * Arguments
 * ===================================================================================== */

const args = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (!args.includes('--confirm')) {
  console.error(
    [
      '',
      'baseline-links makes real, billable OpenAI calls (roughly $0.25-$0.50 for a full run).',
      '',
      'It generates career path decks and roadmaps across the three sample profiles and the',
      'eval fixtures, then network-validates every URL those roadmaps contain.',
      '',
      'Re-run with --confirm to proceed:',
      '',
      '  npm run baseline:links -- --confirm',
      '',
      'Note: this spend also counts against DAILY_BUDGET_USD, which is what gates the public',
      'demo. A full run can consume a noticeable share of a small daily budget.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

const maxRoadmaps = Number(flagValue('--max-roadmaps') ?? CONFIG.defaultMaxRoadmaps);
const skipValidation = args.includes('--skip-validation');

/* =====================================================================================
 * Profile sources
 * ===================================================================================== */

type ProfileSource = {
  id: string;
  origin: 'sample' | 'eval-fixture';
  profile: Profile;
  /** Paths reused from an eval snapshot, when one exists — saves a billable deck generation. */
  cachedPaths?: CareerPath[];
};

function readSnapshot<T>(name: string): T | null {
  const path = join(CONFIG.snapshotDir, `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Signals sufficient for generatePaths. The recommendation gates live in the route, not in
 * the generator, so this does not bypass anything the generator itself enforces. */
function signalsFor(profile: Profile): UserSignals {
  return {
    ...INITIAL_STATE.signals,
    intentGuess: profile.inferredPersona,
    knownSkills: profile.skills.slice(0, 5),
    knownDomains: profile.domains.slice(0, 3),
    motivations: ['wants clearer direction and stronger positioning'],
    country: profile.country ?? null,
    readyForRecommendation: true,
  };
}

async function collectProfiles(): Promise<ProfileSource[]> {
  const sources: ProfileSource[] = [];

  // Eval fixtures first: their profiles and decks are already snapshotted, so they cost nothing.
  const fixtureIds = ['R-grow-01', 'R-pivot-01', 'R-grad-01', 'R-inject-01'];
  for (const id of fixtureIds) {
    const profile = readSnapshot<Profile>(`extractProfile:${id}`);
    if (!profile) continue;

    const deckSnapshotNames = [`generatePaths:${id}:g1`, `generatePaths:${id}:c3`, `generatePaths:${id}:f6`, `generatePaths:${id}:e1-A`];
    let cachedPaths: CareerPath[] | undefined;
    for (const name of deckSnapshotNames) {
      const snapshot = readSnapshot<{ paths?: CareerPath[] } | CareerPath[]>(name);
      if (!snapshot) continue;
      cachedPaths = Array.isArray(snapshot) ? snapshot : snapshot.paths;
      if (cachedPaths?.length) break;
    }

    sources.push({ id, origin: 'eval-fixture', profile, cachedPaths });
  }

  // Samples need a live extraction — they have no snapshots.
  for (const sample of SAMPLE_PROFILES) {
    const profile = await extractProfile(sample.resumeText);
    if (!profile) {
      console.warn(`[baseline] extractProfile returned null for sample "${sample.id}" — skipping.`);
      continue;
    }
    sources.push({ id: sample.id, origin: 'sample', profile });
  }

  return sources;
}

/* =====================================================================================
 * URL extraction
 * ===================================================================================== */

/** Trailing punctuation is prose, not part of the URL. */
const URL_PATTERN = /https?:\/\/[^\s"'<>)\]}]+/g;

function extractUrls(value: unknown): string[] {
  const serialised = JSON.stringify(value) ?? '';
  const matches = serialised.match(URL_PATTERN) ?? [];
  return matches.map((url) => url.replace(/[.,;:!?)\]}]+$/, '').replace(/\\+$/, ''));
}

/**
 * A YouTube video id is always exactly 11 characters. A watch link whose id is any other
 * length cannot correspond to a real video, so it is fabricated regardless of what the
 * network says — worth flagging separately because these are the most confidently-wrong
 * links a model emits.
 */
function youtubeVerdict(url: string): { isYoutubeWatch: boolean; certainlyFabricated: boolean; videoId?: string } {
  const match = url.match(/youtube\.com\/watch\?[^#]*\bv=([^&#]+)/i);
  if (!match) return { isYoutubeWatch: false, certainlyFabricated: false };
  const videoId = match[1];
  return { isYoutubeWatch: true, certainlyFabricated: videoId.length !== 11, videoId };
}

/* =====================================================================================
 * Validation
 * ===================================================================================== */

type LinkStatus = 'ok' | 'dead' | 'timeout' | 'blocked';

type LinkResult = {
  url: string;
  domain: string;
  status: LinkStatus;
  httpStatus?: number;
  finalUrl?: string;
  isYoutubeWatch: boolean;
  certainlyFabricated: boolean;
  occurrences: number;
};

function classify(httpStatus: number): LinkStatus {
  if (httpStatus < 400) return 'ok';
  // Bot-blocking and auth walls are not evidence the resource is missing.
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return 'blocked';
  return 'dead';
}

async function validateUrl(url: string): Promise<Omit<LinkResult, 'occurrences' | 'domain'>> {
  const youtube = youtubeVerdict(url);
  const base = { url, isYoutubeWatch: youtube.isYoutubeWatch, certainlyFabricated: youtube.certainlyFabricated };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'aria-baseline-links/1.0 (link validation)' },
    });

    // Plenty of hosts reject HEAD outright; fall back before calling the link dead.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'aria-baseline-links/1.0 (link validation)' },
      });
    }

    return { ...base, status: classify(response.status), httpStatus: response.status, finalUrl: response.url };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ...base, status: aborted ? 'timeout' : 'dead' };
  } finally {
    clearTimeout(timer);
  }
}

/** Fixed-size worker pool — politeness as much as performance. */
async function validateAll(urls: string[]): Promise<Map<string, Omit<LinkResult, 'occurrences' | 'domain'>>> {
  const results = new Map<string, Omit<LinkResult, 'occurrences' | 'domain'>>();
  let cursor = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= urls.length) return;
      const url = urls[index];
      results.set(url, await validateUrl(url));
      completed++;
      process.stdout.write(`\r[baseline] validated ${completed}/${urls.length} URLs`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONFIG.concurrency, urls.length) }, worker));
  if (urls.length) process.stdout.write('\n');
  return results;
}

/* =====================================================================================
 * Run
 * ===================================================================================== */

type RoadmapRecord = {
  profileId: string;
  origin: ProfileSource['origin'];
  pathTitle: string;
  tier: string;
  totalWeeks: number;
  itemCount: number;
  urls: string[];
};

async function main(): Promise<void> {
  const startedAt = Date.now();
  const sessionId = `baseline-links-${new Date().toISOString().slice(0, 10)}-${Date.now()}`;

  console.log('[baseline] collecting profiles...');
  const sources = await withTelemetryContext(
    { sessionId, route: '/scripts/baseline-links', isSample: false },
    () => collectProfiles()
  );
  console.log(`[baseline] ${sources.length} profiles (${sources.filter((s) => s.origin === 'sample').length} samples, ${sources.filter((s) => s.origin === 'eval-fixture').length} eval fixtures)`);

  const roadmaps: RoadmapRecord[] = [];
  const allUrls: string[] = [];

  await withTelemetryContext({ sessionId, route: '/scripts/baseline-links', isSample: false }, async () => {
    for (const source of sources) {
      if (roadmaps.length >= maxRoadmaps || allUrls.length >= CONFIG.targetUrlCount) break;

      const signals = signalsFor(source.profile);
      const paths =
        source.cachedPaths?.length
          ? source.cachedPaths
          : await generatePaths(source.profile, signals, [], [], { country: source.profile.country ?? 'India' });

      for (const path of paths) {
        if (roadmaps.length >= maxRoadmaps || allUrls.length >= CONFIG.targetUrlCount) break;

        const roadmap = await generateRoadmap(source.profile, path, signals);
        const urls = extractUrls(roadmap);
        const itemCount = roadmap.phases.reduce(
          (total, phase) => total + phase.weeks.reduce((sum, week) => sum + week.items.length, 0),
          0
        );

        roadmaps.push({
          profileId: source.id,
          origin: source.origin,
          pathTitle: path.title,
          tier: path.tier,
          totalWeeks: roadmap.totalWeeks,
          itemCount,
          urls,
        });
        allUrls.push(...urls);

        console.log(
          `[baseline] ${source.id} / ${path.title} (${path.tier}) -> ${itemCount} items, ${urls.length} URLs  [running total: ${allUrls.length}]`
        );
      }
    }
  });

  const uniqueUrls = Array.from(new Set(allUrls));
  console.log(`\n[baseline] generated ${roadmaps.length} roadmaps containing ${allUrls.length} URLs (${uniqueUrls.length} unique)`);

  const validation = skipValidation ? new Map() : await validateAll(uniqueUrls);

  const occurrences = new Map<string, number>();
  for (const url of allUrls) occurrences.set(url, (occurrences.get(url) ?? 0) + 1);

  const results: LinkResult[] = uniqueUrls.map((url) => {
    const validated = validation.get(url);
    const youtube = youtubeVerdict(url);
    let domain = '(unparseable)';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* keep the placeholder */
    }
    return {
      url,
      domain,
      status: validated?.status ?? 'ok',
      httpStatus: validated?.httpStatus,
      finalUrl: validated?.finalUrl,
      isYoutubeWatch: youtube.isYoutubeWatch,
      certainlyFabricated: youtube.certainlyFabricated,
      occurrences: occurrences.get(url) ?? 0,
    };
  });

  const costUsd = (await readSessionCost(sessionId)) ?? null;
  writeArtifacts({ results, roadmaps, allUrls, startedAt, costUsd });
}

/* =====================================================================================
 * Artifacts
 * ===================================================================================== */

function writeArtifacts(input: {
  results: LinkResult[];
  roadmaps: RoadmapRecord[];
  allUrls: string[];
  startedAt: number;
  costUsd: number | null;
}): void {
  const { results, roadmaps, allUrls, startedAt, costUsd } = input;
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(CONFIG.outputDir, { recursive: true });

  const broken = results.filter((r) => r.status === 'dead' || r.status === 'timeout');
  const youtubeLinks = results.filter((r) => r.isYoutubeWatch);
  const youtubeBroken = youtubeLinks.filter(
    (r) => r.status === 'dead' || r.status === 'timeout' || r.certainlyFabricated
  );
  const domains = new Set(results.map((r) => r.domain));

  const brokenRate = results.length ? (broken.length / results.length) * 100 : 0;
  const youtubeBrokenRate = youtubeLinks.length ? (youtubeBroken.length / youtubeLinks.length) * 100 : 0;

  const topUrls = [...results].sort((a, b) => b.occurrences - a.occurrences).slice(0, 10);

  const roadmapsWithLinks = roadmaps.filter((r) => r.urls.length > 0).length;
  const totalItems = roadmaps.reduce((sum, r) => sum + r.itemCount, 0);

  const raw = {
    capturedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    estimatedCostUsd: costUsd,
    generation: {
      roadmapsGenerated: roadmaps.length,
      roadmapsContainingAtLeastOneUrl: roadmapsWithLinks,
      totalRoadmapItems: totalItems,
      totalUrls: allUrls.length,
      uniqueUrls: results.length,
      urlsPerRoadmap: roadmaps.length ? allUrls.length / roadmaps.length : 0,
    },
    validation: {
      ok: results.filter((r) => r.status === 'ok').length,
      dead: results.filter((r) => r.status === 'dead').length,
      timeout: results.filter((r) => r.status === 'timeout').length,
      blocked: results.filter((r) => r.status === 'blocked').length,
      brokenRatePercent: Number(brokenRate.toFixed(1)),
      uniqueDomains: domains.size,
      youtubeWatchLinks: youtubeLinks.length,
      youtubeBroken: youtubeBroken.length,
      youtubeBrokenRatePercent: Number(youtubeBrokenRate.toFixed(1)),
      youtubeCertainlyFabricated: youtubeLinks.filter((r) => r.certainlyFabricated).length,
    },
    links: results,
    roadmaps,
  };

  const jsonPath = join(CONFIG.outputDir, `links-${date}.json`);
  writeFileSync(jsonPath, `${JSON.stringify(raw, null, 2)}\n`);

  const md = [
    `# Resource-link baseline — ${date}`,
    '',
    'Captured from the **unmodified** roadmap generator, before any retrieval-over-a-catalog',
    'change. Method: generate roadmaps across the sample profiles and eval fixtures, extract',
    'every URL, then HEAD each one (redirects followed, 8s timeout, 4 concurrent).',
    '',
    '## Headline',
    '',
    results.length === 0
      ? `**The roadmap generator emitted no URLs at all** across ${roadmaps.length} roadmaps and ${totalItems} weekly items. There is no broken-link rate to quote, because there are no links.`
      : `**${brokenRate.toFixed(1)}% of emitted resource links are broken** (${broken.length} of ${results.length} unique URLs).`,
    '',
    '## Generation',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Roadmaps generated | ${roadmaps.length} |`,
    `| Roadmaps containing at least one URL | ${roadmapsWithLinks} |`,
    `| Total weekly items across roadmaps | ${totalItems} |`,
    `| Total URLs emitted | ${allUrls.length} |`,
    `| Unique URLs | ${results.length} |`,
    `| URLs per roadmap | ${roadmaps.length ? (allUrls.length / roadmaps.length).toFixed(2) : '0'} |`,
    `| Estimated generation cost | ${costUsd === null ? 'n/a (Redis unconfigured)' : `$${costUsd.toFixed(4)}`} |`,
    '',
    '## Link validation',
    '',
    '| Status | Count |',
    '| --- | --- |',
    `| ok | ${raw.validation.ok} |`,
    `| dead | ${raw.validation.dead} |`,
    `| timeout | ${raw.validation.timeout} |`,
    `| blocked | ${raw.validation.blocked} |`,
    '',
    `- Unique domains: **${domains.size}**`,
    `- Broken rate (dead + timeout): **${brokenRate.toFixed(1)}%**`,
    `- YouTube watch links: **${youtubeLinks.length}**, of which broken or fabricated: **${youtubeBroken.length}** (${youtubeBrokenRate.toFixed(1)}%)`,
    `- YouTube links with a video id that is not 11 characters (certainly fabricated): **${raw.validation.youtubeCertainlyFabricated}**`,
    '',
    '## Ten most frequently emitted URLs',
    '',
    topUrls.length === 0
      ? '_None — the generator emitted no URLs._'
      : ['| URL | Times | Status |', '| --- | --- | --- |', ...topUrls.map((r) => `| ${r.url} | ${r.occurrences} | ${r.status}${r.certainlyFabricated ? ' (fabricated id)' : ''} |`)].join('\n'),
    '',
  ].join('\n');

  const mdPath = join(CONFIG.outputDir, `links-${date}.md`);
  writeFileSync(mdPath, md);

  console.log(`\n[baseline] wrote ${jsonPath}`);
  console.log(`[baseline] wrote ${mdPath}`);

  const headline =
    results.length === 0
      ? `BASELINE: 0 URLs emitted across ${roadmaps.length} roadmaps / ${totalItems} items — the current generator names resources but never links them.`
      : `BASELINE: ${brokenRate.toFixed(1)}% of resource links broken (${broken.length}/${results.length} unique URLs, ${domains.size} domains); YouTube broken/fabricated ${youtubeBroken.length}/${youtubeLinks.length}.`;
  console.log(`\n${headline}`);
}

main().catch((error) => {
  console.error('[baseline] run failed:', error);
  process.exit(1);
});
