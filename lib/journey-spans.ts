/**
 * The span names, in their own directive-free module.
 *
 * Deliberately NOT in lib/journey.ts: that file carries 'use client', and Next replaces a
 * client module's exports with client-reference stubs when server code imports them. The
 * journey route's `z.enum(JOURNEY_SPANS)` was therefore built from a proxy rather than from
 * the array, so every well-formed span failed validation and the endpoint silently recorded
 * nothing. Shared constants between a client module and a route handler have to live outside
 * both.
 */

export const JOURNEY_SPANS = ['intake_to_first_paths', 'lock_to_roadmap'] as const;
export type JourneySpanName = (typeof JOURNEY_SPANS)[number];
