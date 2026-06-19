'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, RotateCcw, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { Profile, CareerPath } from '@/lib/ai/schemas';
import { ConversationState, ChatMessage, UserSignals, INITIAL_STATE } from '@/lib/state/conversation';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import PathDeck from './PathDeck';
import RoadmapView from './RoadmapView';

// Fixed, deterministic sequence for guided profile-building (no resume available).
// One question per step, asked in order, used when initialProfile is null.
const PROFILE_BUILD_QUESTIONS: string[] = [
  "First — what are you currently doing? (e.g. studying, working, between things) and in what area or role?",
  "How many years of experience do you have in that area? Zero is totally fine.",
  "What skills, tools, or things are you already comfortable with today?",
  "Which industry or field excites you most right now — or are you already in?",
  "Last one — what country or region are you based in?",
];

interface ChatWindowProps {
  initialProfile: Profile | null;
  initialOpeningMessage: string | null;
  onReset: () => void;
}

export default function ChatWindow({
  initialProfile,
  initialOpeningMessage,
  onReset,
}: ChatWindowProps) {
  // Initialize local conversation state
  const [state, setState] = useState<ConversationState>(() => {
    if (initialProfile && initialOpeningMessage) {
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
            content: initialOpeningMessage,
            createdAt: new Date().toISOString(),
          },
        ],
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
          content: PROFILE_BUILD_QUESTIONS[0],
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });

  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isRoadmapLoading, setIsRoadmapLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  // For regeneration feedback
  const [showRejectReasonInput, setShowRejectReasonInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.messages, isThinking, state.currentPaths, showRejectReasonInput, state.roadmap, isRoadmapLoading]);

  // Load from localStorage if present on mount
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

  // Save to localStorage on state changes
  useEffect(() => {
    if (state.profile) {
      localStorage.setItem('career_coach_session', JSON.stringify(state));
    }
  }, [state]);

  const handleProfileBuildAnswer = async (textToSend: string) => {
    const userMessage: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...state.messages, userMessage];
    const updatedAnswers = [...state.profileBuildAnswers, textToSend.trim()];
    const nextStep = state.profileBuildStep + 1;
    setInputValue('');

    // Still more questions to ask — just move to the next one, no API call needed.
    if (nextStep < PROFILE_BUILD_QUESTIONS.length) {
      const nextQuestionMessage: ChatMessage = {
        id: Math.random().toString(),
        role: 'assistant',
        content: PROFILE_BUILD_QUESTIONS[nextStep],
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        profileBuildStep: nextStep,
        profileBuildAnswers: updatedAnswers,
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
      const buildResponse = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'build-profile',
          answers: PROFILE_BUILD_QUESTIONS.map((question, i) => ({
            question,
            answer: updatedAnswers[i],
          })),
        }),
      });

      const buildData = await buildResponse.json();
      if (!buildResponse.ok) {
        throw new Error(buildData.error || 'Failed to build your profile.');
      }

      const builtProfile: Profile = buildData.profile;
      const nextSignals: UserSignals = {
        ...state.signals,
        intentGuess: builtProfile.inferredPersona,
      };
      const transitionMessage: ChatMessage = {
        id: Math.random().toString(),
        role: 'assistant',
        content: "Perfect — that gives me a real picture of where you're starting from. A few quick questions, then I'll map out some paths for you.",
        createdAt: new Date().toISOString(),
      };
      const coachMessageId = Math.random().toString();
      const initialCoachMessage: ChatMessage = {
        id: coachMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };
      const messagesWithTransition = [...updatedMessages, transitionMessage, initialCoachMessage];

      setState((prev) => ({
        ...prev,
        stage: 'UNDERSTANDING',
        profile: builtProfile,
        signals: nextSignals,
        understandingMessageCount: 0,
        messages: messagesWithTransition,
      }));

      const chatResponse = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          messages: [...updatedMessages, transitionMessage],
          profile: builtProfile,
          signals: nextSignals,
        }),
      });

      if (!chatResponse.ok) {
        const errData = await chatResponse.json();
        throw new Error(errData.error || 'Streaming error.');
      }

      const reader = chatResponse.body?.getReader();
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
              m.id === coachMessageId ? { ...m, content: accumulatedContent } : m
            ),
          }));
        }
      }
    } catch (err: any) {
      console.error('Profile build error:', err);
      setApiError(err.message || 'Something went wrong while building your profile.');
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

    setApiError(null);
    const userMessage: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    // Update state with user message
    const updatedMessages = [...state.messages, userMessage];
    setState((prev) => ({
      ...prev,
      messages: updatedMessages,
    }));
    setInputValue('');
    setIsThinking(true);

    try {
      // 1. Analyze signals in background
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

      setState((prev) => ({
        ...prev,
        signals: nextSignals,
      }));

      // Count user messages sent since entering the UNDERSTANDING phase
      // (not the raw message array length, since guided profile-building turns precede it)
      const understandingMessageCount = state.understandingMessageCount + 1;

      // 2. Decide if we trigger recommendations (on the 3rd user message in UNDERSTANDING phase)
      if (state.stage === 'UNDERSTANDING' && understandingMessageCount === 3) {
        // Transition assistant message
        const transitionMessage: ChatMessage = {
          id: Math.random().toString(),
          role: 'assistant',
          content: "Got it. Let me compile three career paths tailored specifically to what we've discussed...",
          createdAt: new Date().toISOString(),
        };

        setState((prev) => ({
          ...prev,
          messages: [...updatedMessages, transitionMessage],
        }));

        // Fetch career paths
        const recommendResponse = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'recommend',
            profile: state.profile,
            signals: nextSignals,
            shownPaths: state.shownPaths,
            rejectedDirections: nextSignals.rejectedDirections,
          }),
        });

        const recommendData = await recommendResponse.json();
        if (!recommendResponse.ok) {
          throw new Error(recommendData.error || 'Failed to generate recommendations.');
        }

        const newPaths: CareerPath[] = recommendData.paths;
        const newPathTitles = newPaths.map((p) => p.title);

        const coachRecMessage: ChatMessage = {
          id: Math.random().toString(),
          role: 'assistant',
          content: "Here are **3 customized career directions** built from your background and priorities. Review them below. Tell me which one makes sense to explore, or let's pivot if they're off.",
          createdAt: new Date().toISOString(),
        };

        setState((prev) => ({
          ...prev,
          stage: 'RECOMMENDING',
          understandingMessageCount,
          currentPaths: newPaths,
          shownPaths: Array.from(new Set([...prev.shownPaths, ...newPathTitles])),
          deckCount: prev.deckCount + 1,
          messages: [...updatedMessages, transitionMessage, coachRecMessage],
        }));

        setIsThinking(false);
      } else {
        // Continue chat stream
        const coachMessageId = Math.random().toString();
        const initialCoachMessage: ChatMessage = {
          id: coachMessageId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        };

        setState((prev) => ({
          ...prev,
          understandingMessageCount,
          messages: [...updatedMessages, initialCoachMessage],
        }));

        const chatResponse = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'chat',
            messages: updatedMessages,
            profile: state.profile,
            signals: nextSignals,
          }),
        });

        if (!chatResponse.ok) {
          const errData = await chatResponse.json();
          throw new Error(errData.error || 'Streaming error.');
        }

        const reader = chatResponse.body?.getReader();
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
                m.id === coachMessageId ? { ...m, content: accumulatedContent } : m
              ),
            }));
          }
        }

        setIsThinking(false);
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setApiError(err.message || 'An error occurred. Please try again.');
      setIsThinking(false);
    }
  };

  const handleRegenerate = async () => {
    setApiError(null);
    setIsThinking(true);

    let updatedSignals = { ...state.signals };

    // If they typed a rejection reason, capture it into rejectedDirections
    if (rejectReason.trim()) {
      updatedSignals.rejectedDirections = [
        ...updatedSignals.rejectedDirections,
        rejectReason.trim(),
      ];
      setRejectReason('');
      setShowRejectReasonInput(false);
    }

    // Add a system-like text to conversational history representing the decline
    const userDeclineMessage: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: rejectReason.trim()
        ? `No, show me something else. Reason: ${rejectReason.trim()}`
        : "No, show me 3 different paths.",
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      signals: updatedSignals,
      messages: [...prev.messages, userDeclineMessage],
      currentPaths: null, // Clear current paths while loading
    }));

    try {
      // Analyze the decline signals in background
      await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          messages: [...state.messages, userDeclineMessage],
          signals: updatedSignals,
        }),
      });

      // Get new paths
      const recommendResponse = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recommend',
          profile: state.profile,
          signals: updatedSignals,
          shownPaths: state.shownPaths,
          rejectedDirections: updatedSignals.rejectedDirections,
        }),
      });

      const recommendData = await recommendResponse.json();
      if (!recommendResponse.ok) {
        throw new Error(recommendData.error || 'Failed to regenerate recommendations.');
      }

      const newPaths: CareerPath[] = recommendData.paths;
      const newPathTitles = newPaths.map((p) => p.title);

      const coachRecMessage: ChatMessage = {
        id: Math.random().toString(),
        role: 'assistant',
        content: `Got it. Avoiding those directions. Here is a **new set of 3 career paths** (Deck ${state.deckCount + 1}/3) tailored to this fresh feedback. Let's see if one of these hits closer:`,
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        stage: 'REGENERATING',
        currentPaths: newPaths,
        shownPaths: Array.from(new Set([...prev.shownPaths, ...newPathTitles])),
        deckCount: prev.deckCount + 1,
        messages: [...prev.messages, coachRecMessage],
      }));
    } catch (err: any) {
      console.error('Regenerate error:', err);
      setApiError(err.message || 'Failed to regenerate paths.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleSelectPath = async (path: CareerPath) => {
    setApiError(null);
    setIsThinking(true);

    const selectMessage: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: `I've chosen: ${path.title}`,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...state.messages, selectMessage];

    setState((prev) => ({
      ...prev,
      stage: 'CLOSED',
      chosenPath: path,
      currentPaths: null, // Clear deck after selection
      messages: nextMessages,
    }));

    try {
      const coachMessageId = Math.random().toString();
      const initialCoachMessage: ChatMessage = {
        id: coachMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...nextMessages, initialCoachMessage],
      }));

      const chatResponse = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          messages: nextMessages,
          profile: state.profile,
          signals: state.signals,
          chosenPath: path,
        }),
      });

      const reader = chatResponse.body?.getReader();
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
              m.id === coachMessageId ? { ...m, content: accumulatedContent } : m
            ),
          }));
        }
      }

      setIsThinking(false);
      setIsRoadmapLoading(true);

      const roadmapResponse = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'roadmap',
          profile: state.profile,
          chosenPath: path,
          signals: state.signals,
        }),
      });

      const roadmapData = await roadmapResponse.json();
      if (!roadmapResponse.ok) {
        throw new Error(roadmapData.error || 'Failed to generate roadmap.');
      }

      setState((prev) => ({
        ...prev,
        roadmap: roadmapData.roadmap,
      }));
    } catch (err: any) {
      console.error('Close path stream error:', err);
      setApiError(err.message || 'Failed to finalize session.');
    } finally {
      setIsThinking(false);
      setIsRoadmapLoading(false);
    }
  };

  const handleRejectAll = async () => {
    setApiError(null);
    setIsThinking(true);

    const rejectAllMessage: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: "I decline all options.",
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...state.messages, rejectAllMessage];

    setState((prev) => ({
      ...prev,
      stage: 'CLOSED',
      chosenPath: null,
      currentPaths: null,
      messages: nextMessages,
    }));

    try {
      const coachMessageId = Math.random().toString();
      const initialCoachMessage: ChatMessage = {
        id: coachMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...nextMessages, initialCoachMessage],
      }));

      const chatResponse = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          messages: nextMessages,
          profile: state.profile,
          signals: state.signals,
          rejectedAll: true,
        }),
      });

      const reader = chatResponse.body?.getReader();
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
              m.id === coachMessageId ? { ...m, content: accumulatedContent } : m
            ),
          }));
        }
      }
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
      <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 bg-emerald-500 rounded-full" aria-hidden="true" />
          <span className="text-xs font-semibold text-slate-600">
            Coach session: {state.profile?.name || 'Active candidate'}
          </span>
          {state.signals.intentGuess !== 'unknown' && (
            <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
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
            onSelectPath={handleSelectPath}
            onRegenerate={() => setShowRejectReasonInput(true)}
            onRejectAll={handleRejectAll}
            isLoading={isThinking}
          />
        )}

        {/* Roadmap for the chosen path */}
        {isRoadmapLoading && (
          <div role="status" className="flex items-center gap-3 my-8 p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
            <p className="text-sm font-medium text-slate-600">Building your execution roadmap…</p>
          </div>
        )}
        {state.roadmap && <RoadmapView roadmap={state.roadmap} />}

        {/* Overlay prompt for rejection feedback */}
        {showRejectReasonInput && (
          <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-200 my-6 space-y-3 animate-fade-in max-w-xl mx-auto">
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>What should we adjust for the next deck?</span>
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tell me what was off with the previous recommendations (e.g. &ldquo;too technical&rdquo;, &ldquo;want more sales focus&rdquo;, &ldquo;stay in B2C&rdquo;). We will avoid these directions.
            </p>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="E.g. Too technical, avoid engineering management..."
              aria-label="Feedback on previous path recommendations"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRegenerate();
              }}
            />
            <div className="flex justify-end gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowRejectReasonInput(false);
                  setRejectReason('');
                }}
                className="px-4 py-2 hover:bg-slate-100 rounded-lg text-slate-600 font-semibold transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm hover:shadow-md transition-all duration-150"
              >
                Generate next 3 paths
              </button>
            </div>
          </div>
        )}

        {isThinking && (
          <div className="my-4">
            <TypingIndicator />
          </div>
        )}

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
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex-shrink-0">
        {state.stage === 'CLOSED' ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-slate-600 text-sm font-medium">
              The mentoring session is closed. I wish you the best in your career journey.
            </p>
            <button
              type="button"
              onClick={handleResetSession}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150"
            >
              Start a new coaching session
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(inputValue);
            }}
            className="flex items-end gap-3 max-w-4xl mx-auto"
          >
            <div className="flex-1 relative">
              <label htmlFor="chat-input" className="sr-only">Your message</label>
              <textarea
                id="chat-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your response here..."
                disabled={isThinking || state.currentPaths !== null}
                rows={1}
                className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none max-h-32 transition disabled:opacity-50 disabled:bg-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={!inputValue.trim() || isThinking || state.currentPaths !== null}
              aria-label="Send message"
              className="p-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none transition-all duration-150 shadow-sm hover:shadow-md"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
