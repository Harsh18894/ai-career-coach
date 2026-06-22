'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export interface AnalyzingStep {
  title: string;
  subtitle: string;
}

// Backend processing here is a sequential chain of LLM calls (extractProfile, then
// generateOpeningMessage) that can genuinely take a long time — a single static "loading..."
// line gives no sense of progress over that whole window and reads as stalled. Rotating
// through what the coach is actually doing keeps it feeling like real, ongoing analysis
// (a trust signal) instead of an indefinite spinner, so users don't drop off mid-wait.
export const RESUME_ANALYSIS_STEPS: AnalyzingStep[] = [
  { title: 'Reading your resume...', subtitle: 'Pulling out your roles, skills, and education...' },
  { title: 'Mapping your career trajectory...', subtitle: 'Tracing role transitions, tenure, and domain shifts...' },
  { title: 'Spotting the gaps that matter...', subtitle: 'Checking your profile against what recruiters actually screen for...' },
  { title: 'Calibrating to your experience level...', subtitle: 'Making sure every suggestion fits where you actually are...' },
  { title: 'Almost there...', subtitle: 'Your coach is drafting a personalized opening for your session...' },
];

interface AnalyzingProgressProps {
  steps: AnalyzingStep[];
  intervalMs?: number;
}

export default function AnalyzingProgress({ steps, intervalMs = 3200 }: AnalyzingProgressProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (steps.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % steps.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [steps, intervalMs]);

  const current = steps[index] ?? steps[0];

  return (
    <div className="flex flex-col items-center justify-center gap-4" role="status">
      <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      <div key={index} className="space-y-1 text-center animate-fade-in">
        <p className="text-base font-medium text-slate-800">{current.title}</p>
        <p className="text-sm text-slate-500">{current.subtitle}</p>
      </div>
    </div>
  );
}
