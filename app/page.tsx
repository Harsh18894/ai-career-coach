'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import ResumeUpload from '@/components/ResumeUpload';
import ChatWindow from '@/components/ChatWindow';
import { Profile } from '@/lib/ai/schemas';

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [openingMessage, setOpeningMessage] = useState<string | null>(null);
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
          // Find the opener message or use the first message
          const opener = parsed.messages.find((m: any) => m.id === 'opener')?.content || parsed.messages[0]?.content;
          setOpeningMessage(opener);
        }
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    }
    setIsInitializing(false);
  }, []);

  const handleUploadSuccess = (extractedProfile: Profile, opener: string) => {
    setProfile(extractedProfile);
    setOpeningMessage(opener);
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
      setOpeningMessage(data.openingMessage);
    } catch (err: any) {
      console.error('Manual submission error:', err);
      setManualTextError(err.message || 'An error occurred while analyzing the text.');
    } finally {
      setIsSubmitTextLoading(false);
    }
  };

  const handleReset = () => {
    setProfile(null);
    setOpeningMessage(null);
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
      <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 gap-4" role="status">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <div className="space-y-1 text-center">
          <p className="text-base font-medium text-slate-800">
            Analyzing your text profile…
          </p>
          <p className="text-sm text-slate-500">
            Identifying experience gaps and tensions…
          </p>
        </div>
      </div>
    );
  }

  if ((profile && openingMessage) || noResumeMode) {
    return (
      <ChatWindow
        initialProfile={profile}
        initialOpeningMessage={openingMessage}
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
