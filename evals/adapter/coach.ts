/**
 * Adapter between the eval harness and the coach app under test.
 *
 * Binds to the REAL lib/ai/coach.ts if it's importable; falls back to a clearly-marked
 * mock otherwise (e.g. running these evals against a fresh checkout with no OPENAI_API_KEY
 * configured yet, or before the module exists in some other branch/fork).
 *
 * We do NOT modify app source to make evals pass — this file only adapts the REAL
 * function signatures to the simplified interface the eval suites consume.
 */

import type { ChatMessage, UserSignals as FullSignals } from '../../lib/state/conversation';
import type { CoachTurn } from '../../lib/ai/coach';
import type { PathTier } from '../../lib/ai/tiers';
import type { AdaptiveQuestion } from '../../lib/ai/schemas';

export type { ChatMessage, FullSignals, CoachTurn, PathTier, AdaptiveQuestion };

export type Profile = {
  name?: string;
  yearsExperience: number;
  currentRole?: string;
  currentLevel?: 'IC' | 'senior_IC' | 'manager' | 'unknown';
  roleHistory: { title: string; company?: string; durationMonths?: number }[];
  skills: string[];
  domains: string[];
  region?: string;
  notableTransitions: string[];
  tensions: string[];
  inferredPersona: 'pivot' | 'grow' | 'early_career' | 'unknown';
};

export type UserSignals = {
  motivations: string[];
  constraints: string[];
  rejectedDirections: string[];
};

export type AmbitionCheck = {
  verdict: 'aligned' | 'too_high' | 'too_low';
  note: string;
};

export type CareerPath = {
  title: string;
  tier: PathTier;
  fitRationale: string;
  salaryRange: string;
  upskills: string[];
  firstMove?: string;
  ambitionCheck: AmbitionCheck;
};

export type RoadmapWeek = {
  week: number;
  focus: string;
  items: string[];
};

export type RoadmapPhase = {
  type: 'course' | 'project' | 'practice' | 'application';
  title: string;
  description?: string;
  weeks: RoadmapWeek[];
};

export type Roadmap = {
  skillLevel: 'beginner' | 'basic' | 'good' | 'experienced';
  summary: string;
  weeklyHoursCommitment: string;
  totalWeeks: number;
  totalDuration: string;
  phases: RoadmapPhase[];
};

export interface CoachAdapter {
  extractProfile(resumeText: string): Promise<Profile>;
  generateOpener(profile: Profile): Promise<string>;
  /**
   * Same call as generateOpener, but returns the full structured turn (options, allowMultiple
   * included) instead of discarding them down to just the message text — needed by evals that
   * check whether the opener's quick-reply options actually answer the question it asked.
   */
  generateOpenerFull(profile: Profile): Promise<AdaptiveQuestion>;
  generatePaths(profile: Profile, signals: UserSignals, shown: string[]): Promise<CareerPath[]>;
  generateRoadmap(profile: Profile, chosenPath: CareerPath, signals: UserSignals): Promise<Roadmap>;
  /**
   * Streams one `chat` turn and drains it into a single string (the eval suite doesn't need to
   * deal with the raw ReadableStream — that's a transport detail of the Next.js route, not
   * something worth re-testing here). Takes the FULL real UserSignals shape (unlike the other
   * methods above, which take the simplified eval-only `UserSignals`) because the turn's
   * behavior depends on fields (knownSkills/knownDomains/readyForRecommendation/etc.) that the
   * simplified type doesn't carry.
   */
  streamChatTurn(chatHistory: ChatMessage[], profile: Profile | null, signals: FullSignals, turn: CoachTurn): Promise<string>;
  /** Also takes/returns the FULL real UserSignals shape — see streamChatTurn's note above. */
  analyzeSignals(chatHistory: ChatMessage[], currentSignals: FullSignals): Promise<FullSignals>;
  /** Next guided-onboarding question (no-resume flow), given the Q&A pairs so far. */
  nextGuidedProfileQuestion(answersSoFar: { question: string; answer: string }[]): Promise<string>;
  /**
   * Same call as nextGuidedProfileQuestion, but returns the full structured turn (options,
   * allowMultiple included) instead of discarding them down to just the message text — needed
   * by evals that check option *quality*, not just the question wording.
   */
  nextGuidedProfileQuestionFull(answersSoFar: { question: string; answer: string }[]): Promise<AdaptiveQuestion>;
  /** True if bound to the real lib/ai/coach.ts; false if running against the mock. */
  isReal: boolean;
}

// ---------------------------------------------------------------------------
// Mock — used only if the real module can't be imported.
// ---------------------------------------------------------------------------

