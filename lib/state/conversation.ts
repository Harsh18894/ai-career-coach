import { Profile, CareerPath, Roadmap } from '../ai/schemas';

export type Stage =
  | 'UPLOAD'
  | 'PARSING'
  | 'PROFILE_BUILDING'
  | 'OPENING'
  | 'UNDERSTANDING'
  | 'RECOMMENDING'
  | 'REGENERATING'
  | 'CLOSED';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

export type UserSignals = {
  intentGuess: 'pivot' | 'grow_in_place' | 'early_career' | 'unknown';
  motivations: string[];
  constraints: string[];
  rejectedDirections: string[];
  notes: string[];
};

export type ConversationState = {
  stage: Stage;
  profile: Profile | null;
  signals: UserSignals;
  messages: ChatMessage[];
  deckCount: number;
  shownPaths: string[]; // Keep track of recommended path titles
  chosenPath: CareerPath | null;
  currentPaths: CareerPath[] | null; // Currently showing deck of 3 paths
  roadmap: Roadmap | null; // Execution roadmap for the chosen path
  understandingMessageCount: number; // User messages sent since entering UNDERSTANDING (triggers recommendations at 3)
  profileBuildStep: number; // Index into the guided no-resume question sequence
  profileBuildAnswers: string[]; // Answers collected so far during guided profile building
};

export const INITIAL_SIGNALS: UserSignals = {
  intentGuess: 'unknown',
  motivations: [],
  constraints: [],
  rejectedDirections: [],
  notes: [],
};

export const INITIAL_STATE: ConversationState = {
  stage: 'UPLOAD',
  profile: null,
  signals: INITIAL_SIGNALS,
  messages: [],
  deckCount: 0,
  shownPaths: [],
  chosenPath: null,
  currentPaths: null,
  roadmap: null,
  understandingMessageCount: 0,
  profileBuildStep: 0,
  profileBuildAnswers: [],
};

export type Action =
  | { type: 'START_PARSE' }
  | { type: 'PARSE_FAILED'; error: string }
  | { type: 'SET_PROFILE'; profile: Profile }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'UPDATE_MESSAGE_CONTENT'; id: string; content: string }
  | { type: 'SET_STAGE'; stage: Stage }
  | { type: 'UPDATE_SIGNALS'; signals: Partial<UserSignals> }
  | { type: 'SET_DECKS'; paths: CareerPath[] }
  | { type: 'CHOOSE_PATH'; path: CareerPath }
  | { type: 'REJECT_ALL' }
  | { type: 'RESET' };

export function conversationReducer(
  state: ConversationState,
  action: Action
): ConversationState {
  switch (action.type) {
    case 'START_PARSE':
      return {
        ...state,
        stage: 'PARSING',
        profile: null,
        signals: INITIAL_SIGNALS,
        messages: [],
        deckCount: 0,
        shownPaths: [],
        chosenPath: null,
        currentPaths: null,
      };

    case 'PARSE_FAILED':
      return {
        ...state,
        stage: 'UPLOAD',
      };

    case 'SET_PROFILE': {
      // Map initial inferred persona from profile to intentGuess
      const initialIntent = action.profile.inferredPersona || 'unknown';
      return {
        ...state,
        profile: action.profile,
        stage: 'OPENING',
        signals: {
          ...state.signals,
          intentGuess: initialIntent,
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
      };

    case 'UPDATE_SIGNALS':
      return {
        ...state,
        signals: {
          ...state.signals,
          ...action.signals,
        },
      };

    case 'SET_DECKS': {
      const pathTitles = action.paths.map((p) => p.title);
      return {
        ...state,
        stage: state.stage === 'RECOMMENDING' || state.stage === 'REGENERATING' 
          ? state.stage 
          : 'RECOMMENDING',
        currentPaths: action.paths,
        shownPaths: Array.from(new Set([...state.shownPaths, ...pathTitles])),
        deckCount: state.deckCount + 1,
      };
    }

    case 'CHOOSE_PATH':
      return {
        ...state,
        stage: 'CLOSED',
        chosenPath: action.path,
      };

    case 'REJECT_ALL':
      return {
        ...state,
        stage: 'CLOSED',
        chosenPath: null,
      };

    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}
