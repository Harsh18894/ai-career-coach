import { Profile, CareerPath, Roadmap } from '../ai/schemas';

export type Stage =
  | 'UPLOAD'
  | 'PARSING'
  | 'PROFILE_BUILDING'
  | 'OPENING'
  | 'UNDERSTANDING'
  | 'ASK_COUNTRY'        // NEW (#4): resume spans multiple countries — confirm market before recommending
  | 'RECOMMENDING'
  | 'REGENERATING'
  | 'ASK_PREFERENCES'    // NEW (#8): 2 decks declined — ask what they'd change before a 3rd
  | 'ROADMAP'            // path chosen, roadmap shown — session stays open until the user ends it
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
  shownPaths: string[]; // Keep track of recommended path titles (dedupe across decks)
  rejectedDirections: string[]; // accumulated across decks, fed back into generation
  changeRequests: string | null; // NEW (#8): what the user asked to change after declining 2 decks
  chosenPath: CareerPath | null;
  currentPaths: CareerPath[] | null; // Currently showing deck of 3 paths
  roadmap: Roadmap | null; // Execution roadmap for the chosen path
  roadmapVersion: number; // increments every time `roadmap` is (re)generated — keys/remounts the roadmap panel
  selectedPathIndex: number | null; // which path in currentPaths is selected/expanded in the accordion deck
  roadmapPanelOpen: boolean; // mobile-only drawer open state; desktop split panel is always visible
  understandingMessageCount: number; // user messages sent since entering UNDERSTANDING
  noUsefulInfoStreak: number; // consecutive UNDERSTANDING turns where analyzeSignals reported hasUsableInfo === false
  profileBuildStep: number; // Index into the guided no-resume question sequence
  profileBuildAnswers: string[]; // Answers collected so far during guided profile building
  profileBuildQuestions: string[]; // Actual question text asked at each step so far — the middle
  // steps are now turn-by-turn adaptive (generated live), not a fixed array, so the text actually
  // asked must be tracked alongside the answers for the next adaptive call and the final synthesis.
};

export const INITIAL_SIGNALS: UserSignals = {
  intentGuess: 'unknown',
  motivations: [],
  constraints: [],
  rejectedDirections: [],
  knownSkills: [],   // FIX: required by the type — was missing
  knownDomains: [],  // FIX: required by the type — was missing
  country: null,
  notes: [],
  readyForRecommendation: false,
  hasUsableInfo: true, // optimistic until the first analysis proves otherwise
};

export const INITIAL_STATE: ConversationState = {
  stage: 'UPLOAD',
  profile: null,
  signals: INITIAL_SIGNALS,
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
};

export type Action =
  | { type: 'START_PARSE' }
  | { type: 'PARSE_FAILED'; error: string }
  | { type: 'SET_PROFILE'; profile: Profile }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'UPDATE_MESSAGE_CONTENT'; id: string; content: string }
  | { type: 'SET_STAGE'; stage: Stage }
  | { type: 'UPDATE_SIGNALS'; signals: Partial<UserSignals> }
  | { type: 'RECORD_ANALYSIS'; signals: Partial<UserSignals> } // NEW: update signals + bump understanding counters (#2/#3)
  | { type: 'SET_DECKS'; paths: CareerPath[] }
  | { type: 'SELECT_PATH'; index: number | null }              // NEW: accordion expand/select
  | { type: 'CHOOSE_PATH'; path: CareerPath }
  | { type: 'SET_ROADMAP'; roadmap: Roadmap }                  // NEW: store roadmap + bump version (refresh panel) (#4)
  | { type: 'SET_ROADMAP_PANEL'; open: boolean }               // NEW: mobile drawer toggle
  | { type: 'SET_CHANGE_REQUESTS'; changeRequests: string }    // NEW: capture preferences, then regenerate (#8)
  | { type: 'REJECT_ALL' }
  | { type: 'RESET' };