const mockCoach: CoachAdapter = {
  isReal: false,

  async extractProfile(resumeText: string): Promise<Profile> {
    // TODO: wire to real implementation (lib/ai/coach.ts extractProfile was not importable).
    return {
      name: 'Mock Candidate',
      yearsExperience: 2,
      currentRole: 'Sales Development Representative',
      currentLevel: 'IC',
      roleHistory: [{ title: 'SDR', company: 'MockCo', durationMonths: 24 }],
      skills: ['outreach', 'CRM'],
      domains: ['B2B SaaS'],
      region: 'USA',
      notableTransitions: [],
      tensions: ['Mock tension: title has not changed in 2 years'],
      inferredPersona: 'pivot',
    };
  },

  async generateOpener(profile: Profile): Promise<string> {
    // TODO: wire to real implementation.
    return `Mock opener referencing ${profile.currentRole ?? 'your background'} at a generic company.`;
  },

  async generateOpenerFull(profile: Profile): Promise<AdaptiveQuestion> {
    // TODO: wire to real implementation.
    return {
      message: `Mock opener referencing ${profile.currentRole ?? 'your background'} at a generic company.`,
      options: null,
      allowMultiple: false,
      offTopic: false,
    };
  },

  async generatePaths(profile: Profile, signals: UserSignals, shown: string[]): Promise<CareerPath[]> {
    // TODO: wire to real implementation.
    const base = shown.length; // vary output a bit across "regenerate" calls in mock mode
    const mockTiers: PathTier[] = ['conservative', 'realistic', 'ambitious'];
    return [0, 1, 2].map((i) => ({
      title: `Mock Path ${base + i + 1}`,
      tier: mockTiers[i],
      fitRationale: `Mock rationale citing ${profile.currentRole ?? 'their background'} and ${signals.motivations[0] ?? 'their stated motivation'}.`,
      salaryRange: '$80k - $100k USD',
      upskills: ['mock skill A', 'mock skill B'],
      firstMove: 'Mock first move this month.',
      ambitionCheck: { verdict: 'aligned' as const, note: 'Mock ambition check: target roughly matches mock profile.' },
    }));
  },

  async generateRoadmap(profile: Profile, chosenPath: CareerPath, signals: UserSignals): Promise<Roadmap> {
    // TODO: wire to real implementation.
    void profile;
    void signals;
    return {
      skillLevel: 'beginner',
      summary: `Mock roadmap for ${chosenPath.title}.`,
      weeklyHoursCommitment: '8-10 hours/week',
      totalWeeks: 4,
      totalDuration: '4 weeks',
      phases: [
        { type: 'project', title: 'Mock build phase', weeks: [{ week: 1, focus: 'Mock week 1', items: ['Mock item A', 'Mock item B'] }] },
        { type: 'practice', title: 'Mock practice phase', weeks: [{ week: 2, focus: 'Mock week 2', items: ['Mock item C', 'Mock item D'] }] },
        { type: 'application', title: 'Mock apply phase', weeks: [{ week: 3, focus: 'Mock week 3', items: ['Mock item E', 'Mock item F'] }] },
      ],
    };
  },

  async streamChatTurn(chatHistory: ChatMessage[], profile: Profile | null, signals: FullSignals, turn: CoachTurn): Promise<string> {
    // TODO: wire to real implementation (lib/ai/coach.ts streamChatTurn was not importable).
    void chatHistory;
    void profile;
    void signals;
    return `[MOCK] streamChatTurn — turn.kind="${turn.kind}". Not wired to a real model.`;
  },

  async analyzeSignals(chatHistory: ChatMessage[], currentSignals: FullSignals): Promise<FullSignals> {
    // TODO: wire to real implementation.
    void chatHistory;
    return currentSignals;
  },

  async nextGuidedProfileQuestion(answersSoFar: { question: string; answer: string }[]): Promise<string> {
    // TODO: wire to real implementation.
    return `[MOCK] nextGuidedProfileQuestion — ${answersSoFar.length} answer(s) so far. Not wired to a real model.`;
  },

  async nextGuidedProfileQuestionFull(answersSoFar: { question: string; answer: string }[]): Promise<AdaptiveQuestion> {
    // TODO: wire to real implementation.
    return {
      message: `[MOCK] nextGuidedProfileQuestionFull — ${answersSoFar.length} answer(s) so far. Not wired to a real model.`,
      options: null,
      allowMultiple: false,
      offTopic: false,
    };
  },
};

// ---------------------------------------------------------------------------
// Real binding — adapts lib/ai/coach.ts's actual signatures.
// ---------------------------------------------------------------------------

