'use client';

import React from 'react';
import { Check, DollarSign, BookOpen, Navigation, Target } from 'lucide-react';
import { CareerPath } from '@/lib/ai/schemas';

interface PathCardProps {
  path: CareerPath;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

export default function PathCard({
  path,
  isSelected,
  onSelect,
  disabled = false,
}: PathCardProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
      className={`relative w-full text-left flex flex-col p-6 rounded-2xl border transition-all duration-200 ${
        isSelected
          ? 'border-indigo-600 bg-indigo-50/40 shadow-md ring-1 ring-indigo-600'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md shadow-sm'
      } ${
        disabled && !isSelected ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      } focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
    >
      {/* Selection Tag */}
      {isSelected && (
        <div className="absolute top-4 right-4 p-1 rounded-full bg-indigo-600 text-white">
          <Check className="w-4 h-4" />
        </div>
      )}

      {/* Title */}
      <h3 className="text-lg font-bold text-slate-900 pr-8 leading-snug">
        {path.title}
      </h3>

      {/* Rationale */}
      <div className="mt-4 flex-grow">
        <p className="text-sm font-medium text-indigo-700 flex items-start gap-2">
          <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Why this fits you</span>
        </p>
        <p className="mt-1 text-sm text-slate-600 italic leading-relaxed pl-6">
          &ldquo;{path.fitRationale}&rdquo;
        </p>
      </div>

      {/* Salary Range */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center text-sm text-slate-700">
        <DollarSign className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
        <span className="font-semibold mr-1.5">Salary:</span>
        <span className="font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">
          {path.salaryRange}
        </span>
      </div>

      {/* Upskills */}
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

      {/* First Move */}
      {path.firstMove && (
        <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div className="flex items-center font-semibold text-slate-800 mb-1">
            <Navigation className="w-3.5 h-3.5 mr-1.5 text-indigo-600 flex-shrink-0" />
            <span>First move this month</span>
          </div>
          <p className="text-slate-600 pl-5">{path.firstMove}</p>
        </div>
      )}
    </button>
  );
}
