/**
 * The funnel's vocabulary, in a directive-free module.
 *
 * Separate from lib/analytics.ts for the same reason lib/journey-spans.ts is separate from
 * lib/journey.ts: that file carries 'use client', and Next replaces a client module's exports
 * with client-reference stubs when a route handler imports them — so a `z.enum()` built from
 * an array living there is built from a proxy and rejects everything. That bug cost real time
 * once already; this is the shape that avoids it.
 */

export const FUNNEL_EVENTS = [
  // Acquisition
  'landing_view',
  'sample_cta_click',
  'upload_cta_click',
  // Activation
  'profile_parsed',
  'first_coach_message',
  'chat_turn',
  // Value delivered
  'deck_shown',
  'path_locked',
  'roadmap_viewed',
  // Outcomes worth separating from the funnel itself
  'session_feedback',
  'client_error',
  'rate_limited',
  'budget_exceeded',
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/**
 * Which intake a session came through. The brief asks for sample vs. real-resume as a segment,
 * and the no-resume guided path is a third thing that would otherwise be silently lumped in
 * with "own".
 */
export const FUNNEL_PATHS = ['sample', 'own_resume', 'no_resume'] as const;
export type FunnelPath = (typeof FUNNEL_PATHS)[number];

/** The one-question close prompt. Three options, because a yes/no cannot express "sort of". */
export const FEEDBACK_ANSWERS = ['useful', 'partly', 'not_useful'] as const;
export type FeedbackAnswer = (typeof FEEDBACK_ANSWERS)[number];

/**
 * Everything a funnel event may carry.
 *
 * Deliberately closed and deliberately small. Every field is an enum, a bounded integer, or a
 * hostname — there is no free-text field, because a free-text field is where resume content
 * eventually ends up.
 */
export type FunnelProps = {
  path?: FunnelPath;
  /** 1-based turn number, for drop-off across the conversation. */
  turn?: number;
  /** Taxonomy code from lib/errors.ts. Never a message, never an upstream string. */
  errorCode?: string;
  answer?: FeedbackAnswer;
  referrerHost?: string;
  msToFirstCta?: number;
};
