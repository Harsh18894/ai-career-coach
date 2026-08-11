import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateOpeningMessage } from '@/lib/ai/coach';
import { ProfileSchema } from '@/lib/ai/schemas';
import { enforceLimits } from '@/lib/rate-limit';
import { readJsonBody, summarizeZodError } from '@/lib/request-guard';
import { withTelemetryContext, telemetryContextFromRequest } from '@/lib/telemetry';
import { errorResponse, failWith } from '@/lib/api-response';

export const maxDuration = 60;

const BodySchema = z.object({ profile: ProfileSchema });

export async function POST(request: NextRequest) {
  try {
    // Not a session start — /api/parse-resume already charged that quota for this visitor.
    const limited = await enforceLimits(request);
    if (limited) return limited;

    const body = await readJsonBody(request);
    // safeParse, not parse: a ZodError thrown here used to fall through to the catch and be
    // classified UNKNOWN, reporting a client-side bug as a 500 server fault.
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return failWith('INVALID_REQUEST', {
        detail: `generate-opener: ${summarizeZodError(parsed.error.message)}`,
      });
    }

    return await withTelemetryContext(
      telemetryContextFromRequest(request, '/api/generate-opener'),
      async () => {
        const opener = await generateOpeningMessage(parsed.data.profile);
        return NextResponse.json({ opener });
      }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
