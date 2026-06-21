import { NextRequest, NextResponse } from 'next/server';
import {
  streamChatTurn,
  analyzeSignals,
  generatePaths,
  generateRoadmap,
  buildProfileFromAnswers,
  nextGuidedProfileQuestion,
  resolveMarket,
  canRecommend,
} from '@/lib/ai/coach';

export const maxDuration = 60; // Allow sufficient time for long stream operations / path generation

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'analyze') {
      const { messages, signals } = body;
      if (!messages || !signals) {
        return NextResponse.json({ error: 'Missing messages or signals.' }, { status: 400 });
      }
      const updatedSignals = await analyzeSignals(messages, signals);
      return NextResponse.json({ signals: updatedSignals });
    }

    if (action === 'recommend') {
      const { profile, signals, shownPaths, rejectedDirections, changeRequests } = body;
      if (!profile || !signals) {
        return NextResponse.json({ error: 'Missing profile or signals.' }, { status: 400 });
      }

      // Gate #2/#3: never recommend without a concrete skill/domain + readiness.
      // The client should keep the conversation in UNDERSTANDING when this returns.
      if (!canRecommend(profile, signals)) {
        return NextResponse.json({ notReady: true });
      }

      // Gate #4: if the resume spans multiple countries and the user hasn't confirmed one,
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
      const { profile, chosenPath, signals, feedback } = body;
      if (!profile || !chosenPath || !signals) {
        return NextResponse.json({ error: 'Missing profile, chosenPath, or signals.' }, { status: 400 });
      }
      const roadmap = await generateRoadmap(profile, chosenPath, signals, feedback);
      return NextResponse.json({ roadmap });
    }

    if (action === 'build-profile') {
      const { answers } = body;
      if (!answers || !Array.isArray(answers) || answers.length === 0) {
        return NextResponse.json({ error: 'Missing answers.' }, { status: 400 });
      }
      const profile = await buildProfileFromAnswers(answers);
      return NextResponse.json({ profile });
    }

    if (action === 'next-profile-question') {
      const { answers } = body;
      if (!answers || !Array.isArray(answers)) {
        return NextResponse.json({ error: 'Missing answers.' }, { status: 400 });
      }
      return await nextGuidedProfileQuestion(answers);
    }

    if (action === 'chat' || !action) {
      // `turn` is the discriminated CoachTurn object built by the client (see coach.ts):
      //   { kind: 'understanding' }
      //   { kind: 'ask_country', detectedCountries }
      //   { kind: 'ask_preferences' }
      //   { kind: 'insufficient_info' }
      //   { kind: 'path_locked', chosenPath }
      //   { kind: 'roadmap_followup', chosenPath, roadmap }
      //   { kind: 'rejected_all_final' }
      const { messages, profile, signals, turn } = body;
      if (!messages || !signals) {
        return NextResponse.json({ error: 'Missing messages or signals.' }, { status: 400 });
      }
      const coachTurn = turn ?? { kind: 'understanding' };
      return await streamChatTurn(messages, profile, signals, coachTurn);
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in coach route:', error);
    return NextResponse.json({
      error: error.message || 'An error occurred in the career coach helper.',
    }, { status: 500 });
  }
}