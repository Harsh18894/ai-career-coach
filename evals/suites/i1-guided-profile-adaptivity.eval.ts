import { describe, it, expect } from 'vitest';
import { getCoach } from '../adapter/coach';
import { cachedCall } from '../lib/cache';
import { judge } from '../lib/judge';
import { recordResult, assertCheapPreCheckResult } from '../lib/report-collector';
import { isCheap } from '../config';

/**
 * I1 — Guided no-resume profile-building adaptivity [programmatic pre-check + judged]
 *
 * Regression coverage for a real failure: the guided no-resume intake used to ask a FIXED
 * script of 5 questions regardless of what was already said. A candidate answered the first
 * question with "studying in information technology. i know some python and sql. plus i have
 * c language in college" — already revealing they're a student (no professional role) and
 * naming three skills — and the script still asked "how many years of experience..." (wrong
 * framing for a student) and then "what skills, tools, or things are you comfortable with
 * today?" (flatly redundant; the candidate replied "?"). The middle 3 questions are now
 * turn-by-turn adaptive via `nextGuidedProfileQuestion`; this eval reproduces that exact
 * transcript against the live model.
 */

const FIXTURE_QA = [
  {
    question:
      'First — what are you currently doing? (e.g. studying, working, between things) and in what area or role?',
    answer: 'studying in information technology. i know some python and sql. plus i have c language in college',
  },
];

const RUBRIC = `Input: TRANSCRIPT (a guided intake Q&A so far) and NEXT_QUESTION (the next question the coach is about to ask). Return ONLY JSON {"avoids_years_framing":boolean,"avoids_skill_repeat":boolean,"natural_tone":boolean,"pass":boolean,"reason":string}. avoids_years_framing: false if NEXT_QUESTION asks "how many years of experience" or similarly assumes a professional role, given the transcript shows a student with no professional role — it should instead ask about projects, coursework, or things they've built. avoids_skill_repeat: false if NEXT_QUESTION re-asks for skills/tools/languages already named in the transcript (python, sql, c) as if they were unknown — it's fine (and good) if it asks how those named skills have been applied (frameworks, projects), but not fine to ask "what skills/tools are you comfortable with" again from scratch. natural_tone: false if NEXT_QUESTION reads like a script/form rather than natural speech, or presents a forced multiple-choice menu. pass = avoids_years_framing AND avoids_skill_repeat AND natural_tone.`;

interface I1Verdict {
  avoids_years_framing: boolean;
  avoids_skill_repeat: boolean;
  natural_tone: boolean;
  pass: boolean;
  reason: string;
}

const REGRESSION_SIGNATURES = ['years of experience', 'already comfortable'];

function programmaticPreCheck(question: string): { pass: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!question?.trim()) problems.push('Empty question returned.');
  const lower = question.toLowerCase();
  for (const signature of REGRESSION_SIGNATURES) {
    if (lower.includes(signature)) {
      problems.push(`Question contains regression-signature phrase "${signature}" — looks like a reverted static question: "${question}"`);
    }
  }
  return { pass: problems.length === 0, problems };
}

describe('I1 — guided profile-building adaptivity', () => {
  it.skipIf(isCheap())(
    "the next guided question doesn't re-ask for skills already named or assume a professional role for a student",
    async () => {
      const coach = await getCoach();

      const nextQuestion = await cachedCall('nextGuidedProfileQuestion:I1', () =>
        coach.nextGuidedProfileQuestion(FIXTURE_QA)
      );

      const preCheck = programmaticPreCheck(nextQuestion);

      const { result, votes, disagreement } = await judge<I1Verdict>(RUBRIC, {
        transcript: FIXTURE_QA,
        next_question: nextQuestion,
      });

      const judgedPass = result.pass && result.avoids_years_framing && result.avoids_skill_repeat && result.natural_tone;

      const pass = preCheck.pass && judgedPass;
      const reason = !pass
        ? [
            !preCheck.pass ? `Programmatic: ${preCheck.problems.join('; ')}` : null,
            !judgedPass ? `Judged: ${result.reason}` : null,
          ]
            .filter(Boolean)
            .join(' | ')
        : 'Next question avoids the years-of-experience/skill-repeat regressions and reads naturally.';

      recordResult({
        id: 'I1',
        title: 'Guided profile-building adaptivity',
        type: 'mixed',
        pass,
        reason,
        votes,
        disagreement,
        meta: { preCheck, judged: result, nextQuestion },
      });

      expect(pass, reason).toBe(true);
    },
    240_000
  );

  it.skipIf(!isCheap())(
    'programmatic pre-check only (shape of a frozen snapshot question)',
    async () => {
      const nextQuestion = await cachedCall<string>('nextGuidedProfileQuestion:I1', async () => {
        throw new Error('unreachable in cheap mode — snapshot should exist');
      });
      const preCheck = programmaticPreCheck(nextQuestion);

      assertCheapPreCheckResult({
        id: 'I1',
        title: 'Guided profile-building adaptivity',
        pass: preCheck.pass,
        details: preCheck.problems,
        passMessage: 'Programmatic shape check passed against frozen snapshot; judged portion skipped under eval:cheap.',
        failMessagePrefix: 'Programmatic shape check failed against frozen snapshot',
        meta: { preCheck },
      });
    }
  );
});
