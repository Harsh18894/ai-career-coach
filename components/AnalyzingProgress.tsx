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

// generatePaths is a single ~34s call that cannot stream, so the wait needs to name what is
// actually happening rather than showing an indefinite spinner. Each line corresponds to real
// work in the prompt (see generatePaths in lib/ai/coach.ts): three distinct directions, a
// market-calibrated salary band, and an honest ambition check per path.
export const PATH_GENERATION_STEPS: AnalyzingStep[] = [
  { title: 'Reading back everything you said...', subtitle: 'Your profile, plus the skills and direction from this conversation...' },
  { title: 'Shortlisting directions that actually fit...', subtitle: 'Three genuinely different paths, not three versions of one...' },
  { title: 'Calibrating to your market...', subtitle: 'Salary bands in local currency for the market you named...' },
  { title: 'Running the ambition check...', subtitle: "Being honest about whether each target matches your evidence..." },
  { title: 'Writing up the three paths...', subtitle: 'Each one has to cite something real from your background...' },
];

// generateRoadmap is the other long non-streamed call (~32s). Same reasoning.
export const ROADMAP_GENERATION_STEPS: AnalyzingStep[] = [
  { title: 'Sizing the gap for this path...', subtitle: 'Working out where you actually start from for this specific move...' },
  { title: 'Choosing the phases...', subtitle: 'Courses, a portfolio project, practice, then applications...' },
  { title: 'Laying out the weeks...', subtitle: 'Concrete things to do each week, not a reading list...' },
  { title: 'Checking the pace is realistic...', subtitle: 'Against the hours a week you can genuinely give it...' },
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
