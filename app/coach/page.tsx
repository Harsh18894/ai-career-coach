'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import ResumeUpload from '@/components/ResumeUpload';
import ChatWindow from '@/components/ChatWindow';
import AnalyzingProgress, { RESUME_ANALYSIS_STEPS } from '@/components/AnalyzingProgress';
import { Profile, AdaptiveQuestion } from '@/lib/ai/schemas';
import { ClientApiError, clientErrorFrom, asClientError, type ClientError } from '@/lib/errors';
import { sessionHeaders, startNewSession } from '@/lib/session';
import { stashResumeText } from '@/lib/resume-stash';
import { findSampleProfile } from '@/lib/samples';
import { humanTokenHeaders, primeBotProtection } from '@/lib/turnstile';
import { startSpan } from '@/lib/journey';
import { track } from '@/lib/analytics';
import { STORAGE_KEYS } from '@/lib/brand';

export default function CoachPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [opener, setOpener] = useState<AdaptiveQuestion | null>(null);
  const [noResumeMode, setNoResumeMode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSubmitTextLoading, setIsSubmitTextLoading] = useState(false);
  const [manualTextError, setManualTextError] = useState<ClientError | null>(null);
  /** Latest handleManualTextSubmit, for the mount-only deep-link effect to call. */
  const submitRef = useRef<((text: string) => Promise<void>) | null>(null);

  useEffect(() => {
    // Warm the invisible bot check so a token exists before the user uploads anything. Costs
    // nothing visible and keeps the challenge off the critical path of a session start.
    primeBotProtection();

    // Deep link from the landing page's primary CTA: /coach?sample=<id> starts that sample
    // immediately. Read once, then stripped from the URL so a refresh does not silently start
    // a second session and charge the quota again.
    const sampleId = new URLSearchParams(window.location.search).get('sample');
    const sample = findSampleProfile(sampleId);
    if (sample) {
      window.history.replaceState({}, '', '/coach');
      startNewSession({ isSample: true, sampleId: sample.id });
      stashResumeText(sample.resumeText);
      startSpan('intake_to_first_paths');
      track('sample_cta_click', { path: 'sample' });
      // Deferred to a microtask so no state update happens synchronously inside the effect
      // body, and so this does not pull handleManualTextSubmit into the dependency array of a
      // mount-only effect (which would re-run it on every render of a changed closure).
      queueMicrotask(() => {
        setIsInitializing(false);
        void submitRef.current?.(sample.resumeText);
      });
      return;
    }

    const saved = localStorage.getItem(STORAGE_KEYS.session);
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
    // The no-resume flow reaches paths through the guided intake instead of an upload, but it
    // is the same span: "from committing to this, how long until I see recommendations".
    startSpan('intake_to_first_paths');
    setNoResumeMode(true);
  };

  const handleManualTextSubmit = async (text: string) => {
    setIsSubmitTextLoading(true);
    setManualTextError(null);
    startSpan('intake_to_first_paths');

    try {
      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders(), ...(await humanTokenHeaders()) },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ClientApiError(clientErrorFrom(data, 'RESUME_PARSE_FAILED'));
      }

      if (data.insufficientInfo) {
        handleStartWithoutResume();
        return;
      }

      const openerResponse = await fetch('/api/generate-opener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        body: JSON.stringify({ profile: data.profile }),
      });
      const openerData = await openerResponse.json();
      if (!openerResponse.ok) {
        throw new ClientApiError(clientErrorFrom(openerData));
      }

      stashResumeText(text);
      setProfile(data.profile);
      setOpener(openerData.opener);
    } catch (err) {
      const clientError = asClientError(err);
      console.error(`[${clientError.code}]`, err);
      setManualTextError(clientError);
    } finally {
      setIsSubmitTextLoading(false);
    }
  };

  // Assigned in an effect, not during render — a ref written during render is a lint error and
  // a correctness hazard under concurrent rendering. Declared after handleManualTextSubmit so
  // the binding exists; effects run after the whole body, so ordering is not an issue.
  useEffect(() => {
    submitRef.current = handleManualTextSubmit;
  });

  const handleReset = () => {
    setProfile(null);
    setOpener(null);
    setNoResumeMode(false);
  };

  if (isInitializing) {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 gap-4" role="status">
        <Loader2 className="w-8 h-8 text-hachi animate-spin" />
        <p className="text-ink-muted font-medium text-sm">
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
          {manualTextError.message}
        </div>
      )}
    </div>
  );
}
