import { NextRequest, NextResponse } from 'next/server';
import { generateOpeningMessage } from '@/lib/ai/coach';
import { ProfileSchema } from '@/lib/ai/schemas';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const profile = ProfileSchema.parse(body.profile);
    const opener = await generateOpeningMessage(profile);
    return NextResponse.json({ opener });
  } catch (error: any) {
    console.error('Error in generate-opener route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate opening message.' },
      { status: 500 }
    );
  }
}