/**
 * generatePaths/generateRoadmap both want the real, full UserSignals shape (intentGuess, notes)
 * even though this adapter's simplified eval-only UserSignals type doesn't carry those fields —
 * shared here so the two real-binding call sites below don't each hand-roll the same object.
 */
function toFullSignals(profile: Profile, signals: UserSignals) {
  return {
    intentGuess: profile.inferredPersona,
    motivations: signals.motivations,
    constraints: signals.constraints,
    rejectedDirections: signals.rejectedDirections,
    knownSkills: [] as string[],
    knownDomains: [] as string[],
    notes: [] as string[],
    // Eval fixtures always represent a fully-gathered conversation by the time generatePaths or
    // generateRoadmap is called — these two gating fields are irrelevant to either.
    readyForRecommendation: true,
    hasUsableInfo: true,
  };
}

/** Drains a streamed text Response (streamChatTurn, nextGuidedProfileQuestion) into a string. */
async function drainTextResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = '';
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
  }
  return text;
}

async function loadRealCoach(): Promise<CoachAdapter | null> {
  try {
    const coachModule = await import('../../lib/ai/coach');

    const real: CoachAdapter = {
      isReal: true,

      async extractProfile(resumeText: string): Promise<Profile> {
        const profile = await coachModule.extractProfile(resumeText);
        if (!profile) {
          // The real function returns null for "not enough real career info to build a profile
          // from." Eval fixtures are authored to always have sufficient info, so a null here
          // means something regressed (or a fixture is broken) — surface it as a hard failure
          // rather than silently mismatching the Promise<Profile> contract.
          throw new Error(
            `extractProfile returned null (insufficient info) for a fixture that should be parseable. ` +
            `First 200 chars: ${resumeText.slice(0, 200)}`
          );
        }
        return profile as Profile;
      },

      async generateOpener(profile: Profile): Promise<string> {
        // Real function now returns structured { message, options, allowMultiple } instead of a
        // plain string — this adapter's interface only needs the message text, so options are
        // discarded here (irrelevant to b1/b3, which only judge the message's grounding/wording).
        const result = await coachModule.generateOpeningMessage(profile as any);
        return result.message;
      },

      async generateOpenerFull(profile: Profile): Promise<AdaptiveQuestion> {
        return coachModule.generateOpeningMessage(profile as any);
      },

      async generatePaths(profile: Profile, signals: UserSignals, shown: string[]): Promise<CareerPath[]> {
        // Real generatePaths wants rejectedDirections as a separate 4th arg too, even though
        // it's also a field on the full signals object built by toFullSignals above.
        const paths = await coachModule.generatePaths(
          profile as any,
          toFullSignals(profile, signals),
          shown,
          signals.rejectedDirections
        );
        return paths as CareerPath[];
      },

      async generateRoadmap(profile: Profile, chosenPath: CareerPath, signals: UserSignals): Promise<Roadmap> {
        const roadmap = await coachModule.generateRoadmap(profile as any, chosenPath as any, toFullSignals(profile, signals));
        return roadmap as Roadmap;
      },

      async streamChatTurn(chatHistory: ChatMessage[], profile: Profile | null, signals: FullSignals, turn: CoachTurn): Promise<string> {
        const response = await coachModule.streamChatTurn(chatHistory, profile as any, signals, turn);
        return drainTextResponse(response);
      },

      async analyzeSignals(chatHistory: ChatMessage[], currentSignals: FullSignals): Promise<FullSignals> {
        return coachModule.analyzeSignals(chatHistory, currentSignals);
      },

      async nextGuidedProfileQuestion(answersSoFar: { question: string; answer: string }[]): Promise<string> {
        // Real function now returns structured { message, options, allowMultiple } instead of
        // a streamed Response — this adapter's interface only needs the question text, so the
        // options/allowMultiple fields (irrelevant to i1-guided-profile-adaptivity.eval.ts) are
        // discarded here.
        const result = await coachModule.nextGuidedProfileQuestion(answersSoFar);
        return result.message;
      },

      async nextGuidedProfileQuestionFull(answersSoFar: { question: string; answer: string }[]): Promise<AdaptiveQuestion> {
        return coachModule.nextGuidedProfileQuestion(answersSoFar);
      },
    };

    return real;
  } catch {
    return null;
  }
}

let cachedAdapter: Promise<CoachAdapter> | null = null;

/** Resolves to the real adapter if lib/ai/coach.ts is importable, else the mock. */
export function getCoach(): Promise<CoachAdapter> {
  if (!cachedAdapter) {
    cachedAdapter = loadRealCoach().then((real) => real ?? mockCoach);
  }
  return cachedAdapter;
}
