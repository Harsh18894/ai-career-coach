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
import { CareerPathSchema, type Profile, type CareerPath } from '../lib/ai/schemas';
import { checkUrls, type LinkStatus } from '../lib/link-check';

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
      const candidates = Array.isArray(snapshot) ? snapshot : snapshot.paths;
      // Older snapshots predate the tier field, and generateRoadmap keys its week bands off
      // `tier` — a path missing it would silently produce an unbounded roadmap and corrupt the
      // measurement. Only reuse snapshots that still satisfy the current schema.
      const valid = (candidates ?? []).filter((path) => CareerPathSchema.safeParse(path).success);
      if (valid.length) {
        cachedPaths = valid;
        break;
      }
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

type ValidatedLink = Omit<LinkResult, 'occurrences' | 'domain'>;

/** Fetch/timeout/classification live in lib/link-check.ts, shared with
 * scripts/check-platform-links.ts. This adds only the YouTube verdict, which is specific to
 * measuring fabricated links rather than to checking liveness. */
async function validateAll(urls: string[]): Promise<Map<string, ValidatedLink>> {
  const checked = await checkUrls(urls, {
    timeoutMs: CONFIG.requestTimeoutMs,
    concurrency: CONFIG.concurrency,
    userAgent: 'aria-baseline-links/1.0 (link validation)',
    onProgress: (completed, total) => {
      process.stdout.write(`\r[baseline] validated ${completed}/${total} URLs`);
    },
  });
  if (urls.length) process.stdout.write('\n');

  const results = new Map<string, ValidatedLink>();
  for (const [url, result] of checked) {
    const youtube = youtubeVerdict(url);
    results.set(url, {
      url,
      status: result.status,
      httpStatus: result.httpStatus,
      finalUrl: result.finalUrl,
      isYoutubeWatch: youtube.isYoutubeWatch,
      certainlyFabricated: youtube.certainlyFabricated,
    });
  }
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
  /** Items naming a known learning platform or provider, with or without a link. Separates
   * "names a resource but does not link it" from "does not reference a resource at all" —
   * a distinction that decides what Phase 2's catalog actually has to replace. */
  itemsNamingAProvider: number;
  /** A few verbatim items, so the artifact carries evidence and not just counts. */
  sampleItems: string[];
  urls: string[];
};

/** Providers a model would plausibly cite when recommending study material. */
const PROVIDER_PATTERN =
  /\b(coursera|udemy|edx|datacamp|pluralsight|codecademy|freecodecamp|youtube|khan academy|leetcode|hackerrank|kaggle|udacity|linkedin learning|o'?reilly|manning|packt|educative|scrimba|exercism|codewars|mode analytics|stratascratch)\b/i;

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
    // Decks are resolved up front, then walked breadth-first (one path per profile, then the
    // next path per profile). A depth-first walk would spend the whole roadmap budget on the
    // first profile, and link behaviour could plausibly vary by persona.
    const decks = new Map<string, { source: ProfileSource; paths: CareerPath[]; signals: UserSignals }>();
    for (const source of sources) {
      const signals = signalsFor(source.profile);
      const paths =
        source.cachedPaths?.length
          ? source.cachedPaths
          : await generatePaths(source.profile, signals, [], [], { country: source.profile.country ?? 'India' });
      decks.set(source.id, { source, paths, signals });
    }

    const deepestDeck = Math.max(0, ...Array.from(decks.values(), (deck) => deck.paths.length));

    outer: for (let pathIndex = 0; pathIndex < deepestDeck; pathIndex++) {
      for (const { source, paths, signals } of decks.values()) {
        if (roadmaps.length >= maxRoadmaps || allUrls.length >= CONFIG.targetUrlCount) break outer;
        const path = paths[pathIndex];
        if (!path) continue;

        const roadmap = await generateRoadmap(source.profile, path, signals);
        const urls = extractUrls(roadmap);
        const items = roadmap.phases.flatMap((phase) => phase.weeks.flatMap((week) => week.items));

        roadmaps.push({
          profileId: source.id,
          origin: source.origin,
          pathTitle: path.title,
          tier: path.tier,
          totalWeeks: roadmap.totalWeeks,
          itemCount: items.length,
          itemsNamingAProvider: items.filter((item) => PROVIDER_PATTERN.test(item)).length,
          sampleItems: items.slice(0, 3),
          urls,
        });
        allUrls.push(...urls);

        console.log(
          `[baseline] ${source.id} / ${path.title} (${path.tier}) -> ${items.length} items, ${urls.length} URLs  [running total: ${allUrls.length}]`
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
  const itemsNamingAProvider = roadmaps.reduce((sum, r) => sum + r.itemsNamingAProvider, 0);
  const noUrlsAtAll = results.length === 0;

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
      itemsNamingAProvider,
    },
    validation: {
      ok: results.filter((r) => r.status === 'ok').length,
      dead: results.filter((r) => r.status === 'dead').length,
      timeout: results.filter((r) => r.status === 'timeout').length,
      blocked: results.filter((r) => r.status === 'blocked').length,
      // Null rather than 0 when nothing was emitted: a 0% broken rate over zero links reads
      // as "every link works", which is the opposite of what happened.
      brokenRatePercent: noUrlsAtAll ? null : Number(brokenRate.toFixed(1)),
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
    noUrlsAtAll
      ? `**The roadmap generator emitted no URLs at all** across ${roadmaps.length} roadmaps and ${totalItems} weekly items, and only ${itemsNamingAProvider} of those items named a learning provider even without a link. There is no broken-link rate to quote, because there are no links.`
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
    `| Items naming a known learning provider | ${itemsNamingAProvider} |`,
    `| Estimated generation cost | ${costUsd === null ? 'n/a (Redis unconfigured)' : `$${costUsd.toFixed(4)}`} |`,
    '',
    '## Link validation',
    '',
    noUrlsAtAll
      ? [
          '_Not applicable — no URLs were emitted, so nothing was validated._',
          '',
          'Note that this is **not** a 0% broken rate. A 0% broken rate would mean every link',
          'worked. What happened is that the generator produced no links to check.',
        ].join('\n')
      : [
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
        ].join('\n'),
    '',
    '## What the items contain instead',
    '',
    'Sample of verbatim weekly items, so this artifact carries evidence rather than only counts:',
    '',
    ...roadmaps.slice(0, 4).flatMap((r) => [
      `**${r.profileId} — ${r.pathTitle}** (${r.tier})`,
      '',
      ...r.sampleItems.map((item) => `- ${item}`),
      '',
    ]),
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
    noUrlsAtAll
      ? `BASELINE: 0 URLs across ${roadmaps.length} roadmaps / ${totalItems} items (${itemsNamingAProvider} items name a provider) — the generator emits no resource links at all.`
      : `BASELINE: ${brokenRate.toFixed(1)}% of resource links broken (${broken.length}/${results.length} unique URLs, ${domains.size} domains); YouTube broken/fabricated ${youtubeBroken.length}/${youtubeLinks.length}.`;
  console.log(`\n${headline}`);
}

main().catch((error) => {
  console.error('[baseline] run failed:', error);
  process.exit(1);
});
