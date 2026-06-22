'use client';

import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface QuickOption {
  label: string;
  /** What's actually sent on selection. Defaults to `label` when omitted — set this when the
   * button text and the underlying message/value should differ (e.g. a short label that expands
   * into a fuller natural-language sentence). */
  value?: string;
}

interface QuickOptionsProps {
  icon: LucideIcon;
  prompt: string;
  options: QuickOption[];
  /** Called with the resolved value — either the clicked option's `value`/`label`, or the
   * candidate's own typed text from the "Something else" input. */
  onSelect: (value: string) => void;
  disabled?: boolean;
  customPlaceholder?: string;
  /** When provided, renders a "Cancel" control that dismisses the whole panel — only meaningful
   * for sites where this control is an optional detour (e.g. "why are you declining this deck?"),
   * not for sites where answering is a mandatory step in the flow. */
  onCancel?: () => void;
}

/**
 * Shared "pick one, or type your own" control used everywhere the coach asks something with a
 * small, known set of likely answers. Keeps its own "Something else" text-entry state internally
 * so every call site gets identical behavior: click an option (or type custom text and submit) →
 * `onSelect` fires once with the final value → the caller is responsible for turning that into a
 * visible chat message and for hiding this panel (typically by advancing past whatever state
 * gated rendering it).
 */
export default function QuickOptions({
  icon: Icon,
  prompt,
  options,
  onSelect,
  disabled = false,
  customPlaceholder = "Type your own answer...",
  onCancel,
}: QuickOptionsProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');

  const submitCustom = () => {
    if (!customText.trim() || disabled) return;
    onSelect(customText.trim());
    setCustomText('');
    setShowCustomInput(false);
  };

  return (
    <div className="p-5 rounded-2xl bg-linear-to-br from-indigo-50/70 to-violet-50/50 border border-indigo-200 my-6 space-y-3 animate-fade-in max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Icon className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <span>{prompt}</span>
        </h4>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none flex-shrink-0"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onSelect(opt.value ?? opt.label)}
            disabled={disabled || showCustomInput}
            className="w-full text-left px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-50 disabled:pointer-events-none transition-colors duration-150"
          >
            {opt.label}
          </button>
        ))}

        {!showCustomInput ? (
          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            disabled={disabled}
            className="w-full text-left px-4 py-2.5 rounded-xl border border-dashed border-slate-300 bg-transparent text-sm font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 disabled:pointer-events-none transition-colors duration-150"
          >
            Something else
          </button>
        ) : (
          <div className="space-y-2 pt-1">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={customPlaceholder}
              aria-label={customPlaceholder}
              autoFocus
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCustom();
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-50"
            />
            <div className="flex justify-end gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomText('');
                }}
                disabled={disabled}
                className="px-4 py-2 hover:bg-slate-100 rounded-lg text-slate-600 font-semibold transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitCustom}
                disabled={disabled || !customText.trim()}
                className="px-4 py-2 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-lg font-semibold shadow-sm hover:shadow-md transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
