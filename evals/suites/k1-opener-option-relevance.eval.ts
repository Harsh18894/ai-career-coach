import { describe, it, expect } from 'vitest';
import { getCoach } from '../adapter/coach';
import { cachedCall } from '../lib/cache';
import { judge } from '../lib/judge';
import { recordResult, assertCheapPreCheckResult } from '../lib/report-collector';
import { isCheap } from '../config';
import { loadResume } from '../lib/fixtures';
import type { AdaptiveQuestion } from '../adapter/coach';

/**
 * K1 — Opening message's quick-reply options must answer the question it actually asked
 * [programmatic pre-check + judged]
 *
 * Regression coverage for a real, observed failure: the personalized opener named specific
 * things from the candidate's own profile ("you're tinkering with the OpenAI API, AI
 * image/video generation, and 3D modeling... which single area here energizes you enough to
 * build two concrete projects this year?") but the quick-reply panel shown underneath it
 * offered generic, unrelated career-stage buttons ("Grow in the same role/organisation",
 * "Make a job switch", "Change domain to something else") that don't correspond to anything
 * the opener asked about. The opener's question is profile-specific and generated fresh every
 * time — its options must be generated alongside it (and reference the actual things it named),
 * never pulled from a fixed, generic set.
 */

const FIXTURE_ID = 'R-grad-01';

interface K1Verdict {
  options_answer_the_question: boolean;
  pass: boolean;
  reason: string;
}

const RUBRIC = `Input: QUESTION (an opening message from a career coach, ending in one question) and OPTIONS (an array of quick-reply button labels the candidate can tap instead of typing, or null). Return ONLY JSON {"options_answer_the_question":boolean,"pass":boolean,"reason":string}. options_answer_the_question: true if OPTIONS is null (correct when the question demands the candidate's own specifics, e.g. asking their name), OR if every option is a genuine, complete answer to the SPECIFIC question asked — in particular, if the question asks the candidate to choose among particular named things (skills, projects, domains, areas) drawn from their own profile, the options must be those same named things, not generic, unrelated career-stage categories (e.g. "make a job switch", "grow in my current role") that don't correspond to anything the question named. False if the options are disconnected from what the question actually asked. pass = options_answer_the_question.`;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );
}

function programmaticPreCheck(turn: AdaptiveQuestion): { pass: boolean; problems: string[] } {
  const problems: string[] = [];
  const message = turn.message ?? '';
  if (!message.trim()) problems.push('Empty message returned.');

  // A "which ...?" question is a strong forced-choice signal — its options should reference
  // the literal alternatives it just named. Zero word overlap between the question and every
  // option is exactly the observed regression (generic buttons unrelated to a specific ask).
  const looksLikeForcedChoice = /\bwhich\b/i.test(message);
  if (looksLikeForcedChoice && turn.options && turn.options.length > 0) {
    const messageTokens = tokenize(message);
    const anyOptionOverlaps = turn.options.some((opt) => {
      const optTokens = tokenize(opt);
      for (const t of optTokens) {
        if (messageTokens.has(t)) return true;
      }
      return false;
    });
    if (!anyOptionOverlaps) {
      problems.push(
        `Question poses a "which" choice ("${message}") but none of the options share a single word with it: ${JSON.stringify(turn.options)} — options must be the specific things the question actually named, not a generic unrelated set.`
      );
    }
  }

  return { pass: problems.length === 0, problems };
}

describe('K1 — opener option relevance', () => {
  it.skipIf(isCheap())(
    "the opener's quick-reply options answer the specific question it asked, not a generic stand-in",
    async () => {
      const coach = await getCoach();

      const profile = await cachedCall(`extractProfile:${FIXTURE_ID}`, () => coach.extractProfile(loadResume(FIXTURE_ID)));
      const turn = await cachedCall('generateOpenerFull:K1', () => coach.generateOpenerFull(profile));

      const preCheck = programmaticPreCheck(turn);

      const { result, votes, disagreement } = await judge<K1Verdict>(RUBRIC, {
        question: turn.message,
        options: turn.options ?? null,
      });

      const judgedPass = result.pass && result.options_answer_the_question;

      const pass = preCheck.pass && judgedPass;
      const reason = !pass
        ? [
            !preCheck.pass ? `Programmatic: ${preCheck.problems.join('; ')}` : null,
            !judgedPass ? `Judged: ${result.reason}` : null,
          ]
            .filter(Boolean)
            .join(' | ')
        : "Options are either omitted (correct for a specifics-demanding question) or genuinely answer the opener's own question.";

      recordResult({
        id: 'K1',
        title: 'Opener option relevance',
        type: 'mixed',
        pass,
        reason,
        votes,
        disagreement,
        meta: { preCheck, judged: result, turn },
      });

      expect(pass, reason).toBe(true);
    },
    240_000
  );

  it.skipIf(!isCheap())(
    'programmatic pre-check only (shape of a frozen snapshot turn)',
    async () => {
      const turn = await cachedCall<AdaptiveQuestion>('generateOpenerFull:K1', async () => {
        throw new Error('unreachable in cheap mode — snapshot should exist');
      });
      const preCheck = programmaticPreCheck(turn);

      assertCheapPreCheckResult({
        id: 'K1',
        title: 'Opener option relevance',
        pass: preCheck.pass,
        details: preCheck.problems,
        passMessage: 'Programmatic shape check passed against frozen snapshot; judged portion skipped under eval:cheap.',
        failMessagePrefix: 'Programmatic shape check failed against frozen snapshot',
        meta: { preCheck },
      });
    }
  );
});
