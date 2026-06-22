import { Profile, CareerPath, Roadmap } from '../ai/schemas';

export type Stage =
  | 'PROFILE_BUILDING'
  | 'UNDERSTANDING'
  | 'ASK_COUNTRY'       // resume spans multiple countries — confirm market before recommending
  | 'RECOMMENDING'
  | 'ASK_PREFERENCES'   // two decks declined — ask what they'd change before a third
  | 'ROADMAP'           // path chosen, roadmap shown — session stays open until the user ends it
  | 'CLOSED';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type UserSignals = {
  intentGuess: 'pivot' | 'grow' | 'early_career' | 'unknown';
  motivations: string[];
  constraints: string[];
  rejectedDirections: string[];
  knownSkills: string[];
  knownDomains: string[];
  country?: string | null; // resolved market country (from profile or user confirmation)
  notes: string[];
  readyForRecommendation: boolean; // enough real signal gathered to generate a meaningful, non-generic deck
  hasUsableInfo: boolean; // false if the candidate's replies so far contain no real career-relevant information
};

export type ConversationState = {
  stage: Stage;
  profile: Profile | null;
  signals: UserSignals;
  messages: ChatMessage[];
  deckCount: number;
  shownPaths: string[]; // recommended path titles so far, deduped across decks
  rejectedDirections: string[]; // accumulated across decks, fed back into generation
  changeRequests: string | null; // what the user asked to change after declining 2 decks
  chosenPath: CareerPath | null;
  currentPaths: CareerPath[] | null; // currently showing deck of 3 paths
  roadmap: Roadmap | null; // execution roadmap for the chosen path
  roadmapVersion: number; // increments every time `roadmap` is (re)generated — keys/remounts the roadmap panel
  selectedPathIndex: number | null; // which path in currentPaths is selected/expanded in the accordion deck
  roadmapPanelOpen: boolean; // mobile-only drawer open state; desktop split panel is always visible
  understandingMessageCount: number; // user messages sent since entering UNDERSTANDING
  noUsefulInfoStreak: number; // consecutive UNDERSTANDING turns where analyzeSignals reported hasUsableInfo === false
  profileBuildStep: number; // index into the guided no-resume question sequence
  profileBuildAnswers: string[]; // answers collected so far during guided profile building
  // Actual question text asked at each step. The middle steps are turn-by-turn adaptive
  // (generated live, not a fixed array), so the asked text must be tracked alongside the
  // answers for both the next adaptive call and the final profile-synthesis call.
  profileBuildQuestions: string[];
  // Quick-reply options for the most recent dynamically-generated turn (ongoing UNDERSTANDING
  // follow-ups, guided-intake adaptive questions) — null when there are none (falls back to
  // free text) or once the candidate has replied (cleared synchronously on send).
  pendingTurnOptions: { options: string[]; allowMultiple: boolean } | null;
};

export const INITIAL_STATE: ConversationState = {
  stage: 'PROFILE_BUILDING',
  profile: null,
  signals: {
    intentGuess: 'unknown',
    motivations: [],
    constraints: [],
    rejectedDirections: [],
    knownSkills: [],
    knownDomains: [],
    country: null,
    notes: [],
    readyForRecommendation: false,
    hasUsableInfo: true, // optimistic until the first analysis proves otherwise
  },
  messages: [],
  deckCount: 0,
  shownPaths: [],
  rejectedDirections: [],
  changeRequests: null,
  chosenPath: null,
  currentPaths: null,
  roadmap: null,
  roadmapVersion: 0,
  selectedPathIndex: null,
  roadmapPanelOpen: false,
  understandingMessageCount: 0,
  noUsefulInfoStreak: 0,
  profileBuildStep: 0,
  profileBuildAnswers: [],
  profileBuildQuestions: [],
  pendingTurnOptions: null,
};
