import { describe, it, expect } from 'vitest';
import { getCoach } from '../adapter/coach';
import { cachedCall } from '../lib/cache';
import { judge } from '../lib/judge';
import { recordResult, assertCheapPreCheckResult } from '../lib/report-collector';
import { isCheap } from '../config';
import type { AdaptiveQuestion } from '../adapter/coach';

/**
 * J1 — Quick-reply option answerability [programmatic pre-check + judged]
 *
 * Regression coverage for a real, observed failure: the guided no-resume intake asked
 * "List specifically what you've built or worked on: name up to three projects, roles, or
 * tasks and one short line about what you did in each" — a question that demands the
 * candidate's own specifics — but then offered generic category buttons ("a personal
 * project", "a class or coursework project", "part-time or paid job", "volunteer or
 * nonprofit work") as if they were valid answers. Tapping one of those gives the coach no
 * real information; it's not an answer to "what did you do, specifically." This transcript
 * (a student naming skills, then saying they applied them via part-time/volunteer work and
 * personal projects) reliably walks the guided intake into exactly that next question —
 * reproduced here against the live model.
 */

const FIXTURE_QA = [
  {
    question:
      'First — what are you currently doing? (e.g. studying, working, between things) and in what area or role?',
    answer: 'studying in information technology. i know some python and sql. plus i have c language in college',
  },
  {
    question:
      'Good — have you applied python, sql, or c outside of class, like in a personal project, part-time/freelance work, or volunteer work?',
    answer: 'part-time or volunteer work and personal projects',
  },
];

// Generic category placeholders that are never valid answers to a "name your own specifics"
// question — if the model offers any of these as options, it's the exact regression.
const GENERIC_PLACEHOLDER_OPTIONS = [
  'a personal project',
  'a class or coursework project',
  'coursework',
  'part-time or paid job',
  'a paid job',
  'a previous job',
  'volunteer or nonprofit work',
  'volunteer work',
  'a job',
  'an internship',
];

// Phrasing patterns that signal the question demands the candidate's own specifics (names,
// counts, descriptions of what they actually did) — exactly the case where options must be null.
const DEMANDS_SPECIFICS_SIGNATURES = [
  'name up to',
  'name three',
  'name a few',
  'list specifically',
  'specifically what',
  "what you've built",
  'what you have built',
  'what have you built',
  'describe what you did',
  'in each',
];

interface J1Verdict {
  options_are_genuine_answers: boolean;
  pass: boolean;
  reason: string;
}

const RUBRIC = `Input: QUESTION (the next question a coach is about to ask a candidate) and OPTIONS (an array of quick-reply button labels the candidate can tap instead of typing, or null). Return ONLY JSON {"options_are_genuine_answers":boolean,"pass":boolean,"reason":string}. options_are_genuine_answers: true if OPTIONS is null (correct when the question demands the candidate's own specifics and no small fixed set could cover them), OR if every option is itself a complete, concrete, nameable answer that the coach could act on with zero further detail. False if OPTIONS forces the candidate into vague generic buckets (e.g. "a personal project", "a paid job", "volunteer work") when QUESTION explicitly asks them to name, list, or describe specific things from their own history — tapping a bucket like that gives the coach no real information. pass = options_are_genuine_answers.`;

function programmaticPreCheck(turn: AdaptiveQuestion): { pass: boolean; problems: string[] } {
  const problems: string[] = [];
  const question = turn.message ?? '';
  if (!question.trim()) problems.push('Empty question returned.');

  const lowerQuestion = question.toLowerCase();
  const demandsSpecifics = DEMANDS_SPECIFICS_SIGNATURES.some((sig) => lowerQuestion.includes(sig));

  if (demandsSpecifics && turn.options != null && turn.options.length > 0) {
    problems.push(
      `Question demands the candidate's own specifics ("${question}") but options were not omitted: ${JSON.stringify(turn.options)}. Per the options rule, this must be "options": null.`
    );
  }

  if (turn.options) {
    for (const option of turn.options) {
      const normalized = option.trim().toLowerCase();
      if (GENERIC_PLACEHOLDER_OPTIONS.includes(normalized)) {
        problems.push(
          `Option "${option}" is a generic placeholder/category, not a genuine answer — this is the exact regression (e.g. offering "volunteer or nonprofit work" as if picking it answered "what did you specifically do").`
        );
      }
    }
  }

  return { pass: problems.length === 0, problems };
}

describe('J1 — quick-reply option answerability', () => {
  it.skipIf(isCheap())(
    'never offers generic category buttons as answers to a question demanding the candidate\'s own specifics',
    async () => {
      const coach = await getCoach();

      const turn = await cachedCall('nextGuidedProfileQuestionFull:J1', () =>
        coach.nextGuidedProfileQuestionFull(FIXTURE_QA)
      );

      const preCheck = programmaticPreCheck(turn);

      const { result, votes, disagreement } = await judge<J1Verdict>(RUBRIC, {
        question: turn.message,
        options: turn.options ?? null,
      });

      const judgedPass = result.pass && result.options_are_genuine_answers;

      const pass = preCheck.pass && judgedPass;
      const reason = !pass
        ? [
            !preCheck.pass ? `Programmatic: ${preCheck.problems.join('; ')}` : null,
            !judgedPass ? `Judged: ${result.reason}` : null,
          ]
            .filter(Boolean)
            .join(' | ')
        : 'Options are either omitted (correct for a specifics-demanding question) or are each genuine, self-contained answers.';

      recordResult({
        id: 'J1',
        title: 'Quick-reply option answerability',
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
      const turn = await cachedCall<AdaptiveQuestion>('nextGuidedProfileQuestionFull:J1', async () => {
        throw new Error('unreachable in cheap mode — snapshot should exist');
      });
      const preCheck = programmaticPreCheck(turn);

      assertCheapPreCheckResult({
        id: 'J1',
        title: 'Quick-reply option answerability',
        pass: preCheck.pass,
        details: preCheck.problems,
        passMessage: 'Programmatic shape check passed against frozen snapshot; judged portion skipped under eval:cheap.',
        failMessagePrefix: 'Programmatic shape check failed against frozen snapshot',
        meta: { preCheck },
      });
    }
  );
});
