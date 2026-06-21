import OpenAI from 'openai';
import { config } from '../config';

let client: OpenAI | null = null;

function getJudgeClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[judge] OPENAI_API_KEY is not set. The judge (gpt-5-nano via the openai SDK) requires it. ' +
        'Set it in your environment or .env.local before running judged evals.'
    );
  }
  client = new OpenAI({ apiKey });
  return client;
}

function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function formatPayload(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .map(([key, value]) => {
      const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      return `${key.toUpperCase()}:\n${body}`;
    })
    .join('\n\n');
}

async function callJudgeOnce(rubric: string, payload: Record<string, unknown>): Promise<unknown> {
  const openai = getJudgeClient();

  const requestVote = async (): Promise<string> => {
    const response = await openai.chat.completions.create({
      model: config.judgeModel,
      messages: [
        { role: 'system', content: rubric },
        { role: 'user', content: formatPayload(payload) },
      ],
      response_format: { type: 'json_object' },
      // NOTE: gpt-5-nano rejects/ignores a custom temperature on some accounts (matches what
      // we found in the coach app itself, which had temperature stripped from every call).
      // We rely on JSON mode + the rubric's "return ONLY JSON" instruction + majority voting
      // across config.voteCount calls for stability instead of forcing temperature: 0.
    });
    return response.choices[0]?.message?.content ?? '';
  };

  let raw = await requestVote();
  try {
    return JSON.parse(stripFences(raw));
  } catch {
    // Defensive retry once on parse failure.
    raw = await requestVote();
    try {
      return JSON.parse(stripFences(raw));
    } catch (retryErr) {
      const reason = retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(`[judge] Could not parse judge response as JSON after retry (${reason}). Raw: ${raw.slice(0, 500)}`);
    }
  }
}

export async function judge<T extends { pass: boolean }>(
  rubric: string,
  payload: Record<string, unknown>
): Promise<{ result: T; votes: boolean[]; disagreement: boolean }> {
  const results: T[] = [];
  for (let i = 0; i < config.voteCount; i++) {
    const parsed = (await callJudgeOnce(rubric, payload)) as T;
    if (typeof parsed.pass !== 'boolean') {
      throw new Error(`[judge] Vote ${i + 1}/${config.voteCount} missing boolean "pass" field. Got: ${JSON.stringify(parsed)}`);
    }
    results.push(parsed);
  }

  const votes = results.map((r) => r.pass);
  const passCount = votes.filter(Boolean).length;
  const majorityPass = passCount > config.voteCount / 2;
  const disagreement = votes.some((v) => v !== votes[0]);

  // Majority-vote result: keep the first result whose `pass` matches the majority outcome,
  // so the reported `reason`/sub-scores are consistent with the reported verdict.
  const representative = results.find((r) => r.pass === majorityPass) ?? results[0];
  const result: T = { ...representative, pass: majorityPass };

  return { result, votes, disagreement };
}
