import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type OpenAI from 'openai';
import { trackedCompletion, trackedStream, withTelemetryContext } from './telemetry';

/* =====================================================================================
 * Pass B is judged entirely on numbers this module produces, so the module producing them
 * correctly is load-bearing. These check the fields B1 added — TTFT, the request shape, and
 * the reasoning/output token split — against a fake client.
 * ===================================================================================== */

type Emitted = Record<string, unknown>;

function captureLogs(): Emitted[] {
  const records: Emitted[] = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    try {
      records.push(JSON.parse(String(line)));
    } catch {
      /* not one of ours */
    }
  });
  return records;
}

const USAGE = {
  prompt_tokens: 1000,
  completion_tokens: 900,
  total_tokens: 1900,
  prompt_tokens_details: { cached_tokens: 640 },
  completion_tokens_details: { reasoning_tokens: 768 },
};

function fakeClient(create: () => unknown): OpenAI {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

const CONTEXT = { sessionId: 's1', route: '/api/test', isSample: false };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('trackedCompletion', () => {
  it('reports the reasoning/output split rather than one lumped completion count', async () => {
    const records = captureLogs();

    await withTelemetryContext(CONTEXT, () =>
      trackedCompletion(
        fakeClient(async () => ({ usage: USAGE, choices: [{ finish_reason: 'stop' }] })),
        { model: 'gpt-5-nano', messages: [] } as never,
        'extractProfile'
      )
    );

    const record = records.find((r) => r.event === 'llm_call');
    expect(record).toBeDefined();
    // 900 completion tokens, 768 of which were reasoning — the visible answer was 132.
    expect(record).toMatchObject({
      call: 'extractProfile',
      completionTokens: 900,
      reasoningTokens: 768,
      outputTokens: 132,
      cachedTokens: 640,
      finishReason: 'stop',
      streamed: false,
    });
  });

  it('records the reasoning effort and cap actually sent, not what a config says', async () => {
    const records = captureLogs();

    await withTelemetryContext(CONTEXT, () =>
      trackedCompletion(
        fakeClient(async () => ({ usage: USAGE, choices: [{ finish_reason: 'stop' }] })),
        {
          model: 'gpt-5-nano',
          messages: [],
          reasoning_effort: 'low',
          max_completion_tokens: 1500,
        } as never,
        'analyzeSignals'
      )
    );

    expect(records[0]).toMatchObject({ reasoningEffort: 'low', maxOutputTokens: 1500 });
  });

  it('omits the shape fields when nothing was set, rather than inventing a default', async () => {
    // An absent field means "the API default applied", which is a different fact from "low",
    // and a report that guessed would misattribute every baseline measurement.
    const records = captureLogs();

    await withTelemetryContext(CONTEXT, () =>
      trackedCompletion(
        fakeClient(async () => ({ usage: USAGE, choices: [{ finish_reason: 'stop' }] })),
        { model: 'gpt-5-nano', messages: [] } as never,
        'analyzeSignals'
      )
    );

    expect(records[0]).not.toHaveProperty('reasoningEffort');
    expect(records[0]).not.toHaveProperty('maxOutputTokens');
  });

  it('surfaces a length finish_reason, which is what B4 has to detect', async () => {
    const records = captureLogs();

    await withTelemetryContext(CONTEXT, () =>
      trackedCompletion(
        fakeClient(async () => ({ usage: USAGE, choices: [{ finish_reason: 'length' }] })),
        { model: 'gpt-5-mini', messages: [] } as never,
        'generateRoadmap'
      )
    );

    expect(records[0]).toMatchObject({ finishReason: 'length' });
  });
});

describe('trackedStream', () => {
  /** Pulls a stream to completion. The chunks themselves are irrelevant here — the record is
   * emitted when the stream ends, so the only thing that matters is that it ends. */
  async function drain(stream: AsyncIterable<unknown>): Promise<void> {
    for await (const chunk of stream) void chunk;
  }

  function streamOf(chunks: unknown[]) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk;
      },
    };
  }

  it('measures TTFT at the first chunk with visible content, not the first chunk of any kind', async () => {
    const records = captureLogs();

    // The opening chunk carries only a role and an empty delta — exactly the shape that would
    // report a near-zero TTFT if it were counted.
    const chunks = [
      { choices: [{ delta: { role: 'assistant' } }] },
      { choices: [{ delta: { content: '' } }] },
      { choices: [{ delta: { content: 'Hello' } }] },
      { choices: [{ delta: { content: ' there' }, finish_reason: 'stop' }] },
      { choices: [], usage: USAGE },
    ];

    const stream = await withTelemetryContext(CONTEXT, () =>
      trackedStream(
        fakeClient(async () => streamOf(chunks)),
        { model: 'gpt-5-mini', messages: [], stream: true } as never,
        'streamChatTurn'
      )
    );

    await drain(stream);

    const record = records.find((r) => r.event === 'llm_call');
    expect(record).toMatchObject({ streamed: true, call: 'streamChatTurn', finishReason: 'stop' });
    expect(typeof record?.ttftMs).toBe('number');
  });

  it('still emits a record when the stream fails partway', async () => {
    const records = captureLogs();

    const failing = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'partial' } }] };
        throw new Error('connection reset');
      },
    };

    const stream = await withTelemetryContext(CONTEXT, () =>
      trackedStream(
        fakeClient(async () => failing),
        { model: 'gpt-5-mini', messages: [], stream: true } as never,
        'streamChatTurn'
      )
    );

    await expect(drain(stream)).rejects.toThrow('connection reset');

    // A stream that produced tokens and then died has a real TTFT; dropping it would bias the
    // percentiles toward calls that happened to succeed.
    const record = records.find((r) => r.event === 'llm_call');
    expect(record).toMatchObject({ ok: false, streamed: true });
    expect(typeof record?.ttftMs).toBe('number');
  });
});
