'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, RotateCcw, AlertTriangle, Sparkles, Loader2, Compass, Globe } from 'lucide-react';
import { Profile, CareerPath, Roadmap, AdaptiveQuestion } from '@/lib/ai/schemas';
import type { CoachTurn } from '@/lib/ai/coach';
import { ConversationState, ChatMessage, UserSignals, INITIAL_STATE } from '@/lib/state/conversation';
import MessageBubble from './MessageBubble';
import ThinkingBubble from './ThinkingBubble';
import PathDeck from './PathDeck';
import RoadmapTitleCard from './RoadmapTitleCard';
import RoadmapPanel from './RoadmapPanel';
import QuickOptions, { type QuickOption } from './QuickOptions';

// Readiness gating for the UNDERSTANDING phase: ask at least this many questions before
// recommending, recommend regardless after the cap so the conversation can't stall forever,
// and bail into the witty decline if the candidate has given nothing usable for this many turns.
const MIN_UNDERSTANDING_TURNS = 2;
const MAX_UNDERSTANDING_TURNS = 5;
const NO_USABLE_INFO_DECLINE_STREAK = 3;

// Total step count stays fixed at 5 for a predictable, bounded intake. Only the opening question
// (nothing is known yet) and the closing region question (never redundant, always needed for
// resolveMarket) are static — the 3 middle questions are turn-by-turn adaptive (see
// handleProfileBuildAnswer), generated live from everything answered so far via
// nextGuidedProfileQuestion, so they never re-ask something already said.
const PROFILE_BUILD_TOTAL_STEPS = 5;
const PROFILE_BUILD_INTRO_QUESTION =
  "First — what are you currently doing? (e.g. studying, working, between things) and in what area or role?";
const PROFILE_BUILD_REGION_QUESTION = "Last one — what country or region are you based in?";

// Static fallback quick-select options for the candidate's very first UNDERSTANDING reply, used
// ONLY when no model-generated options exist for that turn — i.e. the no-resume guided-intake's
// transition into UNDERSTANDING (a streamed free-text message, not structured data; see the
// `streamChatTurn`/`buildUnderstandingInstruction` comments for why that one call site stays on
// the streaming path). The resume-upload path's first reply gets its options dynamically from
// `generateOpeningMessage` instead (carried in `pendingTurnOptions` from the very first render —
// see ChatWindow's initial state below), since that opener's question is profile-specific and a
// fixed panel can't reliably match it (e.g. "which of these 3 named project areas energizes
// you?" needs THOSE 3 named areas as options, not a generic "grow / switch / change domain" set).
//
// `value` is a natural sentence (not a category code) so analyzeSignals reads it exactly like
// any other typed reply. "Grow in the same role" / "make a job switch" both presuppose an
// existing job — nonsensical for a student/recent grad with no role to grow in or switch from
// (inferredPersona 'early_career'), so that persona gets its own set framed around landing a
// first role/internship instead. Everyone else (pivot/grow/unknown) gets the original set.
const DIRECTION_OPTIONS_DEFAULT: QuickOption[] = [
  { label: 'Grow in the same role/organisation', value: "I'd like to grow in my current role and organization rather than switch jobs." },
  { label: 'Make a job switch', value: "I'm looking to make a job switch to a new company." },
  { label: 'Change domain to something else', value: "I want to change my domain or field entirely — explore something different from what I'm in now." },
];

const DIRECTION_OPTIONS_EARLY_CAREER: QuickOption[] = [
  { label: 'Land my first internship or job', value: "I'm looking to land my first internship or job — I don't have a role to grow in or switch from yet." },
  { label: 'Build a portfolio to get noticed', value: "I want to build a stronger portfolio of projects so I have something concrete to show employers." },
  { label: 'Figure out which domain to focus on', value: "I'm still figuring out which domain or specialization to focus on." },
];

function getDirectionOptions(persona: Profile['inferredPersona'] | undefined): QuickOption[] {
  return persona === 'early_career' ? DIRECTION_OPTIONS_EARLY_CAREER : DIRECTION_OPTIONS_DEFAULT;
}

// Common categories for "what should we change?" after 2 declined decks — labels double as the
// sent value (natural enough on their own), so no separate `value` is needed.
const ASK_PREFERENCES_OPTIONS: QuickOption[] = [
  { label: 'A different domain or industry' },
  { label: 'A different seniority level or scope' },
  { label: 'More remote-friendly roles' },
];

// Quick categories for the no-resume guided intake's very first question.
const PROFILE_BUILD_INTRO_OPTIONS: QuickOption[] = [
  { label: 'Studying' },
  { label: 'Working' },
  { label: 'Between things / exploring' },
];

// Common reasons for declining a deck — the trailing option intentionally sends an empty string
// so handleRegenerate falls back to its no-reason path ("No, show me 3 different paths.") instead
// of treating "no specific reason" as a typed-out reason.
const REJECT_REASON_OPTIONS: QuickOption[] = [
  { label: 'Too technical or too senior for me' },
  { label: 'Wrong domain or industry' },
  { label: "Salary doesn't match my expectations" },
  { label: 'No specific reason — just show me different paths', value: '' },
];

