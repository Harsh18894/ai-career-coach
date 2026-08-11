import OpenAI from 'openai';

/** Shared OpenAI client constructor. Every module that makes model calls (coach.ts,
 * resume-review/*) uses this instead of constructing its own — one place to fail loudly if the
 * key is missing. */
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not defined.');
  }
  return new OpenAI({ apiKey });
}
