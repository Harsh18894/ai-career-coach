'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import ResumeUpload from '@/components/ResumeUpload';
import ChatWindow from '@/components/ChatWindow';
import AnalyzingProgress, { RESUME_ANALYSIS_STEPS } from '@/components/AnalyzingProgress';
import { Profile, AdaptiveQuestion } from '@/lib/ai/schemas';

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opener, setOpener] = useState<AdaptiveQuestion | null>(null);
  const [noResumeMode, setNoResumeMode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSubmitTextLoading, setIsSubmitTextLoading] = useState(false);
  const [manualTextError, setManualTextError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('career_coach_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.profile && parsed.messages && parsed.messages.length > 0) {
          setProfile(parsed.profile);
          // Only used to gate which screen renders below — ChatWindow restores the full
          // conversation (including any real options) itself from the same localStorage key,
          // so the options/allowMultiple fields here are irrelevant placeholders.
          const openerMessage = parsed.messages.find((m: any) => m.id === 'opener')?.content || parsed.messages[0]?.content;
          setOpener({ message: openerMessage, options: null, allowMultiple: false, offTopic: false });
        }
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    }
    setIsInitializing(false);
  }, []);

  const handleUploadSuccess = (extractedProfile: Profile, newOpener: AdaptiveQuestion) => {
    setProfile(extractedProfile);
    setOpener(newOpener);
  };

  const handleStartWithoutResume = () => {
    setManualTextError(null);
    setNoResumeMode(true);
  };

  const handleManualTextSubmit = async (text: string) => {
    setIsSubmitTextLoading(true);
    setManualTextError(null);

    try {
      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze text.');
      }

      if (data.insufficientInfo) {
        handleStartWithoutResume();
        return;
      }

      setProfile(data.profile);
      setOpener(data.opener);
    } catch (err: any) {
      console.error('Manual submission error:', err);
      setManualTextError(err.message || 'An error occurred while analyzing the text.');
    } finally {
      setIsSubmitTextLoading(false);
    }
  };

  const handleReset = () => {
    setProfile(null);
    setOpener(null);
    setNoResumeMode(false);
  };

  if (isInitializing) {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 gap-4" role="status">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-slate-500 font-medium text-sm">
          Loading active career session…
        </p>
      </div>
    );
  }

  if (isSubmitTextLoading) {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <AnalyzingProgress steps={RESUME_ANALYSIS_STEPS} />
      </div>
    );
  }

  if ((profile && opener) || noResumeMode) {
    return (
      <ChatWindow
        initialProfile={profile}
        initialOpener={opener}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <ResumeUpload
        onUploadSuccess={handleUploadSuccess}
        onManualTextSubmit={handleManualTextSubmit}
        onStartWithoutResume={handleStartWithoutResume}
      />
      {manualTextError && (
        <div role="alert" className="mt-4 p-4 max-w-2xl w-full bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {manualTextError}
        </div>
      )}
    </div>
  );
}
