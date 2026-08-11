import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type OpenAI from 'openai';
import { APIConnectionTimeoutError, APIConnectionError, APIError } from 'openai';
import { z } from 'zod';
import { structuredCompletion, resilientStream, withSingleRetry, TIMEOUTS } from './resilience';
import { AppError } from '../errors';

/* =====================================================================================
 * The OpenAI client is always a mock here — these tests must never make a live call.
 * ===================================================================================== */

type CreateMock = ReturnType<typeof vi.fn>;

function mockClient(create: CreateMock): OpenAI {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

/**
 * Real SDK error instances, not hand-rolled look-alikes.
 *
 * This matters: the SDK does not set `.name` on its error classes, so an earlier version of
 * these tests passed against fakes that carried `name: 'APIConnectionTimeoutError'` while the
 * production classifier never matched a real one. Construct the actual classes so the test
 * cannot drift from the SDK again.
 */
function apiError(status: number): APIError {
  return new APIError(status, { error: { message: `mock upstream ${status}` } }, undefined, undefined);
}

function completionWith(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

const PARAMS = {
  model: 'gpt-5-mini',
  messages: [{ role: 'user' as const, content: 'hello' }],
  response_format: { type: 'json_object' as const },
};

const Schema = z.object({ answer: z.string(), count: z.number() });

beforeEach(() => {
  // The wrappers emit one structured log line per attempt; keep the test output readable.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* =====================================================================================
 * Retry
 * ===================================================================================== */

describe('withSingleRetry', () => {
  it('returns the first result when the attempt succeeds', async () => {
    const attempt = vi.fn().mockResolvedValue('ok');
    await expect(withSingleRetry(attempt, 'test')).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once on a 500 and succeeds', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(apiError(500)).mockResolvedValue('recovered');
    await expect(withSingleRetry(attempt, 'test')).resolves.toBe('recovered');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('retries exactly once on a 429', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(apiError(429)).mockResolvedValue('recovered');
    await expect(withSingleRetry(attempt, 'test')).resolves.toBe('recovered');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('never retries a 400 — that is our bug, not a transient fault', async () => {
    const attempt = vi.fn().mockRejectedValue(apiError(400));
    await expect(withSingleRetry(attempt, 'test')).rejects.toBeInstanceOf(AppError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('gives up after the single retry rather than looping', async () => {
    const attempt = vi.fn().mockRejectedValue(apiError(503));
    await expect(withSingleRetry(attempt, 'test')).rejects.toBeInstanceOf(AppError);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('classifies a real SDK timeout as UPSTREAM_TIMEOUT and retries it', async () => {
    const attempt = vi.fn().mockRejectedValue(new APIConnectionTimeoutError({}));
    await expect(withSingleRetry(attempt, 'test')).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('classifies a real SDK connection drop as UPSTREAM_ERROR and retries it', async () => {
    const attempt = vi.fn().mockRejectedValue(new APIConnectionError({ message: 'Connection error.' }));
    await expect(withSingleRetry(attempt, 'test')).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry a plain programming error — that is our bug, not a transient fault', async () => {
    const attempt = vi.fn().mockRejectedValue(new TypeError('x is not a function'));
    await expect(withSingleRetry(attempt, 'test')).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

/* =====================================================================================
 * Structured output + Zod repair
 * ===================================================================================== */

describe('structuredCompletion', () => {
  it('returns validated data when the first response is well-formed', async () => {
    const create = vi.fn().mockResolvedValue(completionWith('{"answer":"yes","count":2}'));
    const result = await structuredCompletion(mockClient(create), PARAMS, {
      call: 'test',
      schema: Schema,
    });
    expect(result).toEqual({ answer: 'yes', count: 2 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('passes the timeout and disables the SDK\'s own retries', async () => {
    const create = vi.fn().mockResolvedValue(completionWith('{"answer":"yes","count":2}'));
    await structuredCompletion(mockClient(create), PARAMS, {
      call: 'test',
      schema: Schema,
      timeoutMs: TIMEOUTS.roadmap,
    });
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: TIMEOUTS.roadmap, maxRetries: 0 })
    );
  });

  it('makes exactly one repair attempt when validation fails, then succeeds', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completionWith('{"answer":"yes"}')) // missing `count`
      .mockResolvedValueOnce(completionWith('{"answer":"yes","count":7}'));

    const result = await structuredCompletion(mockClient(create), PARAMS, {
      call: 'test',
      schema: Schema,
    });

    expect(result).toEqual({ answer: 'yes', count: 7 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('feeds the bad output and the validation errors back into the repair prompt', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completionWith('{"answer":"yes"}'))
      .mockResolvedValueOnce(completionWith('{"answer":"yes","count":7}'));

    await structuredCompletion(mockClient(create), PARAMS, { call: 'test', schema: Schema });

    const repairMessages = create.mock.calls[1][0].messages;
    // original user turn + the model's rejected answer + the correction request
    expect(repairMessages).toHaveLength(3);
    expect(repairMessages[1]).toEqual({ role: 'assistant', content: '{"answer":"yes"}' });
    expect(repairMessages[2].role).toBe('user');
    expect(repairMessages[2].content).toContain('count');
  });

  it('throws INVALID_OUTPUT after the repair also fails, without looping', async () => {
    const create = vi.fn().mockResolvedValue(completionWith('{"answer":"yes"}'));

    await expect(
      structuredCompletion(mockClient(create), PARAMS, { call: 'test', schema: Schema })
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });

    // one initial attempt + one repair attempt, and nothing more
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('treats unparseable JSON the same as a schema violation and repairs it', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completionWith('not json at all'))
      .mockResolvedValueOnce(completionWith('{"answer":"ok","count":1}'));

    const result = await structuredCompletion(mockClient(create), PARAMS, {
      call: 'test',
      schema: Schema,
    });

    expect(result).toEqual({ answer: 'ok', count: 1 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('resolves to null via bailIf instead of attempting a repair', async () => {
    const create = vi.fn().mockResolvedValue(completionWith('{"hasSufficientInfo":false}'));

    const result = await structuredCompletion(mockClient(create), PARAMS, {
      call: 'test',
      schema: Schema,
      bailIf: (raw) => (raw as { hasSufficientInfo?: unknown })?.hasSufficientInfo === false,
    });

    expect(result).toBeNull();
    // A legitimate "no" is not a failure, so it must not burn a repair call.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('retries the transport error first, then still repairs bad output', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(apiError(500))
      .mockResolvedValueOnce(completionWith('{"answer":"yes"}'))
      .mockResolvedValueOnce(completionWith('{"answer":"yes","count":3}'));

    const result = await structuredCompletion(mockClient(create), PARAMS, {
      call: 'test',
      schema: Schema,
    });

    expect(result).toEqual({ answer: 'yes', count: 3 });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('surfaces a 400 immediately without retrying or repairing', async () => {
    const create = vi.fn().mockRejectedValue(apiError(400));

    await expect(
      structuredCompletion(mockClient(create), PARAMS, { call: 'test', schema: Schema })
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });

    expect(create).toHaveBeenCalledTimes(1);
  });
});

/* =====================================================================================
 * Streaming
 * ===================================================================================== */

describe('resilientStream', () => {
  const streamParams = {
    model: 'gpt-5-mini',
    messages: [{ role: 'user' as const, content: 'hi' }],
    stream: true as const,
  };

  async function* fakeStream() {
    yield { choices: [{ delta: { content: 'hello' } }] };
    yield { choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } };
  }

  it('forces stream_options.include_usage so usage actually arrives', async () => {
    const create = vi.fn().mockResolvedValue(fakeStream());
    await resilientStream(mockClient(create), streamParams, 'test');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ stream_options: { include_usage: true } }),
      expect.objectContaining({ maxRetries: 0 })
    );
  });

  it('retries once when the stream fails to open', async () => {
    const create = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValue(fakeStream());
    await expect(resilientStream(mockClient(create), streamParams, 'test')).resolves.toBeDefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not retry a mid-stream failure — the client owns that recovery', async () => {
    async function* dyingStream() {
      yield { choices: [{ delta: { content: 'partial' } }] };
      throw apiError(500);
    }
    const create = vi.fn().mockResolvedValue(dyingStream());

    const stream = await resilientStream(mockClient(create), streamParams, 'test');

    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of stream) {
          const content = (chunk as { choices: { delta?: { content?: string } }[] }).choices[0]?.delta?.content;
          if (content) seen.push(content);
        }
      })()
    ).rejects.toBeDefined();

    // The consumer keeps whatever arrived before the failure, and no second call was made.
    expect(seen).toEqual(['partial']);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