// Shared request/response handling for the `/api/coach` endpoint — every action follows the
// same fetch -> parse JSON -> throw on non-ok shape; this was previously duplicated at every
// call site. Split into two pieces (rather than one do-it-all function) so a caller that needs
// to fire the request early and parse the result later (see handleSelectPath's roadmap fetch,
// run concurrently with the closing-message stream) can still reuse the parsing half.
function makeMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: Math.random().toString(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function coachRequestInit(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function parseCoachResponse<T>(response: Response, fallbackErrorMessage: string): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || fallbackErrorMessage);
  }
  return data as T;
}

async function postCoach<T>(body: Record<string, unknown>, fallbackErrorMessage: string): Promise<T> {
  const response = await fetch('/api/coach', coachRequestInit(body));
  return parseCoachResponse<T>(response, fallbackErrorMessage);
}

interface ChatWindowProps {
  initialProfile: Profile | null;
  initialOpener: AdaptiveQuestion | null;
  onReset: () => void;
}

export default function ChatWindow({
  initialProfile,
  initialOpener,
  onReset,
}: ChatWindowProps) {
  const [state, setState] = useState<ConversationState>(() => {
    if (initialProfile && initialOpener) {
      return {
        ...INITIAL_STATE,
        stage: 'UNDERSTANDING',
        profile: initialProfile,
        signals: {
          ...INITIAL_STATE.signals,
          intentGuess: initialProfile.inferredPersona,
        },
        messages: [
          {
            id: 'opener',
            role: 'assistant',
            content: initialOpener.message,
            createdAt: new Date().toISOString(),
          },
        ],
        // Carries the opener's own profile-specific options (or null, e.g. when the opener had
        // to ask for the candidate's name instead) — see the DIRECTION_OPTIONS_DEFAULT comment
        // above for why this can't be a static panel.
        pendingTurnOptions: initialOpener.options
          ? { options: initialOpener.options, allowMultiple: initialOpener.allowMultiple }
          : null,
      };
    }

    // No resume available (or it had nothing useful) — build the profile via guided chat instead.
    return {
      ...INITIAL_STATE,
      stage: 'PROFILE_BUILDING',
      messages: [
        {
          id: 'no-resume-intro',
          role: 'assistant',
          content: "No worries if you do not have a resume. Starting out can be hard. Let's build your profile to get started.",
          createdAt: new Date().toISOString(),
        },
        {
          id: 'no-resume-q0',
          role: 'assistant',
          content: PROFILE_BUILD_INTRO_QUESTION,
          createdAt: new Date().toISOString(),
        },
      ],
      profileBuildQuestions: [PROFILE_BUILD_INTRO_QUESTION],
    };
  });

  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isRoadmapLoading, setIsRoadmapLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  // For regeneration feedback — QuickOptions owns its own "Something else" text internally, so
  // this is just the gate for whether the reason panel is showing at all.
  const [showRejectReasonInput, setShowRejectReasonInput] = useState(false);

  // Countries detected on the resume, surfaced as quick-select options when ASK_COUNTRY fires.
  const [detectedCountries, setDetectedCountries] = useState<string[]>([]);

  // Every site below renders a <QuickOptions> panel and disables the main chat box for the same
  // duration — gates are kept as simple booleans so the textarea's `disabled` condition (further
  // down) can OR them all together in one place.
  const isFirstUnderstandingReply = state.stage === 'UNDERSTANDING' && state.understandingMessageCount === 0;
  // Only the no-resume transition reaches this with pendingTurnOptions still null (it stays on
  // the streaming free-text path) — the resume-upload opener already populated pendingTurnOptions
  // at init, so this static fallback must not also render and double up the options panels.
  const showDirectionOptions = isFirstUnderstandingReply && state.pendingTurnOptions === null;
  const showCountryOptions = state.stage === 'ASK_COUNTRY';
  const showProfileBuildIntroOptions = state.stage === 'PROFILE_BUILDING' && state.profileBuildStep === 0;
  const showAskPreferencesOptions = state.stage === 'ASK_PREFERENCES';
  const anyQuickOptionsShowing =
    showDirectionOptions || showCountryOptions || showProfileBuildIntroOptions || showAskPreferencesOptions ||
    state.pendingTurnOptions !== null;

  // For roadmap adjustment feedback — QuickOptions (inside RoadmapPanel) owns the typed text.
  const [showRoadmapFeedbackInput, setShowRoadmapFeedbackInput] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastScrollAtRef = useRef(0);
  const pendingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    lastScrollAtRef.current = Date.now();
  };

  // Throttled to at most once per 200ms — this effect's deps change on every streamed token
  // (each chunk produces a new `messages` array), and calling `scrollIntoView({behavior:'smooth'})`
  // on every single one fights its own in-progress animation for no visible benefit. A trailing
  // call is always scheduled, so the view still ends up following the latest content exactly
  // as before — it just updates at a capped rate during a fast stream instead of every token.
  useEffect(() => {
    const SCROLL_THROTTLE_MS = 200;
    const elapsed = Date.now() - lastScrollAtRef.current;

    if (pendingScrollTimeoutRef.current) {
      clearTimeout(pendingScrollTimeoutRef.current);
      pendingScrollTimeoutRef.current = null;
    }

    if (elapsed >= SCROLL_THROTTLE_MS) {
      scrollToBottom();
    } else {
      pendingScrollTimeoutRef.current = setTimeout(scrollToBottom, SCROLL_THROTTLE_MS - elapsed);
    }

    return () => {
      if (pendingScrollTimeoutRef.current) {
        clearTimeout(pendingScrollTimeoutRef.current);
      }
    };
  }, [state.messages, isThinking, state.currentPaths, showRejectReasonInput, state.roadmap, isRoadmapLoading]);

  useEffect(() => {
    const saved = localStorage.getItem('career_coach_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.profile && parsed.messages && parsed.messages.length > 0) {
          setState(parsed);
        }
      } catch (e) {
        console.error('Failed to restore session:', e);
      }
    }
  }, []);

  // Save to localStorage on state changes — debounced. `state` changes on every individual
  // streamed token (each chunk produces a new `messages` array), and a synchronous
  // JSON.stringify + localStorage.setItem of the whole conversation on every single token is
  // wasted main-thread work. Debouncing collapses a burst of updates into one write after a
  // short quiet period; a visibility/unload flush keeps the last few tokens from being lost if
  // the tab closes mid-burst.
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!state.profile) return;
    const timeoutId = setTimeout(() => {
      localStorage.setItem('career_coach_session', JSON.stringify(state));
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [state]);

  useEffect(() => {
    const flush = () => {
      if (latestStateRef.current.profile) {
        localStorage.setItem('career_coach_session', JSON.stringify(latestStateRef.current));
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleProfileBuildAnswer = async (textToSend: string) => {
    const userMessage: ChatMessage = makeMessage('user', textToSend);

    const updatedMessages = [...state.messages, userMessage];
    const updatedAnswers = [...state.profileBuildAnswers, textToSend.trim()];
    const questionsAskedSoFar = state.profileBuildQuestions;
    const nextStep = state.profileBuildStep + 1;
    setInputValue('');
    setState((prev) => ({ ...prev, pendingTurnOptions: null }));

    // Middle 3 steps are turn-by-turn adaptive — ask the model for the next question given
    // everything answered so far, instead of indexing into a fixed script.
    if (nextStep >= 1 && nextStep <= 3) {
      setApiError(null);
      setIsThinking(true);
      setState((prev) => ({
        ...prev,
        profileBuildAnswers: updatedAnswers,
        messages: updatedMessages,
      }));

      try {
        const qaPairs = questionsAskedSoFar.map((question, i) => ({ question, answer: updatedAnswers[i] }));
        const response = await fetch('/api/coach', coachRequestInit({ action: 'next-profile-question', answers: qaPairs }));
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to generate the next question.');
        }

        const nextQuestion: { message: string; options?: string[] | null; allowMultiple: boolean; offTopic?: boolean } = await response.json();
        await revealIntoNewMessage(updatedMessages, nextQuestion.message);

        // Same hard boundary as postUnderstandingTurn below — the candidate tried to redirect
        // the conversation away from career coaching entirely, nextQuestion.message is already
        // the firm decline-and-close statement, so end the session instead of continuing the
        // guided intake.
        if (nextQuestion.offTopic) {
          setState((prev) => ({ ...prev, stage: 'CLOSED', pendingTurnOptions: null }));
          return;
        }

        setState((prev) => ({
          ...prev,
          profileBuildStep: nextStep,
          profileBuildQuestions: [...prev.profileBuildQuestions, nextQuestion.message],
          pendingTurnOptions: nextQuestion.options && nextQuestion.options.length > 0
            ? { options: nextQuestion.options, allowMultiple: nextQuestion.allowMultiple }
            : null,
        }));
      } catch (err: any) {
        console.error('Next profile question error:', err);
        setApiError(err.message || 'Something went wrong while building your profile.');
      } finally {
        setIsThinking(false);
      }
      return;
    }

    // Closing region question is always static — never redundant, always needed, no API call.
    if (nextStep === PROFILE_BUILD_TOTAL_STEPS - 1) {
      const nextQuestionMessage: ChatMessage = makeMessage('assistant', PROFILE_BUILD_REGION_QUESTION);
      setState((prev) => ({
        ...prev,
        profileBuildStep: nextStep,
        profileBuildAnswers: updatedAnswers,
        profileBuildQuestions: [...prev.profileBuildQuestions, PROFILE_BUILD_REGION_QUESTION],
        messages: [...updatedMessages, nextQuestionMessage],
      }));
      return;
    }

    // All questions answered — build the profile, then continue exactly like the normal flow.
    setApiError(null);
    setIsThinking(true);
    setState((prev) => ({
      ...prev,
      profileBuildAnswers: updatedAnswers,
      messages: updatedMessages,
    }));

    try {
      const buildData = await postCoach<{ profile: Profile }>(
        {
          action: 'build-profile',
          answers: questionsAskedSoFar.map((question, i) => ({
            question,
            answer: updatedAnswers[i],
          })),
        },
        'Failed to build your profile.'
      );

      const builtProfile: Profile = buildData.profile;
      const nextSignals: UserSignals = {
        ...state.signals,
        intentGuess: builtProfile.inferredPersona,
      };
      const transitionMessage: ChatMessage = makeMessage(
        'assistant',
        "Perfect — that gives me a real picture of where you're starting from. A few quick questions, then I'll map out some paths for you."
      );
      const messagesWithTransition = [...updatedMessages, transitionMessage];

      setState((prev) => ({
        ...prev,
        stage: 'UNDERSTANDING',
        profile: builtProfile,
        signals: nextSignals,
        understandingMessageCount: 0,
        messages: messagesWithTransition,
      }));

      await streamCoachTurn(messagesWithTransition, { kind: 'understanding' }, nextSignals, builtProfile);
    } catch (err: any) {
      console.error('Profile build error:', err);
      setApiError(err.message || 'Something went wrong while building your profile.');
    } finally {
      setIsThinking(false);
    }
  };

  // Drains a streamed text Response into a single new assistant message, appended to
  // `messagesForTurn` and grown token-by-token in state. Returns the final accumulated text —
  // some callers (the guided-intake question flow) need the full text afterward, e.g. to track
  // it as part of `profileBuildQuestions`.
  const streamIntoNewMessage = async (
    messagesForTurn: ChatMessage[],
    response: Response
  ): Promise<string> => {
    const initialMessage: ChatMessage = makeMessage('assistant', '');
    const messageId = initialMessage.id;

    setState((prev) => ({
      ...prev,
      messages: [...messagesForTurn, initialMessage],
    }));

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulatedContent += decoder.decode(value);
        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === messageId ? { ...m, content: accumulatedContent } : m
          ),
        }));
      }
    }

    return accumulatedContent;
  };

  // Posts a `chat` turn and streams the reply via streamIntoNewMessage. Always sends an
  // explicit `turn` so the server applies the right stage-specific instruction (it defaults to
  // 'understanding' if omitted, which would silently misroute closing/roadmap turns).
  const streamCoachTurn = async (
    messagesForTurn: ChatMessage[],
    turn: CoachTurn,
    signalsForTurn: UserSignals,
    // Defaults to the current state.profile — pass explicitly when calling right after a
    // setState that updated the profile, since that update hasn't landed in this closure yet.
    profileForTurn: Profile | null = state.profile
  ) => {
    const chatResponse = await fetch('/api/coach', coachRequestInit({
      action: 'chat',
      messages: messagesForTurn,
      profile: profileForTurn,
      signals: signalsForTurn,
      turn,
    }));

    if (!chatResponse.ok) {
      const errData = await chatResponse.json();
      throw new Error(errData.error || 'Streaming error.');
    }

    await streamIntoNewMessage(messagesForTurn, chatResponse);
  };

  // Reveals an already-known full string into a new assistant message via a fast chunked
  // update, instead of true token streaming — used for the structured (non-streaming)
  // AdaptiveQuestion turns below, so they still read as "the coach is typing" rather than the
  // whole message appearing at once. Mirrors streamIntoNewMessage's "create empty message, then
  // grow content" shape exactly, so ThinkingBubble hands off to it the same way either path.
  const revealIntoNewMessage = async (messagesForTurn: ChatMessage[], fullText: string): Promise<void> => {
    const initialMessage: ChatMessage = makeMessage('assistant', '');
    const messageId = initialMessage.id;

    setState((prev) => ({
      ...prev,
      messages: [...messagesForTurn, initialMessage],
    }));

    const CHUNK_SIZE = 5;
    const CHUNK_DELAY_MS = 20;
    for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
      const revealed = fullText.slice(0, i + CHUNK_SIZE);
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => (m.id === messageId ? { ...m, content: revealed } : m)),
      }));
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    }
    // Covers fullText.length === 0 and guarantees the final content is exactly fullText.
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (m.id === messageId ? { ...m, content: fullText } : m)),
    }));
  };

  // Posts an ongoing UNDERSTANDING-phase turn (every reply after the candidate's first) as a
  // structured, non-streaming call, reveals the question, then sets pendingTurnOptions from the
  // response so the right QuickOptions (single or multi-select, or none) renders next.
  const postUnderstandingTurn = async (
    messagesForTurn: ChatMessage[],
    signalsForTurn: UserSignals,
    profileForTurn: Profile | null = state.profile
  ) => {
    const response = await fetch('/api/coach', coachRequestInit({
      action: 'understanding-turn',
      messages: messagesForTurn,
      profile: profileForTurn,
      signals: signalsForTurn,
    }));

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to generate the next question.');
    }

    const turn: { message: string; options?: string[] | null; allowMultiple: boolean; offTopic?: boolean } = await response.json();
    await revealIntoNewMessage(messagesForTurn, turn.message);
    // The candidate tried to redirect the conversation away from career coaching entirely (e.g.
    // asking for movie recommendations) — `turn.message` is already the firm decline-and-close
    // statement, so end the session here rather than offering more quick-pick options to type
    // into, which would imply the conversation is still open.
    if (turn.offTopic) {
      setState((prev) => ({ ...prev, stage: 'CLOSED', pendingTurnOptions: null }));
      return;
    }
    setState((prev) => ({
      ...prev,
      pendingTurnOptions: turn.options && turn.options.length > 0 ? { options: turn.options, allowMultiple: turn.allowMultiple } : null,
    }));
  };

  // Calls the `recommend` action and handles every shape it can return: a real deck, `notReady`
  // (the server's readiness gate disagrees even though the client thought it was time), or
  // `needsCountry` (the resume spans multiple countries and the market isn't confirmed yet).
  // Centralized so every caller (initial recommend, regenerate) gets the same non-crashing handling.
  const runRecommendFlow = async (
    messagesSoFar: ChatMessage[],
    signalsForRecommend: UserSignals,
    options?: { changeRequests?: string; transitionMessage?: string }
  ) => {
    const recommendData = await postCoach<{
      needsCountry?: boolean;
      detectedCountries?: string[];
      notReady?: boolean;
      paths?: CareerPath[];
    }>(
      {
        action: 'recommend',
        profile: state.profile,
        signals: signalsForRecommend,
        shownPaths: state.shownPaths,
        rejectedDirections: signalsForRecommend.rejectedDirections,
        changeRequests: options?.changeRequests,
      },
      'Failed to generate recommendations.'
    );

    if (recommendData.needsCountry) {
      setDetectedCountries(recommendData.detectedCountries ?? []);
      setState((prev) => ({ ...prev, stage: 'ASK_COUNTRY', messages: messagesSoFar }));
      await streamCoachTurn(
        messagesSoFar,
        { kind: 'ask_country', detectedCountries: recommendData.detectedCountries ?? [] },
        signalsForRecommend
      );
      return;
    }

    if (recommendData.notReady) {
      setState((prev) => ({ ...prev, stage: 'UNDERSTANDING', messages: messagesSoFar }));
      await postUnderstandingTurn(messagesSoFar, signalsForRecommend);
      return;
    }

    // Reached only once needsCountry/notReady have been ruled out above — route.ts's contract
    // guarantees `paths` is present in every other case. `options.transitionMessage` (e.g. "Got
    // it, let me compile three paths...") is only ever added to the chat HERE, once paths are
    // actually in hand — never optimistically before this call, since `notReady` above can still
    // bounce back to another question, and showing "let me compile your paths" right before
    // asking yet another question is exactly the confusing, repeated-message bug this avoids.
    const newPaths: CareerPath[] = recommendData.paths!;
    const newPathTitles = newPaths.map((p) => p.title);
    const messagesWithAck = options?.transitionMessage
      ? [...messagesSoFar, makeMessage('assistant', options.transitionMessage)]
      : messagesSoFar;
    const coachRecMessage: ChatMessage = makeMessage(
      'assistant',
      "Here are **3 customized career directions** built from your background and priorities. Review them below. Tell me which one makes sense to explore, or let's pivot if they're off."
    );

    setState((prev) => ({
      ...prev,
      stage: 'RECOMMENDING',
      signals: signalsForRecommend,
      currentPaths: newPaths,
      selectedPathIndex: null,
      shownPaths: Array.from(new Set([...prev.shownPaths, ...newPathTitles])),
      deckCount: prev.deckCount + 1,
      changeRequests: null,
      messages: [...messagesWithAck, coachRecMessage],
    }));
  };

  // The candidate has declined 2 full decks and just answered "what would you change" —
  // this raw text IS the changeRequests payload, not something to run through analyzeSignals.
  const handleAskPreferencesAnswer = async (textToSend: string) => {
    setApiError(null);
    const userMessage: ChatMessage = makeMessage('user', textToSend);
    const updatedMessages = [...state.messages, userMessage];
    setInputValue('');
    setIsThinking(true);
    setState((prev) => ({
      ...prev,
      changeRequests: textToSend,
      messages: updatedMessages,
    }));

    try {
      await runRecommendFlow(updatedMessages, state.signals, { changeRequests: textToSend });
    } catch (err: any) {
      console.error('Preferences-driven recommend error:', err);
      setApiError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isThinking) return;

    if (state.stage === 'PROFILE_BUILDING') {
      await handleProfileBuildAnswer(textToSend);
      return;
    }

    if (state.stage === 'ASK_PREFERENCES') {
      await handleAskPreferencesAnswer(textToSend);
      return;
    }

    setApiError(null);
    const userMessage: ChatMessage = makeMessage('user', textToSend);

    const updatedMessages = [...state.messages, userMessage];
    setState((prev) => ({
      ...prev,
      messages: updatedMessages,
      pendingTurnOptions: null,
    }));
    setInputValue('');
    setIsThinking(true);

    try {
      // The branch decision below (decline / recommend / continue) depends on this result,
      // so it's awaited before anything else.
      const analyzeResponse = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          messages: updatedMessages,
          signals: state.signals,
        }),
      });

      const analyzeData = await analyzeResponse.json();
      const nextSignals = analyzeData.signals || state.signals;

      // The candidate just answered "which country?" — re-attempt recommend with the
      // (possibly now-populated) country; runRecommendFlow re-checks needsCountry server-side
      // and either proceeds or re-asks, so there's no separate "still ambiguous" branch needed here.
      if (state.stage === 'ASK_COUNTRY') {
        setState((prev) => ({ ...prev, signals: nextSignals, messages: updatedMessages }));
        await runRecommendFlow(updatedMessages, nextSignals);
        setIsThinking(false);
        return;
      }

      // Count user messages sent since entering the UNDERSTANDING phase
      // (not the raw message array length, since guided profile-building turns precede it)
      const understandingMessageCount = state.understandingMessageCount + 1;
      const noUsefulInfoStreak = nextSignals.hasUsableInfo === false ? state.noUsefulInfoStreak + 1 : 0;

      setState((prev) => ({
        ...prev,
        signals: nextSignals,
        noUsefulInfoStreak,
      }));

      const shouldDecline = state.stage === 'UNDERSTANDING' && noUsefulInfoStreak >= NO_USABLE_INFO_DECLINE_STREAK;
      const shouldRecommend =
        state.stage === 'UNDERSTANDING' &&
        !shouldDecline &&
        ((understandingMessageCount >= MIN_UNDERSTANDING_TURNS && nextSignals.readyForRecommendation) ||
          understandingMessageCount >= MAX_UNDERSTANDING_TURNS);

      // The candidate has stonewalled every question — stop probing and decline honestly
      // instead of fabricating a recommendation from nothing.
      if (shouldDecline) {
        setState((prev) => ({
          ...prev,
          stage: 'CLOSED',
          understandingMessageCount,
          messages: updatedMessages,
        }));

        await streamCoachTurn(updatedMessages, { kind: 'insufficient_info' }, nextSignals);
        setIsThinking(false);
      } else if (shouldRecommend) {
        setState((prev) => ({
          ...prev,
          understandingMessageCount,
          messages: updatedMessages,
        }));

        await runRecommendFlow(updatedMessages, nextSignals, {
          transitionMessage: "Got it. Let me compile three career paths tailored specifically to what we've discussed...",
        });
        setIsThinking(false);
      } else {
        // A roadmap follow-up gets its own non-onboarding instruction; it stays free-text/
        // streamed (post-roadmap "stay and iterate" chat is open-ended by design). Every other
        // ongoing UNDERSTANDING turn uses the structured, options-generating path instead.
        setState((prev) => ({ ...prev, understandingMessageCount }));

        if (state.stage === 'ROADMAP' && state.chosenPath && state.roadmap) {
          await streamCoachTurn(
            updatedMessages,
            { kind: 'roadmap_followup', chosenPath: state.chosenPath, roadmap: state.roadmap },
            nextSignals
          );
        } else {
          await postUnderstandingTurn(updatedMessages, nextSignals);
        }
        setIsThinking(false);
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setApiError(err.message || 'An error occurred. Please try again.');
      setIsThinking(false);
    }
  };

  const handleRegenerate = async (reason: string = '') => {
    setApiError(null);
    setIsThinking(true);
    setShowRejectReasonInput(false);

    const updatedSignals = { ...state.signals };

    // If they gave a rejection reason, capture it into rejectedDirections
    if (reason.trim()) {
      updatedSignals.rejectedDirections = [
        ...updatedSignals.rejectedDirections,
        reason.trim(),
      ];
    }

    // Add a system-like text to conversational history representing the decline
    const userDeclineMessage: ChatMessage = makeMessage(
      'user',
      reason.trim() ? `No, show me something else. Reason: ${reason.trim()}` : 'No, show me 3 different paths.'
    );

    setState((prev) => ({
      ...prev,
      signals: updatedSignals,
      messages: [...prev.messages, userDeclineMessage],
      currentPaths: null,
    }));

    const nextMessages = [...state.messages, userDeclineMessage];

    try {
      await runRecommendFlow(nextMessages, updatedSignals);
    } catch (err: any) {
      console.error('Regenerate error:', err);
      setApiError(err.message || 'Failed to regenerate paths.');
    } finally {
      setIsThinking(false);
    }
  };

  // The candidate has now declined 2 full decks — per the deck-aware ladder, stop reshuffling
  // blindly and have the coach ask conversationally what they'd change before a tailored 3rd deck.
  const handleAskPreferences = async () => {
    setApiError(null);
    setIsThinking(true);

    const declineMessage: ChatMessage = makeMessage('user', 'No, show me something else.');
    const nextMessages = [...state.messages, declineMessage];

    setState((prev) => ({
      ...prev,
      stage: 'ASK_PREFERENCES',
      currentPaths: null,
      selectedPathIndex: null,
      messages: nextMessages,
    }));

    try {
      await streamCoachTurn(nextMessages, { kind: 'ask_preferences' }, state.signals);
    } catch (err: any) {
      console.error('Ask-preferences stream error:', err);
      setApiError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleSelectPath = async (path: CareerPath) => {
    setApiError(null);
    setIsThinking(true);

    const selectMessage: ChatMessage = makeMessage('user', `I've chosen: ${path.title}`);

    const nextMessages = [...state.messages, selectMessage];

    setState((prev) => ({
      ...prev,
      stage: 'ROADMAP',
      chosenPath: path,
      currentPaths: null,
      selectedPathIndex: null,
      messages: nextMessages,
    }));

    try {
      // Fire the roadmap generation request now — it only needs profile/chosenPath/signals,
      // all already known, so it doesn't actually depend on the closing-message stream below.
      // Awaiting it only after the stream (instead of starting it after) lets the two run
      // concurrently: the user-visible loading sequence is unchanged (typing indicator, then
      // the roadmap-loading card), but real wall-clock time is closer to max(stream, roadmap-gen)
      // instead of their sum.
      const roadmapPromise = fetch('/api/coach', coachRequestInit({
        action: 'roadmap',
        profile: state.profile,
        chosenPath: path,
        signals: state.signals,
      }));

      await streamCoachTurn(nextMessages, { kind: 'path_locked', chosenPath: path }, state.signals);

      setIsThinking(false);
      setIsRoadmapLoading(true);

      const roadmapData = await parseCoachResponse<{ roadmap: Roadmap }>(
        await roadmapPromise,
        'Failed to generate roadmap.'
      );

      setState((prev) => ({
        ...prev,
        roadmap: roadmapData.roadmap,
        roadmapVersion: prev.roadmapVersion + 1,
        roadmapPanelOpen: false,
      }));
    } catch (err: any) {
      console.error('Close path stream error:', err);
      setApiError(err.message || 'Failed to finalize session.');
    } finally {
      setIsThinking(false);
      setIsRoadmapLoading(false);
    }
  };

  const handleUpdateRoadmap = async (feedback: string) => {
    if (!feedback.trim() || !state.chosenPath) return;
    setApiError(null);

    const feedbackMessage: ChatMessage = makeMessage('user', `Adjust the roadmap: ${feedback.trim()}`);

    const submittedFeedback = feedback.trim();
    setShowRoadmapFeedbackInput(false);
    setIsRoadmapLoading(true);
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, feedbackMessage],
    }));

    try {
      const roadmapData = await postCoach<{ roadmap: Roadmap }>(
        {
          action: 'roadmap',
          profile: state.profile,
          chosenPath: state.chosenPath,
          signals: state.signals,
          feedback: submittedFeedback,
        },
        'Failed to update roadmap.'
      );

      setState((prev) => ({
        ...prev,
        roadmap: roadmapData.roadmap,
        roadmapVersion: prev.roadmapVersion + 1,
      }));
    } catch (err: unknown) {
      console.error('Roadmap update error:', err);
      setApiError(err instanceof Error ? err.message : 'Failed to update the roadmap.');
    } finally {
      setIsRoadmapLoading(false);
    }
  };

  const handleEndSession = () => {
    setState((prev) => ({ ...prev, stage: 'CLOSED' }));
  };

  const handleRejectAll = async () => {
    setApiError(null);
    setIsThinking(true);

    const rejectAllMessage: ChatMessage = makeMessage('user', 'I decline all options.');

    const nextMessages = [...state.messages, rejectAllMessage];

    setState((prev) => ({
      ...prev,
      stage: 'CLOSED',
      chosenPath: null,
      currentPaths: null,
      selectedPathIndex: null,
      messages: nextMessages,
    }));

    try {
      await streamCoachTurn(nextMessages, { kind: 'rejected_all_final' }, state.signals);
    } catch (err: any) {
      console.error('Decline session stream error:', err);
      setApiError(err.message || 'Failed to finalize session.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleResetSession = () => {
    localStorage.removeItem('career_coach_session');
    onReset();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full bg-white animate-fade-in">
      {/* Header Info Banner */}
      <div className="px-6 py-3.5 bg-linear-to-r from-indigo-50/60 via-slate-50 to-violet-50/40 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 bg-emerald-500 rounded-full" aria-hidden="true" />
          <span className="text-xs font-semibold text-slate-600">
            Aria session: {state.profile?.name || 'Active candidate'}
          </span>
          {state.signals.intentGuess !== 'unknown' && (
            <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 bg-linear-to-r from-indigo-100 to-violet-100 text-indigo-700 rounded-full border border-indigo-200">
              {state.signals.intentGuess.replace('_', ' ')}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleResetSession}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold transition-colors duration-150"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>New session</span>
        </button>
      </div>

      {/* Body: chat column, plus a roadmap side panel once a roadmap exists */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 min-h-0">

      {/* Messages Feed Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="max-w-4xl mx-auto w-full space-y-4">
        {state.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Render paths inline if available */}
        {state.currentPaths && state.currentPaths.length > 0 && (
          <PathDeck
            paths={state.currentPaths}
            deckCount={state.deckCount}
            selectedIndex={state.selectedPathIndex}
            onSelectIndex={(index) => setState((prev) => ({ ...prev, selectedPathIndex: index }))}
            onSelectPath={handleSelectPath}
            onRegenerate={() => {
              if (state.deckCount >= 2) {
                handleAskPreferences();
              } else {
                setShowRejectReasonInput(true);
              }
            }}
            onRejectAll={handleRejectAll}
            isLoading={isThinking}
          />
        )}

        {/* First-time roadmap generation loading state (lives in chat — there's no panel yet) */}
        {isRoadmapLoading && !state.roadmap && (
          <div role="status" className="flex items-center gap-3 my-8 p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
            <p className="text-sm font-medium text-slate-600">Building your execution roadmap…</p>
          </div>
        )}

        {/* Compact, clickable summary — the full roadmap lives in the side panel, never as a chat bubble */}
        {state.roadmap && (
          <RoadmapTitleCard
            title={state.chosenPath?.title ?? 'Your execution roadmap'}
            totalDuration={state.roadmap.totalDuration}
            weeklyHoursCommitment={state.roadmap.weeklyHoursCommitment}
            tier={state.chosenPath?.tier ?? null}
            onOpen={() => setState((prev) => ({ ...prev, roadmapPanelOpen: true }))}
          />
        )}

        {/* Quick-select options for the first UNDERSTANDING reply, in place of free typing.
            Gated on !isThinking (not just `disabled`) so the panel actually disappears the
            instant a choice is sent, the same as the dynamic pendingTurnOptions block below —
            `showDirectionOptions` itself only flips false once the async response lands, which
            without this guard left the panel visibly lingering alongside the thinking bubble. */}
        {showDirectionOptions && !isThinking && (
          <QuickOptions
            icon={Compass}
            prompt="What are you looking for right now?"
            options={getDirectionOptions(state.profile?.inferredPersona)}
            onSelect={(value) => handleSend(value)}
            disabled={isThinking}
            customPlaceholder="Tell me what you're looking for..."
          />
        )}

        {/* No-resume guided intake's first question — same idea, different copy */}
        {showProfileBuildIntroOptions && !isThinking && (
          <QuickOptions
            icon={Compass}
            prompt="What are you currently doing?"
            options={PROFILE_BUILD_INTRO_OPTIONS}
            onSelect={(value) => handleProfileBuildAnswer(value)}
            disabled={isThinking}
            customPlaceholder="Describe what you're doing and your area/role..."
          />
        )}

        {/* Resume spans multiple countries — pick the target market from what was detected */}
        {showCountryOptions && !isThinking && (
          <QuickOptions
            icon={Globe}
            prompt="Which market should I calibrate roles and salary to?"
            options={detectedCountries.map((country) => ({ label: country }))}
            onSelect={(value) => handleSend(value)}
            disabled={isThinking}
            customPlaceholder="Type the country/market..."
          />
        )}

        {/* Two decks declined — ask what to change before a tailored third */}
        {showAskPreferencesOptions && !isThinking && (
          <QuickOptions
            icon={Sparkles}
            prompt="What would you like me to change?"
            options={ASK_PREFERENCES_OPTIONS}
            onSelect={(value) => handleAskPreferencesAnswer(value)}
            disabled={isThinking}
            customPlaceholder="Tell me what to change..."
          />
        )}

        {/* Dynamically-generated quick-reply options for the question just asked (ongoing
            UNDERSTANDING turns, guided-intake adaptive questions) — no heading, since the
            question itself is already the preceding chat bubble. Hidden while the next reveal
            is in flight so it doesn't flash stale options mid-thought. */}
        {state.pendingTurnOptions && !isThinking && (
          <QuickOptions
            options={state.pendingTurnOptions.options.map((label) => ({ label }))}
            onSelect={(value) => handleSend(value)}
            multiSelect={state.pendingTurnOptions.allowMultiple}
            disabled={isThinking}
            customPlaceholder="Type your own answer..."
          />
        )}

        {/* Overlay prompt for rejection feedback (declining 1st deck, or one not-yet-2nd decline) */}
        {showRejectReasonInput && (
          <QuickOptions
            icon={Sparkles}
            prompt="What should we adjust for the next deck?"
            options={REJECT_REASON_OPTIONS}
            onSelect={(value) => handleRegenerate(value)}
            disabled={isThinking}
            customPlaceholder="E.g. Too technical, avoid engineering management..."
            onCancel={() => setShowRejectReasonInput(false)}
          />
        )}

        {isThinking && <ThinkingBubble />}

        {apiError && (
          <div role="alert" className="my-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{apiError}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      </div>

      {/* Input box bottom panel */}
      <div className="p-4 bg-linear-to-r from-indigo-50/40 via-slate-50 to-violet-50/30 border-t border-slate-200 flex-shrink-0">
        {state.stage === 'CLOSED' ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-slate-600 text-sm font-medium">
              The mentoring session is closed. I wish you the best in your career journey.
            </p>
            <button
              type="button"
              onClick={handleResetSession}
              className="px-6 py-2.5 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150"
            >
              Start a new coaching session
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-2">
            {state.stage === 'ROADMAP' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleEndSession}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors duration-150"
                >
                  I&rsquo;m all set — end session
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(inputValue);
              }}
              className="flex items-end gap-3"
            >
              <div className="flex-1 relative">
                <label htmlFor="chat-input" className="sr-only">Your message</label>
                <textarea
                  id="chat-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    anyQuickOptionsShowing
                      ? 'Choose an option above, or tell me more...'
                      : state.stage === 'ROADMAP'
                        ? 'Comment on your roadmap, or anything else...'
                        : 'Type your response here...'
                  }
                  disabled={isThinking || isRoadmapLoading || state.currentPaths !== null || anyQuickOptionsShowing}
                  rows={1}
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none max-h-32 transition disabled:opacity-50 disabled:bg-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={!inputValue.trim() || isThinking || isRoadmapLoading || state.currentPaths !== null || anyQuickOptionsShowing}
                aria-label="Send message"
                className="p-3.5 bg-linear-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40 disabled:pointer-events-none transition-all duration-150 shadow-sm hover:shadow-md"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}
      </div>

      </div>

      {state.roadmap && (
        <RoadmapPanel
          roadmap={state.roadmap}
          roadmapVersion={state.roadmapVersion}
          tier={state.chosenPath?.tier ?? null}
          open={state.roadmapPanelOpen}
          onClose={() => setState((prev) => ({ ...prev, roadmapPanelOpen: false }))}
          isUpdating={isRoadmapLoading}
          showFeedbackInput={showRoadmapFeedbackInput}
          onOpenFeedbackInput={() => setShowRoadmapFeedbackInput(true)}
          onCancelFeedback={() => setShowRoadmapFeedbackInput(false)}
          onSubmitFeedback={handleUpdateRoadmap}
        />
      )}

      </div>
    </div>
  );
}
