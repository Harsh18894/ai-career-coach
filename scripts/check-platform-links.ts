/**
 * Liveness check for the curated opportunity-platform registry.
 *
 * These are the only URLs this app puts in front of a user, and they are hardcoded rather
 * than model-generated precisely so they can be verified. This script is what verifies them.
 *
 * CI-safe by construction: pure HEAD/GET requests, no model calls, no cost. That is why it is
 * a separate script rather than an addition to scripts/baseline-links.ts — the baseline is
 * --confirm-gated and explicitly never run in CI because it bills real tokens, so folding a
 * check that must run on every build into it would be a category error. Both share the fetch
 * and classification logic via lib/link-check.ts.
 *
 *   npm run check:platform-links
 *
 * Exit code is non-zero if any platform URL is dead or times out. `blocked` (401/403/429) is
 * NOT a failure: job boards routinely reject non-browser user agents, and that says nothing
 * about whether the link works for a real person.
 */
import { OPPORTUNITY_PLATFORMS } from '../lib/resume-review/opportunity-platforms';
import { checkUrls, type LinkStatus } from '../lib/link-check';

const STATUS_LABEL: Record<LinkStatus, string> = {
  ok: 'OK     ',
  blocked: 'BLOCKED',
  dead: 'DEAD   ',
  timeout: 'TIMEOUT',
};

async function main(): Promise<void> {
  const urls = OPPORTUNITY_PLATFORMS.map((p) => p.url);
  console.log(`[platform-links] checking ${urls.length} registry URLs...\n`);

  const results = await checkUrls(urls, {
    onProgress: (completed, total) => {
      process.stdout.write(`\r[platform-links] ${completed}/${total}`);
    },
  });
  process.stdout.write('\r');

  const failures: string[] = [];

  for (const platform of OPPORTUNITY_PLATFORMS) {
    const result = results.get(platform.url);
    const status = result?.status ?? 'dead';
    const httpStatus = result?.httpStatus ? ` (${result.httpStatus})` : '';
    const regions = platform.regions.join(', ');

    console.log(`${STATUS_LABEL[status]} ${platform.id.padEnd(18)} ${platform.url.padEnd(42)} [${regions}]${httpStatus}`);

    if (status === 'dead' || status === 'timeout') {
      failures.push(`${platform.id} (${platform.url}) — ${status}${httpStatus}`);
    }
  }

  const blocked = OPPORTUNITY_PLATFORMS.filter((p) => results.get(p.url)?.status === 'blocked').length;
  console.log(
    `\n[platform-links] ${OPPORTUNITY_PLATFORMS.length - failures.length - blocked} ok, ${blocked} blocked (not a failure), ${failures.length} broken`
  );

  if (failures.length > 0) {
    console.error('\n[platform-links] FAILED — these registry URLs are unreachable:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nFix or remove them in lib/resume-review/opportunity-platforms.ts. A dead link here is ' +
        'shown directly to a student as a recommendation.'
    );
    process.exit(1);
  }

  console.log('[platform-links] all registry URLs reachable.');
}

main().catch((error) => {
  console.error('[platform-links] check failed to run:', error);
  process.exit(1);
});
