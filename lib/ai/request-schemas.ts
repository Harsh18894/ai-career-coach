import { z } from 'zod';
import { LIMITS } from '../limits';
import { CareerPathSchema, ProfileSchema, RoadmapSchema } from './schemas';

/* =====================================================================================
 * Request schemas for /api/coach.
 *
 * The route multiplexes eight actions and, until now, validated none of them — a truthiness
 * check on a couple of top-level fields, then straight into prompt construction. That mattered
 * more than it looks: `profile` and `signals` are JSON.stringify'd directly into the SYSTEM
 * message (see buildBaseSystemInstruction), so an unvalidated body was an unvalidated system
 * prompt.
 *
 * Two properties of these schemas are load-bearing, and both come from Zod's default behaviour
 * rather than from anything clever:
 *
 *   1. Unknown keys are STRIPPED, not passed through. Whatever a caller invents in `signals`
 *      never reaches the prompt, because the object that gets stringified is the parsed one,
 *      not the received one. This is the actual fix for injection-via-extra-field.
 *   2. Every string that a caller controls the length of has a `.max()`. Without one, the
 *      history window in streamChatTurn bounds the NUMBER of messages sent to the model but
 *      not their size, which is the whole cost-amplification problem.
 *
 * These describe the SHAPE of a request. They deliberately do not touch prompt text, the state
 * machine, or the recommendation gates — a body that would have been accepted before and is
 * well-formed is accepted identically now.
 * ===================================================================================== */

/** A model-generated string round-tripping through the client (a skill, a rejected direction).
 * Capped because it arrives from the browser, not because the model would ever produce one
 * this long. */
const boundedString = z.string().max(LIMITS.maxArrayItemChars);
const boundedStringArray = z.array(boundedString).max(LIMITS.maxArrayItems);

/** Mirrors ChatMessage in lib/state/conversation.ts.
 *
 * `id` and `createdAt` are client-side bookkeeping that no server code reads — only `role` and
 * `content` reach a prompt. They are accepted and defaulted rather than made optional so the
 * parsed value still satisfies the ChatMessage type the coach functions take, which keeps this
 * validation entirely outside lib/ai/coach.ts's signatures. */
export const ChatMessageRequestSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(LIMITS.maxChatMessageChars),
  id: z.string().max(128).default(''),
  createdAt: z.string().max(64).default(''),
});

export const ChatHistorySchema = z.array(ChatMessageRequestSchema).max(LIMITS.maxMessagesPerRequest);

/** Mirrors UserSignals in lib/state/conversation.ts. Kept in sync by hand, like the schema in
 * analyzeSignals it shares a shape with — the NOTE there applies here too. */
export const UserSignalsRequestSchema = z.object({
  intentGuess: z.enum(['pivot', 'grow', 'early_career', 'unknown']),
  motivations: boundedStringArray,
  constraints: boundedStringArray,
  rejectedDirections: boundedStringArray,
  knownSkills: boundedStringArray,
  knownDomains: boundedStringArray,
  country: boundedString.nullish(),
  notes: boundedStringArray,
  readyForRecommendation: z.boolean(),
  hasUsableInfo: z.boolean(),
});

/** Mirrors CoachTurn in lib/ai/coach.ts. A discriminated union rather than a loose object
 * because `chosenPath.title` is interpolated raw into the system message on the path_locked
 * branch — that field has to be something the model produced and the schema recognises, not
 * an arbitrary string a caller chose. */
export const CoachTurnRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('understanding') }),
  z.object({ kind: z.literal('ask_country'), detectedCountries: boundedStringArray }),
  z.object({ kind: z.literal('ask_preferences') }),
  z.object({ kind: z.literal('insufficient_info') }),
  z.object({ kind: z.literal('rejected_all_final') }),
  z.object({ kind: z.literal('path_locked'), chosenPath: CareerPathSchema }),
  z.object({ kind: z.literal('roadmap_followup'), chosenPath: CareerPathSchema, roadmap: RoadmapSchema }),
]);

const QaPairSchema = z.object({
  question: z.string().max(LIMITS.maxShortAnswerChars),
  answer: z.string().max(LIMITS.maxShortAnswerChars),
});

/* =====================================================================================
 * Per-action bodies
 * ===================================================================================== */

export const CoachChatBodySchema = z.object({
  action: z.literal('chat').optional(),
  messages: ChatHistorySchema,
  signals: UserSignalsRequestSchema,
  profile: ProfileSchema.nullish(),
  turn: CoachTurnRequestSchema.optional(),
});

export const CoachAnalyzeBodySchema = z.object({
  action: z.literal('analyze'),
  messages: ChatHistorySchema,
  signals: UserSignalsRequestSchema,
});

export const CoachRecommendBodySchema = z.object({
  action: z.literal('recommend'),
  profile: ProfileSchema,
  signals: UserSignalsRequestSchema,
  shownPaths: boundedStringArray.optional(),
  rejectedDirections: boundedStringArray.optional(),
  changeRequests: z.string().max(LIMITS.maxShortAnswerChars).nullish(),
});

export const CoachRoadmapBodySchema = z.object({
  action: z.literal('roadmap'),
  profile: ProfileSchema,
  chosenPath: CareerPathSchema,
  signals: UserSignalsRequestSchema,
  feedback: z.string().max(LIMITS.maxShortAnswerChars).nullish(),
});

export const CoachBuildProfileBodySchema = z.object({
  action: z.literal('build-profile'),
  answers: z.array(QaPairSchema).min(1).max(LIMITS.maxArrayItems),
});

export const CoachNextQuestionBodySchema = z.object({
  action: z.literal('next-profile-question'),
  answers: z.array(QaPairSchema).max(LIMITS.maxArrayItems),
});

export const CoachUnderstandingTurnBodySchema = z.object({
  action: z.literal('understanding-turn'),
  messages: ChatHistorySchema,
  signals: UserSignalsRequestSchema,
  profile: ProfileSchema.nullish(),
});

/** Every action the route serves. `chat` is last because it is also the default when no action
 * is given — see the route. */
export const COACH_ACTIONS = [
  'analyze',
  'recommend',
  'roadmap',
  'build-profile',
  'next-profile-question',
  'understanding-turn',
  'chat',
] as const;

export type CoachAction = (typeof COACH_ACTIONS)[number];

export function isCoachAction(value: unknown): value is CoachAction {
  return typeof value === 'string' && (COACH_ACTIONS as readonly string[]).includes(value);
}
