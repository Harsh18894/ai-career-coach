'use client';

import React from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { Roadmap } from '@/lib/ai/schemas';
import type { PathTier } from '@/lib/ai/tiers';
import RoadmapView from './RoadmapView';
import QuickOptions, { type QuickOption } from './QuickOptions';

// Common adjustments — labels double as the sent value, no separate `value` needed.
const ROADMAP_FEEDBACK_OPTIONS: QuickOption[] = [
  { label: 'This pace is too fast' },
  { label: 'This pace is too slow' },
  { label: 'Swap one of the topics/courses' },
];

interface RoadmapPanelProps {
  roadmap: Roadmap;
  roadmapVersion: number;
  tier: PathTier | null;
  open: boolean;
  onClose: () => void;
  isUpdating: boolean;
  showFeedbackInput: boolean;
  onOpenFeedbackInput: () => void;
  onCancelFeedback: () => void;
  onSubmitFeedback: (feedback: string) => void;
}

/**
 * Chrome around RoadmapView: a static right-hand column on md+ screens, a slide-over drawer
 * (with backdrop) on narrow screens. Content is keyed on roadmapVersion by the caller so a
 * regeneration replaces this panel's content in place instead of stacking/duplicating.
 */
export default function RoadmapPanel({
  roadmap,
  roadmapVersion,
  tier,
  open,
  onClose,
  isUpdating,
  showFeedbackInput,
  onOpenFeedbackInput,
  onCancelFeedback,
  onSubmitFeedback,
}: RoadmapPanelProps) {
  return (
    <>
      {/* Mobile-only backdrop — desktop never needs one since the panel is statically docked */}
      <div
        className={`fixed inset-0 bg-black/30 z-40 md:hidden transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white border-l border-slate-200 flex flex-col transition-transform duration-300 md:static md:z-auto md:translate-x-0 md:w-[60vw] md:flex-shrink-0 ${open ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        {/* Mobile-only header bar with a close control back to chat */}
        <div className="flex items-center justify-between px-4 py-3 bg-linear-to-r from-indigo-50 to-violet-50/60 border-b border-slate-200 flex-shrink-0 md:hidden">
          <span className="text-sm font-semibold text-slate-900">Roadmap</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to chat"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-8 relative">
          {isUpdating && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Updating roadmap…</span>
              </div>
            </div>
          )}

          <RoadmapView key={roadmapVersion} roadmap={roadmap} tier={tier} />

          {!showFeedbackInput ? (
            <div className="flex justify-center mt-4 mb-2">
              <button
                type="button"
                onClick={onOpenFeedbackInput}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-xl text-xs font-semibold shadow-sm transition-all duration-150"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Adjust roadmap</span>
              </button>
            </div>
          ) : (
            <QuickOptions
              icon={Sparkles}
              prompt="What should we change?"
              options={ROADMAP_FEEDBACK_OPTIONS}
              onSelect={onSubmitFeedback}
              disabled={isUpdating}
              customPlaceholder="E.g. only 5 hours a week, swap the SQL course for Python..."
              onCancel={onCancelFeedback}
            />
          )}
        </div>
      </div>
    </>
  );
}
