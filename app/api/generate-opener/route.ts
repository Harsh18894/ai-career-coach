import { NextRequest, NextResponse } from 'next/server';
import { generateOpeningMessage } from '@/lib/ai/coach';
import { ProfileSchema } from '@/lib/ai/schemas';
import { enforceLimits } from '@/lib/rate-limit';
import { withTelemetryContext, telemetryContextFromRequest } from '@/lib/telemetry';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Not a session start — /api/parse-resume already charged that quota for this visitor.
    const limited = await enforceLimits(request);
    if (limited) return limited;

    const body = await request.json();
    const profile = ProfileSchema.parse(body.profile);

    return await withTelemetryContext(
      telemetryContextFromRequest(request, '/api/generate-opener'),
      async () => {
        const opener = await generateOpeningMessage(profile);
        return NextResponse.json({ opener });
      }
    );
  } catch (error: any) {
    console.error('Error in generate-opener route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate opening message.' },
      { status: 500 }
    );
  }
}
