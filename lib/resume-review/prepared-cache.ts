import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { RATE_LIMIT_CONFIG } from '../rate-limit';
import { ResumeSegmentSchema, type ResumeSegment } from './schemas';
import type { PersonaClassification } from './persona';

/* =====================================================================================
 * Short-lived store for a segmented-and-classified resume, so the review request can be a
 * single model call.
 *
 * Why this exists: segmentation (~12s) + classification (~6s) + review (~40-50s) run
 * sequentially, which lands at 60-68s against a 60s serverless ceiling. Splitting the work
 * into two requests puts the heavy review call on its own budget.
 *
 * Why server-side rather than round-tripping the segment through the browser: post-validation
 * checks every finding's originalText against the segment. If the client supplied that
 * segment, the no-fabrication guarantee would be validated against text the client controls,
 * which hollows out the one rule the whole feature is built around. Keeping it server-side
 * means "verbatim in the source" keeps meaning what it says.
 *
 * Falls back to null when Upstash is unconfigured (local dev); callers then re-segment, which
 * is slower but correct. See the note in the review routes.
 * ===================================================================================== */

export type PreparedReview = {
  sessionId: string;
  rawResumeText: string;
  segment: ResumeSegment;
  classification: PersonaClassification;
};

/** Long enough to read the detected persona, reconsider it, and start a review; short enough
 * that a parsed resume is not sitting in shared storage any longer than the task needs. */
const PREPARED_TTL_SECONDS = 30 * 60;

let redisClient: Redis | null = null;
let initialized = false;

function getRedis(): Redis | null {
  if (initialized) return redisClient;
  initialized = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  // Silent: lib/rate-limit.ts already warns once about the same missing vars.
  if (!url || !token) return redisClient;
  redisClient = new Redis({ url, token });
  return redisClient;
}

export function isPreparedCacheAvailable(): boolean {
  return getRedis() !== null;
}

function keyFor(preparedId: string): string {
  return `${RATE_LIMIT_CONFIG.keyPrefix}:review:prepared:${preparedId}`;
}

/** Returns the id to hand back to the client, or null when there is no store configured. */
export async function storePreparedReview(prepared: PreparedReview): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  const preparedId = randomUUID();
  try {
    await redis.set(keyFor(preparedId), JSON.stringify(prepared), { ex: PREPARED_TTL_SECONDS });
    return preparedId;
  } catch (error) {
    // A cache failure must not fail the request — the caller falls back to re-segmenting.
    console.error('[review-cache] failed to store prepared review:', error);
    return null;
  }
}

/**
 * Loads a prepared review, but only for the session that created it. A prepared id is an
 * unguessable UUID, so this is defence in depth rather than the primary control — but the
 * stored object is somebody's parsed resume, and "unguessable" is not the same as "checked".
 */
export async function loadPreparedReview(preparedId: string, sessionId: string): Promise<PreparedReview | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get<string | Record<string, unknown>>(keyFor(preparedId));
    if (!raw) return null;

    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as PreparedReview;

    if (parsed.sessionId !== sessionId) {
      console.warn(
        JSON.stringify({
          event: 'prepared_review_session_mismatch',
          timestamp: new Date().toISOString(),
          preparedId,
        })
      );
      return null;
    }

    // Re-validate rather than trusting whatever was in storage.
    const segment = ResumeSegmentSchema.safeParse(parsed.segment);
    if (!segment.success) return null;

    return { ...parsed, segment: segment.data };
  } catch (error) {
    console.error('[review-cache] failed to load prepared review:', error);
    return null;
  }
}