export function conversationReducer(
  state: ConversationState,
  action: Action
): ConversationState {
  switch (action.type) {
    case 'START_PARSE':
      return {
        ...INITIAL_STATE,
        stage: 'PARSING',
      };

    case 'PARSE_FAILED':
      return {
        ...state,
        stage: 'UPLOAD',
      };

    case 'SET_PROFILE': {
      const initialIntent = action.profile.inferredPersona || 'unknown';
      return {
        ...state,
        profile: action.profile,
        stage: 'OPENING',
        signals: {
          ...state.signals,
          intentGuess: initialIntent,
          // seed known skills/domains from the resume so we never re-ask what's already there (#5/#6)
          knownSkills: Array.from(new Set([...state.signals.knownSkills, ...(action.profile.skills ?? [])])),
          knownDomains: Array.from(new Set([...state.signals.knownDomains, ...(action.profile.domains ?? [])])),
          country: state.signals.country ?? action.profile.country ?? null,
        },
      };
    }

    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.message],
      };

    case 'UPDATE_MESSAGE_CONTENT':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, content: action.content } : m
        ),
      };

    case 'SET_STAGE':
      return {
        ...state,
        stage: action.stage,
        // entering UNDERSTANDING fresh resets the give-up counters
        understandingMessageCount:
          action.stage === 'UNDERSTANDING' && state.stage !== 'UNDERSTANDING'
            ? 0
            : state.understandingMessageCount,
        noUsefulInfoStreak:
          action.stage === 'UNDERSTANDING' && state.stage !== 'UNDERSTANDING'
            ? 0
            : state.noUsefulInfoStreak,
      };

    case 'UPDATE_SIGNALS':
      return {
        ...state,
        signals: { ...state.signals, ...action.signals },
        // keep the accumulated rejection list in sync if it was updated
        rejectedDirections: action.signals.rejectedDirections
          ? Array.from(new Set([...state.rejectedDirections, ...action.signals.rejectedDirections]))
          : state.rejectedDirections,
      };

    case 'RECORD_ANALYSIS': {
      // Used after analyzeSignals during UNDERSTANDING: merge signals AND track readiness/give-up counters.
      const merged = { ...state.signals, ...action.signals };
      return {
        ...state,
        signals: merged,
        rejectedDirections: action.signals.rejectedDirections
          ? Array.from(new Set([...state.rejectedDirections, ...action.signals.rejectedDirections]))
          : state.rejectedDirections,
        understandingMessageCount: state.understandingMessageCount + 1,
        noUsefulInfoStreak:
          action.signals.hasUsableInfo === false ? state.noUsefulInfoStreak + 1 : 0,
      };
    }

    case 'SET_DECKS': {
      const pathTitles = action.paths.map((p) => p.title);
      return {
        ...state,
        stage: 'RECOMMENDING', // always land on RECOMMENDING once a deck is shown (prevents a REGENERATING re-fire loop)
        currentPaths: action.paths,
        selectedPathIndex: null,
        shownPaths: Array.from(new Set([...state.shownPaths, ...pathTitles])),
        deckCount: state.deckCount + 1,
        changeRequests: null, // consume any change requests once they've produced a deck
      };
    }

    case 'SELECT_PATH':
      return {
        ...state,
        selectedPathIndex: action.index,
      };

    case 'CHOOSE_PATH':
      return {
        ...state,
        stage: 'ROADMAP',
        chosenPath: action.path,
        // roadmap itself arrives via SET_ROADMAP after the async call; panel shows a loading state until then
      };

    case 'SET_ROADMAP':
      return {
        ...state,
        roadmap: action.roadmap,
        roadmapVersion: state.roadmapVersion + 1, // refresh the right-hand panel in place (#4 of the UI changes)
        stage: 'ROADMAP',
      };

    case 'SET_ROADMAP_PANEL':
      return {
        ...state,
        roadmapPanelOpen: action.open,
      };

    case 'SET_CHANGE_REQUESTS':
      // (#8) user answered the "what would you change?" question → regenerate a tailored 3rd deck
      return {
        ...state,
        changeRequests: action.changeRequests,
        stage: 'REGENERATING',
      };

    case 'REJECT_ALL': {
      // (#8) deck-aware decline flow. deckCount = number of decks SHOWN so far.
      if (state.deckCount <= 1) {
        // first deck declined → generate a second deck (3 more), same logic
        return { ...state, stage: 'REGENERATING', currentPaths: null, selectedPathIndex: null };
      }
      if (state.deckCount === 2) {
        // second deck declined → stop reshuffling, ask what they'd change
        return { ...state, stage: 'ASK_PREFERENCES', currentPaths: null, selectedPathIndex: null };
      }
      // third (preference-tailored) deck declined → final decline
      return { ...state, stage: 'CLOSED', currentPaths: null, chosenPath: null, selectedPathIndex: null };
    }

    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}