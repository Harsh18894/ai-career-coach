'use client';

import React, { useState } from 'react';
import { track } from '@/lib/analytics';
import { FEEDBACK_ANSWERS, type FeedbackAnswer } from '@/lib/analytics-events';

/* =====================================================================================
 * The one-question prompt, shown once a session has produced something.
 *
 * One question, three buttons, no free-text box. The free-text box is where somebody types
 * their situation — which would put resume-adjacent prose into the analytics stream and break
 * the guarantee the rest of this system is built on. If someone wants to say more, the "who
 * built this" section on the landing page invites it, and that route goes to a human rather
 * than to a log line.
 *
 * "Partly" exists because a two-way answer forces people who found it half-useful into whichever
 * side is closer, and half-useful is the most informative answer a first version can get.
 * ===================================================================================== */

const LABELS: Record<FeedbackAnswer, string> = {
  useful: 'Yes',
  partly: 'Somewhat',
  not_useful: 'Not really',
};

export function SessionFeedback({ path }: { path?: 'sample' | 'own_resume' | 'no_resume' }) {
  const [answered, setAnswered] = useState<FeedbackAnswer | null>(null);

  if (answered) {
    return (
      <div
        className="my-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm"
        role="status"
      >
        Thanks — that&rsquo;s genuinely useful.
        {answered !== 'useful' && (
          <>
            {' '}
            If you have a minute, the repo linked in the footer is the best place to say what was
            off. Specific beats polite.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="my-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p id="session-feedback-q" className="text-sm font-semibold text-slate-800">
        Was this useful?
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby="session-feedback-q">
        {FEEDBACK_ANSWERS.map((answer) => (
          <button
            key={answer}
            type="button"
            onClick={() => {
              setAnswered(answer);
              track('session_feedback', { answer, ...(path ? { path } : {}) });
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {LABELS[answer]}
          </button>
        ))}
      </div>
    </div>
  );
}
