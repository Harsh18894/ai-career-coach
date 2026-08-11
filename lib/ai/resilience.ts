import type OpenAI from 'openai';
import type { z } from 'zod';
import { AppError, isRetryableUpstream, toAppError } from '../errors';
import { trackedCompletion, trackedStream } from '../telemetry';

/* =====================================================================================
 * Timeout, one bounded retry, and one structured-output repair attempt.
 *
 * Sits between lib/ai/coach.ts and lib/telemetry.ts: telemetry stays the innermost layer so
 * every HTTP attempt produces its own log line (a retried call logs twice, which is what you
 * want when reading the logs back).
 *
 * Deliberate limits:
 *  - Exactly ONE retry. Never a loop. A demo that fails fast is better than one that burns
 *    the daily budget grinding on a persistent fault.
 *  - Exactly ONE repair attempt on a schema violation, then INVALID_OUTPUT.
 *  - 400-class errors are never retried — those are our bug, and retrying hides them.
 * ===================================================================================== */

/**
 * Measured, not guessed: the gpt-5 family spends most of its output budget on reasoning
 * tokens, and structured extraction is the slowest thing here — observed extractProfile runs
 * took 27s and 30s, so an even 30s ceiling times out on a healthy call.
 *
 * Note the interaction with the routes' `maxDuration = 60`: a call that times out and is
 * retried can exceed the platform's own function ceiling, in which case the request is
 * terminated and the client surfaces UPSTREAM_TIMEOUT with a Retry button. That is the
 * intended degradation, not a fault — but it is why these values are not raised further.
 */
export const TIMEOUTS = {
  /** Every call except the heavier extraction/generation calls below. */
  default: 45_000,
  /** Roadmap generation writes a phased, week-by-week plan and legitimately runs long. */
  roadmap: 60_000,
  /** Resume segmentation (lib/resume-review/segment.ts) extracts a much larger structured
   * shape than extractProfile — contact, every role's bullets, education, projects, skills,
   * plus per-role/education judgement flags — and measurably needs more time than the 45s
   * default; observed timing it out even after the one retry at that ceiling. */
  segmentation: 60_000,
} as const;

const RETRY_BASE_DELAY_MS = 500;
const RETRY_JITTER_MS = 400;

/** Jittered so simultaneous failures from many clients don't retry in lockstep. */
function backoffDelayMs(): number {
  return RETRY_BASE_DELAY_MS + Math.floor(Math.random() * RETRY_JITTER_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `attempt`, retrying at most once on a transient upstream failure.
 * Non-transient failures propagate immediately.
 */
export async function withSingleRetry<T>(attempt: () => Promise<T>, label: string): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!isRetryableUpstream(error)) throw toAppError(error);

    const delay = backoffDelayMs();
    console.warn(
      `[resilience] ${label} failed with a transient error; retrying once in ${delay}ms.`,
      error instanceof Error ? error.message : error
    );
    await sleep(delay);

    try {
      return await attempt();
    } catch (retryError) {
      console.error(
        `[resilience] ${label} failed again after retry; giving up.`,
        retryError instanceof Error ? retryError.message : retryError
      );
      throw toAppError(retryError);
    }
  }
}

/* =====================================================================================
 * Structured (JSON) completions
 * ===================================================================================== */

type StructuredOptions<TSchema extends z.ZodType> = {
  /** Coach function name, for telemetry and logs. */
  call: string;
  schema: TSchema;
  timeoutMs?: number;
  /**
   * Inspects the raw parsed JSON before validation. Return true to abandon validation and
   * resolve to null — used by extractProfile's `hasSufficientInfo: false` escape hatch, which
   * is a legitimate outcome rather than a failure.
   */
  bailIf?: (raw: unknown) => boolean;
};

export async function structuredCompletion<TSchema extends z.ZodType>(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  options: StructuredOptions<TSchema> & { bailIf: (raw: unknown) => boolean }
): Promise<z.infer<TSchema> | null>;
export async function structuredCompletion<TSchema extends z.ZodType>(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  options: StructuredOptions<TSchema>
): Promise<z.infer<TSchema>>;
/**
 * Timeout + one retry + JSON parse + schema validation + one repair attempt.
 *
 * The repair re-sends the original messages with the model's own bad output and the exact
 * validation errors appended, asking for a corrected object. That is a genuinely different
 * prompt, so it is worth one shot — unlike a blind retry, which would likely reproduce the
 * same malformed output.
 */
