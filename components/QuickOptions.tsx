'use client';

import React, { useState } from 'react';
import { Check, X as XIcon, type LucideIcon } from 'lucide-react';

export interface QuickOption {
  label: string;
  /** What's actually sent on selection. Defaults to `label` when omitted — set this when the
   * button text and the underlying message/value should differ (e.g. a short label that expands
   * into a fuller natural-language sentence). */
  value?: string;
}

interface QuickOptionsProps {
  /** Both omittable together — when `prompt` is empty, the heading row (icon + text) is
   * skipped entirely. Used when the question itself already appears as the preceding chat
   * bubble, so restating it here would be redundant. */
  icon?: LucideIcon;
  prompt?: string;
  options: QuickOption[];
  /** Called with the resolved value — either the clicked option's `value`/`label`, or the
   * candidate's own typed text from the "Something else" input. In multi-select mode, called
   * once with everything picked (plus any custom additions) joined into one natural string. */
  onSelect: (value: string) => void;
  disabled?: boolean;
  customPlaceholder?: string;
  /** When provided, renders a "Cancel" control that dismisses the whole panel — only meaningful
   * for sites where this control is an optional detour (e.g. "why are you declining this deck?"),
   * not for sites where answering is a mandatory step in the flow. */
  onCancel?: () => void;
  /** When true, options toggle in/out of a selection instead of firing immediately — a
   * "Continue" button then joins everything picked into one message. Default false (single-select,
   * fires immediately on click) — every existing call site is unaffected by this prop's existence. */
  multiSelect?: boolean;
}

// "Python, SQL, and stakeholder management" — reads naturally for 1, 2, or 3+ items.
function joinNaturally(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Shared "pick one (or several), or type your own" control used everywhere the coach asks
 * something with a small, known set of likely answers. Keeps its own "Something else" text-entry
 * and (in multi-select mode) selection state internally so every call site gets identical
 * behavior: click an option (or type custom text and submit) → `onSelect` fires once with the
 * final value → the caller is responsible for turning that into a visible chat message and for
 * hiding this panel (typically by advancing past whatever state gated rendering it).
 */
export default function QuickOptions({
  icon: Icon,
  prompt,
  options,
  onSelect,
  disabled = false,
  customPlaceholder = "Type your own answer...",
  onCancel,
  multiSelect = false,
}: QuickOptionsProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const presetValues = new Set(options.map((opt) => opt.value ?? opt.label));
  const customAdditions = selected.filter((v) => !presetValues.has(v));

  const togglePreset = (value: string) => {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const removeSelected = (value: string) => {
    setSelected((prev) => prev.filter((v) => v !== value));
  };

  const submitCustom = () => {
    const text = customText.trim();
    if (!text || disabled) return;
    if (multiSelect) {
      setSelected((prev) => [...prev, text]);
      setCustomText('');
      setShowCustomInput(false);
    } else {
      onSelect(text);
      setCustomText('');
      setShowCustomInput(false);
    }
  };

  const submitSelection = () => {
    if (selected.length === 0 || disabled) return;
    onSelect(joinNaturally(selected));
    setSelected([]);
  };

  return (
    <div className="p-5 rounded-2xl bg-linear-to-br from-indigo-50/70 to-violet-50/50 border border-indigo-200 my-6 space-y-3 animate-fade-in max-w-xl mx-auto">
      <div className={`flex items-center justify-between gap-2 ${!prompt && !onCancel ? 'hidden' : ''}`}>
        {prompt && (
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
            <span>{prompt}</span>
          </h4>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none flex-shrink-0 ml-auto"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const value = opt.value ?? opt.label;
          const isChecked = multiSelect && selected.includes(value);
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => (multiSelect ? togglePreset(value) : onSelect(value))}
              disabled={disabled || showCustomInput}
              aria-pressed={multiSelect ? isChecked : undefined}
              className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-between gap-2 ${isChecked
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/50'
                }`}
            >
              <span>{opt.label}</span>
              {isChecked && <Check className="w-4 h-4 flex-shrink-0" />}
            </button>
          );
        })}

        {multiSelect && customAdditions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {customAdditions.map((text) => (
              <span
                key={text}
                className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-indigo-600 text-white text-xs font-medium"
              >
                {text}
                <button
                  type="button"
                  onClick={() => removeSelected(text)}
                  disabled={disabled}
                  aria-label={`Remove ${text}`}
                  className="p-0.5 rounded-full hover:bg-white/20 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

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
                {multiSelect ? 'Add' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {multiSelect && !showCustomInput && (
          <button
            type="button"
            onClick={submitSelection}
            disabled={disabled || selected.length === 0}
            className="w-full mt-1 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
          >
            Continue{selected.length > 0 ? ` (${selected.length} selected)` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
