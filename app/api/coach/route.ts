import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  streamChatTurn,
  generateUnderstandingTurn,
  analyzeSignals,
  generatePaths,
  generateRoadmap,
  buildProfileFromAnswers,
  nextGuidedProfileQuestion,
  resolveMarket,
  canRecommend,
} from '@/lib/ai/coach';
import {
  CoachAnalyzeBodySchema,
  CoachBuildProfileBodySchema,
  CoachChatBodySchema,
  CoachNextQuestionBodySchema,
  CoachRecommendBodySchema,
  CoachRoadmapBodySchema,
  CoachUnderstandingTurnBodySchema,
  isCoachAction,
} from '@/lib/ai/request-schemas';
import { enforceLimits } from '@/lib/rate-limit';
import { readJsonBody, summarizeZodError } from '@/lib/request-guard';
import { withTelemetryContext, telemetryContextFromRequest } from '@/lib/telemetry';
import { errorResponse, failWith } from '@/lib/api-response';

export const maxDuration = 60; // Allow sufficient time for long stream operations / path generation

/**
 * Validates the body against the schema for its action.
 *
 * Returns the parsed value or a typed 400. The parsed value is what every handler below uses —
 * never the raw body — because Zod strips unknown keys, and `profile` and `signals` are
 * stringified straight into the system message. Passing the raw object through would mean
 * anything a caller added to it went into the prompt with it.
 */
function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  action: string
): { ok: true; data: z.infer<T> } | { ok: false; response: ReturnType<typeof failWith> } {
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    response: failWith('INVALID_REQUEST', {
      detail: `coach/${action}: ${summarizeZodError(parsed.error.message)}`,
    }),
  };
}

export async function POST(request: NextRequest) {
  try {
    // Origin, content-type, and a hard byte cap enforced while reading the stream — so an
    // oversized body is refused mid-upload rather than buffered, parsed, and only then judged.
    const body = await readJsonBody(request);

    const rawAction = (body as { action?: unknown })?.action;
    // An absent action has always meant `chat`. Anything else present but unrecognised is a
    // client bug, and is now named as one instead of falling through to the chat handler.
    const action = rawAction === undefined || rawAction === null ? 'chat' : rawAction;
    if (!isCoachAction(action)) {
      return failWith('INVALID_REQUEST', { detail: `coach: unrecognised action ${JSON.stringify(rawAction)}.` });
    }

    // The no-resume path never touches /api/parse-resume, so its first adaptive question (the
    // one asked with nothing answered yet) is that flow's real session start. Every other
    // action is mid-session and only charges the LLM-call quota.
    const isSessionStart =
      action === 'next-profile-question' &&
      Array.isArray((body as { answers?: unknown }).answers) &&
      (body as { answers: unknown[] }).answers.length === 0;

    const limited = await enforceLimits(request, { sessionStart: isSessionStart });
    if (limited) return limited;

    // Everything below runs inside the telemetry context, so each LLM call reached from any
    // of the actions is attributed to this session without threading a parameter through
    // lib/ai/coach.ts's signatures.
    return await withTelemetryContext(telemetryContextFromRequest(request, '/api/coach'), async () => {

      if (action === 'analyze') {
        const parsed = parseBody(CoachAnalyzeBodySchema, body, action);
        if (!parsed.ok) return parsed.response;
        const { messages, signals } = parsed.data;
        const updatedSignals = await analyzeSignals(messages, signals);
        return NextResponse.json({ signals: updatedSignals });
      }

      if (action === 'recommend') {
        const parsed = parseBody(CoachRecommendBodySchema, body, action);
        if (!parsed.ok) return parsed.response;
        const { profile, signals, shownPaths, rejectedDirections, changeRequests } = parsed.data;

        // Hard gate: never recommend without a concrete skill/domain + readiness.
        // The client should keep the conversation in UNDERSTANDING when this returns.
        if (!canRecommend(profile, signals)) {
          return NextResponse.json({ notReady: true });
        }

        // If the resume spans multiple countries and the user hasn't confirmed one,
        // ask before recommending so salaries/roles calibrate to the right market.
        const market = resolveMarket(profile, signals);
        if (market.needsCountryConfirmation && !signals.country) {
          const detectedCountries = Array.from(new Set<string>(profile.countriesDetected ?? []));
          return NextResponse.json({ needsCountry: true, detectedCountries });
        }

        const paths = await generatePaths(
          profile,
          signals,
          shownPaths || [],
          rejectedDirections || [],
          { country: market.country, changeRequests: changeRequests || undefined }
        );
        return NextResponse.json({ paths, country: market.country });
      }

      if (action === 'roadmap') {
        const parsed = parseBody(CoachRoadmapBodySchema, body, action);
        if (!parsed.ok) return parsed.response;
        const { profile, chosenPath, signals, feedback } = parsed.data;
        const roadmap = await generateRoadmap(profile, chosenPath, signals, feedback ?? undefined);
        return NextResponse.json({ roadmap });
      }

      if (action === 'build-profile') {
        const parsed = parseBody(CoachBuildProfileBodySchema, body, action);
        if (!parsed.ok) return parsed.response;
        const profile = await buildProfileFromAnswers(parsed.data.answers);
        return NextResponse.json({ profile });
      }

      if (action === 'next-profile-question') {
        const parsed = parseBody(CoachNextQuestionBodySchema, body, action);
        if (!parsed.ok) return parsed.response;
        const nextQuestion = await nextGuidedProfileQuestion(parsed.data.answers);
        return NextResponse.json(nextQuestion);
      }

      if (action === 'understanding-turn') {
        const parsed = parseBody(CoachUnderstandingTurnBodySchema, body, action);
        if (!parsed.ok) return parsed.response;
        const { messages, profile, signals } = parsed.data;
        const turn = await generateUnderstandingTurn(messages, profile ?? null, signals);
        return NextResponse.json(turn);
      }

      // `chat`, including the no-action default.
      const parsed = parseBody(CoachChatBodySchema, body, action);
      if (!parsed.ok) return parsed.response;
      const { messages, profile, signals, turn } = parsed.data;
      // `turn` is the discriminated CoachTurn the client built (see CoachTurn in lib/ai/coach.ts).
      const coachTurn = turn ?? { kind: 'understanding' as const };
      return await streamChatTurn(messages, profile ?? null, signals, coachTurn);
    });
  } catch (error) {
    return errorResponse(error);
  }
}