export async function structuredCompletion<TSchema extends z.ZodType>(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  options: StructuredOptions<TSchema>
): Promise<z.infer<TSchema> | null> {
  const { call, schema, timeoutMs = TIMEOUTS.default, bailIf } = options;

  const requestOptions = {
    timeout: timeoutMs,
    // The SDK retries twice by default. Disabled so "one retry" means one, and so the retry
    // that does happen is the one that gets logged and counted here.
    maxRetries: 0,
  };

  const rawText = await withSingleRetry(async () => {
    const response = await trackedCompletion(openai, params, call, requestOptions);
    return response.choices[0]?.message?.content || '{}';
  }, call);

  // bailIf is checked against the raw JSON BEFORE schema validation, not just on a validation
  // failure: a legitimate "I have nothing to extract" response (e.g. extractProfile's
  // hasSufficientInfo: false) is typically filled out with syntactically valid empty defaults
  // (0, "unknown", []) precisely because the prompt tells the model those fields "will be
  // ignored" — which means they satisfy the schema's types and would validate successfully.
  // Checking bailIf only after a validation failure would then never fire for exactly the
  // case it exists to catch.
  let earlyRawJson: unknown;
  try {
    earlyRawJson = JSON.parse(rawText);
  } catch {
    earlyRawJson = undefined;
  }
  if (bailIf && earlyRawJson !== undefined && bailIf(earlyRawJson)) return null;

  const firstParse = parseAndValidate(rawText, schema);
  if (firstParse.ok) return firstParse.value;

  console.warn(
    `[resilience] ${call} returned output that failed validation; attempting one repair. Issues: ${firstParse.issues}`
  );

  const repairedText = await withSingleRetry(async () => {
    const response = await trackedCompletion(
      openai,
      {
        ...params,
        messages: [
          ...params.messages,
          { role: 'assistant', content: rawText },
          {
            role: 'user',
            content:
              'That response did not match the required schema and was rejected by validation.\n\n' +
              `Validation errors:\n${firstParse.issues}\n\n` +
              'Return the SAME content corrected to satisfy every requirement above. ' +
              'Output a single valid JSON object and nothing else — no commentary, no code fences.',
          },
        ],
      },
      `${call}:repair`,
      requestOptions
    );
    return response.choices[0]?.message?.content || '{}';
  }, `${call}:repair`);

  const secondParse = parseAndValidate(repairedText, schema);
  if (secondParse.ok) {
    console.warn(`[resilience] ${call} repair succeeded on the second attempt.`);
    return secondParse.value;
  }

  if (bailIf && secondParse.rawJson !== undefined && bailIf(secondParse.rawJson)) return null;

  console.error(
    `[resilience] ${call} failed validation twice; giving up. Second-attempt issues: ${secondParse.issues}`
  );
  throw new AppError('INVALID_OUTPUT', {
    detail: `${call}: schema validation failed on both the initial and repaired responses.`,
  });
}

type ParseResult<T> =
  | { ok: true; value: T; rawJson: unknown }
  | { ok: false; issues: string; rawJson: unknown | undefined };

/** JSON.parse and schema validation share a failure path: both mean "unusable output". */
function parseAndValidate<TSchema extends z.ZodType>(
  text: string,
  schema: TSchema
): ParseResult<z.infer<TSchema>> {
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      issues: `Response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      rawJson: undefined,
    };
  }

  const result = schema.safeParse(rawJson);
  if (result.success) return { ok: true, value: result.data, rawJson };

  return { ok: false, issues: formatIssues(result.error), rawJson };
}

/** Compact, model-readable rendering of the validation failures. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      return `- ${path}: ${issue.message}`;
    })
    .join('\n');
}

/* =====================================================================================
 * Streaming completions
 * ===================================================================================== */

/**
 * Timeout + one retry on ESTABLISHING the stream only.
 *
 * A failure after the first token cannot be retried here: the client is already rendering
 * that text, so a silent re-run would duplicate or contradict what the user is reading. Those
 * failures surface to the client, which keeps the partial text and offers an explicit Retry.
 */
export async function resilientStream(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
  call: string,
  timeoutMs: number = TIMEOUTS.default
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  return withSingleRetry(
    () => trackedStream(openai, params, call, { timeout: timeoutMs, maxRetries: 0 }),
    call
  );
}
