'use client';

import React from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { Roadmap } from '@/lib/ai/schemas';
import RoadmapView from './RoadmapView';

interface RoadmapPanelProps {
  roadmap: Roadmap;
  roadmapVersion: number;
  open: boolean;
  onClose: () => void;
  isUpdating: boolean;
  showFeedbackInput: boolean;
  feedbackValue: string;
  onFeedbackValueChange: (value: string) => void;
  onOpenFeedbackInput: () => void;
  onCancelFeedback: () => void;
  onSubmitFeedback: () => void;
}

/**
 * Chrome around RoadmapView: a static right-hand column on md+ screens, a slide-over drawer
 * (with backdrop) on narrow screens. Content is keyed on roadmapVersion by the caller so a
 * regeneration replaces this panel's content in place instead of stacking/duplicating.
 */
export default function RoadmapPanel({
  roadmap,
  roadmapVersion,
  open,
  onClose,
  isUpdating,
  showFeedbackInput,
  feedbackValue,
  onFeedbackValueChange,
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

          <RoadmapView key={roadmapVersion} roadmap={roadmap} />

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
            <div className="p-5 rounded-2xl bg-linear-to-br from-indigo-50/70 to-violet-50/50 border border-indigo-200 mb-4 space-y-3 animate-fade-in">
              <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>What should we change?</span>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                E.g. &ldquo;I can only commit 5 hours a week&rdquo;, &ldquo;swap the SQL course for Python&rdquo;.
              </p>
              <input
                type="text"
                value={feedbackValue}
                onChange={(e) => onFeedbackValueChange(e.target.value)}
                placeholder="Tell me what to adjust..."
                aria-label="Feedback to adjust the roadmap"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSubmitFeedback();
                }}
              />
              <div className="flex justify-end gap-3 text-xs">
                <button
                  type="button"
                  onClick={onCancelFeedback}
                  className="px-4 py-2 hover:bg-slate-100 rounded-lg text-slate-600 font-semibold transition-colors duration-150"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSubmitFeedback}
                  disabled={!feedbackValue.trim()}
                  className="px-4 py-2 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-lg font-semibold shadow-sm hover:shadow-md transition-all duration-150 disabled:opacity-50"
                >
                  Update roadmap
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
