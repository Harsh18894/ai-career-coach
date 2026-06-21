'use client';

import React from 'react';
import { DollarSign, BookOpen, Navigation, Target, ChevronDown, TrendingUp, TrendingDown, CheckCircle2, Lock } from 'lucide-react';
import { CareerPath } from '@/lib/ai/schemas';

interface PathCardProps {
  path: CareerPath;
  isSelected: boolean;
  onToggle: () => void;
  onLockIn: () => void;
  disabled?: boolean;
}

const AMBITION_META: Record<
  CareerPath['ambitionCheck']['verdict'],
  { label: string; icon: typeof TrendingUp; badgeClass: string; textClass: string }
> = {
  too_high: {
    label: 'Aim realistic',
    icon: TrendingDown,
    badgeClass: 'bg-linear-to-r from-amber-50 to-orange-50 text-amber-700 border-amber-200',
    textClass: 'text-amber-700',
  },
  too_low: {
    label: 'Aim higher',
    icon: TrendingUp,
    badgeClass: 'bg-linear-to-r from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200',
    textClass: 'text-emerald-700',
  },
  aligned: {
    label: 'Well calibrated',
    icon: CheckCircle2,
    badgeClass: 'bg-linear-to-r from-slate-100 to-slate-50 text-slate-600 border-slate-200',
    textClass: 'text-slate-600',
  },
};

export default function PathCard({
  path,
  isSelected,
  onToggle,
  onLockIn,
  disabled = false,
}: PathCardProps) {
  const ambition = AMBITION_META[path.ambitionCheck.verdict];
  const AmbitionIcon = ambition.icon;

  return (
    <div
      className={`relative w-full flex flex-col rounded-2xl border transition-all duration-200 ${
        isSelected
          ? 'border-indigo-600 bg-linear-to-br from-indigo-50 via-white to-violet-50/60 shadow-md ring-1 ring-indigo-600'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md shadow-sm'
      } ${disabled && !isSelected ? 'opacity-60' : ''}`}
    >
      {/* Header row: title toggles expand/collapse; the lock CTA is a sibling button (not nested)
          that only renders once this accordion is selected/expanded. */}
      <div className="w-full flex items-start gap-3 p-6">
        <button
          type="button"
          onClick={() => !disabled && onToggle()}
          disabled={disabled}
          aria-expanded={isSelected}
          className={`flex-1 min-w-0 text-left ${disabled && !isSelected ? 'cursor-not-allowed' : 'cursor-pointer'} focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg`}
        >
          <h3 className="text-lg font-bold text-slate-900 leading-snug">{path.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center text-xs font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded">
              <DollarSign className="w-3.5 h-3.5 text-slate-400 mr-1" />
              {path.salaryRange}
            </span>
            <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border ${ambition.badgeClass}`}>
              <AmbitionIcon className="w-3 h-3" />
              {ambition.label}
            </span>
          </div>
        </button>

        <div className="flex-shrink-0 flex items-center gap-2 pt-1">
          {isSelected && (
            <button
              type="button"
              onClick={() => !disabled && onLockIn()}
              disabled={disabled}
              className="flex items-center gap-1.5 px-4 py-2 bg-linear-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock recommendation</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => !disabled && onToggle()}
            disabled={disabled}
            aria-label={isSelected ? 'Collapse path details' : 'Expand path details'}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isSelected ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expanded detail — only rendered once this card is selected, keeping the collapsed deck scannable. */}
      {isSelected && (
        <div className="px-6 pb-6 -mt-1 animate-fade-in">
          <div className="pt-4 border-t border-slate-100">
            <p className="text-sm font-medium text-indigo-700 flex items-start gap-2">
              <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Why this fits you</span>
            </p>
            <p className="mt-1 text-sm text-slate-600 italic leading-relaxed pl-6">
              &ldquo;{path.fitRationale}&rdquo;
            </p>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div className={`flex items-center font-semibold mb-1 ${ambition.textClass}`}>
              <AmbitionIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
              <span>{ambition.label}</span>
            </div>
            <p className="text-slate-600 pl-5">{path.ambitionCheck.note}</p>
          </div>

          <div className="mt-4 text-sm">
            <div className="flex items-center text-slate-700 font-semibold mb-2">
              <BookOpen className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
              <span>Upskills to acquire</span>
            </div>
            <ul className="space-y-1.5 pl-6 list-disc text-slate-600 text-xs leading-relaxed">
              {path.upskills.map((skill, i) => (
                <li key={i}>{skill}</li>
              ))}
            </ul>
          </div>

          {path.firstMove && (
            <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center font-semibold text-slate-800 mb-1">
                <Navigation className="w-3.5 h-3.5 mr-1.5 text-indigo-600 flex-shrink-0" />
                <span>First move this month</span>
              </div>
              <p className="text-slate-600 pl-5">{path.firstMove}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
