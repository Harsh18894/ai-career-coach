import { describe, it, expect } from 'vitest';
import { getCoach, type ChatMessage, type FullSignals, type Profile } from '../adapter/coach';
import { canRecommend } from '../../lib/ai/coach';
import { cachedCall } from '../lib/cache';
import { judge } from '../lib/judge';
import { recordResult } from '../lib/report-collector';
import { isCheap } from '../config';

/**
 * H1 — Scope discipline during UNDERSTANDING [programmatic + judged]
 *
 * Regression coverage for a real failure: mid-onboarding, the candidate deflected a
 * direction-finding question with "Fetch it from my resume." The coach pivoted into a
 * resume-bullet-writing assistant (offered a "headline or bullet?" menu), and a bare "yes"
 * confirming that menu was then treated as enough signal to recommend — despite no real
 * motivation/constraint/direction ever being established. No other eval suite exercises
 * `streamChatTurn`/`analyzeSignals` at all, which is exactly how this shipped untested.
 *
 *  - Programmatic (always runs, zero API cost): `canRecommend`'s hard gate must reject a
 *    skill/domain-only signal set with no motivation/constraint, even when
 *    `readyForRecommendation` is (wrongly) true — this does not depend on any live model call.
 *  - Judged (skipped in cheap mode): given the exact failure transcript, the next
 *    'understanding' turn must not primarily perform/offer a resume-formatting deliverable,
 *    must redirect to a direction-finding question, and must not phrase it as a forced
 *    A-or-B menu. Also asserts the hard gate still blocks recommending after the exchange.
 */

const MOCK_PROFILE: Profile = {
  name: 'Jordan',
  yearsExperience: 6,
  currentRole: 'Senior Product Manager',
  currentLevel: 'senior_IC',
  roleHistory: [{ title: 'Senior Product Manager', company: 'Northbridge Learning', durationMonths: 30 }],
  skills: ['product strategy', '0-to-1 launches', 'AI feature delivery'],
  domains: ['B2B SaaS', 'edtech'],
  region: 'India',
  notableTransitions: ['Moved from an innovation fellowship into product leadership'],
  tensions: ['Strong senior IC track record but no people-management title yet'],
  inferredPersona: 'grow',
};

const FAILURE_TRANSCRIPT: ChatMessage[] = [
  {
    id: '1',
    role: 'assistant',
    createdAt: new Date(0).toISOString(),
    content:
      "Jordan — you moved from an innovation fellowship into product leadership at Northbridge, shipping 0→1 and 1→N launches that now reach thousands of learners. The clear tension: you're a strong senior IC eyeing a Director-level move into a new market, so you'll need to prove you can own regional-scale outcomes. What's one leadership outcome from your work that best shows you're ready to step into a Head/Director role somewhere new?",
  },
  {
    id: '2',
    role: 'user',
    createdAt: new Date(1).toISOString(),
    content: 'Fetch it from my resume',
  },
];

// Skill/domain already known (matches the real scenario) but NO direction yet — that's the crux:
// the candidate never said how they want to progress, only deflected into an unrelated request.
const BASE_SIGNALS: FullSignals = {
  intentGuess: 'grow',
  motivations: [],
  constraints: [],
  rejectedDirections: [],
  knownSkills: ['product strategy', '0-to-1 launches'],
  knownDomains: ['B2B SaaS', 'edtech'],
  country: 'India',
  notes: [],
  readyForRecommendation: false,
  hasUsableInfo: true,
};

const RUBRIC = `Input: TRANSCRIPT (the conversation so far) and COACH_REPLY (the coach's next message). Return ONLY JSON {"stayed_in_scope":boolean,"redirected_to_direction":boolean,"natural_tone":boolean,"pass":boolean,"reason":string}. stayed_in_scope: false if the reply's main content is performing or offering a resume-bullet/headline-writing or formatting deliverable (e.g. presenting a finished achievement bullet, or asking "as a headline or as a bullet?"). redirected_to_direction: true only if the reply asks (or returns to asking) about how the candidate wants to progress — e.g. growing in their current company vs switching roles/companies, what they're optimizing for, or a similar concrete direction/motivation question — rather than moving toward a recommendation. natural_tone: false if the reply presents a forced multiple-choice "X or Y" menu as its question, or otherwise reads like a form rather than natural speech. pass = stayed_in_scope AND redirected_to_direction AND natural_tone.`;

interface H1Verdict {
  stayed_in_scope: boolean;
  redirected_to_direction: boolean;
  natural_tone: boolean;
  pass: boolean;
  reason: string;
}

describe('H1 — scope discipline during understanding', () => {
  it.skipIf(isCheap())(
    'redirects to a direction question instead of performing a resume-formatting task, and the hard gate still blocks recommending afterward',
    async () => {
      const coach = await getCoach();

      const turnText = await cachedCall('streamChatTurn:H1-resume-bullet-drift', () =>
        coach.streamChatTurn(FAILURE_TRANSCRIPT, MOCK_PROFILE, BASE_SIGNALS, { kind: 'understanding' })
      );
      const updatedSignals = await cachedCall('analyzeSignals:H1-resume-bullet-drift', () =>
        coach.analyzeSignals(FAILURE_TRANSCRIPT, BASE_SIGNALS)
      );

      // The literal regression check: even after this exact exchange, the hard gate must still
      // block recommending. Does not depend on the judge, or on analyzeSignals' own self-assessment.
      const gatePass = !canRecommend(MOCK_PROFILE as any, updatedSignals);

      const { result, votes, disagreement } = await judge<H1Verdict>(RUBRIC, {
        transcript: FAILURE_TRANSCRIPT,
        coach_reply: turnText,
      });

      const judgedPass = result.pass && result.stayed_in_scope && result.redirected_to_direction && result.natural_tone;

      const pass = gatePass && judgedPass;
      const reason = !pass
        ? [
            !gatePass ? `Programmatic: canRecommend wrongly allowed recommendation after this exchange (updatedSignals: ${JSON.stringify(updatedSignals)}).` : null,
            !judgedPass ? `Judged: ${result.reason}` : null,
          ]
            .filter(Boolean)
            .join(' | ')
        : 'Coach redirected to a direction question (not a resume-formatting task) in a natural tone, and the hard gate still blocks recommending.';

      recordResult({
        id: 'H1',
        title: 'Scope discipline during understanding',
        type: 'mixed',
        pass,
        reason,
        votes,
        disagreement,
        meta: { gatePass, updatedSignals, judged: result, turnText },
      });

      expect(pass, reason).toBe(true);
    },
    240_000
  );

  it.skipIf(!isCheap())(
    'programmatic hard-gate check only (no live calls, no snapshot needed — tests the shipped canRecommend directly)',
    () => {
      // Simulates the exact failure mode: the model wrongly self-reports readiness off a bare
      // "yes", but no real motivation/constraint was ever captured. canRecommend must still say no.
      const overEagerSignals: FullSignals = { ...BASE_SIGNALS, readyForRecommendation: true };
      const pass = !canRecommend(MOCK_PROFILE as any, overEagerSignals);

      recordResult({
        id: 'H1',
        title: 'Scope discipline during understanding',
        type: 'mixed',
        pass: pass ? 'skipped' : false,
        reason: pass
          ? 'canRecommend correctly rejects skill/domain-only signals with no direction signal even when readyForRecommendation is true; judged portion skipped under eval:cheap.'
          : 'canRecommend wrongly allowed recommendation with no motivation/constraint signal — the hard gate regressed.',
        meta: { overEagerSignals },
      });

      expect(pass, 'canRecommend must reject readiness with no motivation/constraint signal').toBe(true);
    }
  );
});
