import { NextRequest, NextResponse } from 'next/server';
import { streamChatTurn, analyzeSignals, generatePaths, generateRoadmap, buildProfileFromAnswers } from '@/lib/ai/coach';

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
      const { profile, signals, shownPaths, rejectedDirections } = body;
      if (!profile || !signals) {
        return NextResponse.json({ error: 'Missing profile or signals.' }, { status: 400 });
      }
      const paths = await generatePaths(
        profile,
        signals,
        shownPaths || [],
        rejectedDirections || []
      );
      return NextResponse.json({ paths });
    }

    if (action === 'roadmap') {
      const { profile, chosenPath, signals } = body;
      if (!profile || !chosenPath || !signals) {
        return NextResponse.json({ error: 'Missing profile, chosenPath, or signals.' }, { status: 400 });
      }
      const roadmap = await generateRoadmap(profile, chosenPath, signals);
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

    if (action === 'chat' || !action) {
      const { messages, profile, signals, chosenPath, rejectedAll } = body;
      if (!messages || !signals) {
        return NextResponse.json({ error: 'Missing messages or signals.' }, { status: 400 });
      }
      return await streamChatTurn(messages, profile, signals, chosenPath, rejectedAll);
    }


    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in coach route:', error);
    return NextResponse.json({
      error: error.message || 'An error occurred in the career coach helper.',
    }, { status: 500 });
  }
}
