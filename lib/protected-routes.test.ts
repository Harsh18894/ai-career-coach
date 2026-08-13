import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BOTID_PROTECTED_ROUTES } from './protected-routes';

/* =====================================================================================
 * Keeps the client-side protect list and the server-side cost surface from drifting.
 *
 * The drift is silent in the dangerous direction and loud in the safe one:
 *
 *   route spends money, NOT in the list -> the browser attaches no signal, checkBotId() sees
 *                                          nothing and classifies real users as bots. Loud.
 *   route in the list, spends nothing   -> a pointless classification on a cheap path. Quiet.
 *
 * Neither is acceptable, and neither is caught by types, so it is caught here — against the
 * route files themselves rather than against a second hand-maintained list.
 * ===================================================================================== */

const API_DIR = join(process.cwd(), 'app', 'api');

/** Every route.ts under app/api, as the URL path it serves. */
function findApiRoutes(dir = API_DIR, prefix = '/api'): { path: string; source: string }[] {
  const found: { path: string; source: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findApiRoutes(full, `${prefix}/${entry.name}`));
    } else if (entry.name === 'route.ts') {
      found.push({ path: prefix, source: readFileSync(full, 'utf8') });
    }
  }
  return found;
}

/**
 * A route costs money if it reaches a model or makes an outbound fetch. Read off the guard call
 * it already makes: `enforceLimits` defaults `llm` to true, so anything that does not explicitly
 * opt out is a model route.
 */
function isCostBearing(source: string): boolean {
  const call = source.match(/enforceLimits\(request(?:,\s*\{([^}]*)\})?\)/);
  // No enforceLimits at all means it delegates to a shared handler that has one — the review
  // routes do this. Those are model routes.
  if (!call) return true;
  const options = call[1] ?? '';
  const optsOut = /llm:\s*false/.test(options);
  const fetches = /jobFetch:\s*true/.test(options);
  return !optsOut || fetches;
}

const routes = findApiRoutes();
const protectedPaths = new Set(BOTID_PROTECTED_ROUTES.map((r) => r.path));

describe('BotId protected-route list', () => {
  it('finds the API routes at all, so a passing suite means something', () => {
    expect(routes.length).toBeGreaterThanOrEqual(9);
  });

  it.each(routes.filter((r) => isCostBearing(r.source)).map((r) => r.path))(
    'covers %s, which spends money',
    (path) => {
      expect(protectedPaths).toContain(path);
    }
  );

  it.each(routes.filter((r) => !isCostBearing(r.source)).map((r) => r.path))(
    'leaves %s unprotected, because it reaches no model and makes no outbound call',
    (path) => {
      // Not merely "allowed to be absent" — asserted absent. A bot check on a fire-and-forget
      // beacon adds latency to every funnel step and a failure mode to a path that must never
      // be able to fail a user's session.
      expect(protectedPaths).not.toContain(path);
    }
  );

  it('names only routes that exist', () => {
    const real = new Set(routes.map((r) => r.path));
    for (const route of BOTID_PROTECTED_ROUTES) {
      expect(real).toContain(route.path);
    }
  });

  it('protects them as POST, which is what every one of them accepts', () => {
    for (const route of BOTID_PROTECTED_ROUTES) {
      expect(route.method).toBe('POST');
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(BOTID_PROTECTED_ROUTES.map((r) => `${r.method} ${r.path}`)).size).toBe(
      BOTID_PROTECTED_ROUTES.length
    );
  });
});
