'use client';

import React from 'react';
import { Compass, Sparkles, XCircle } from 'lucide-react';
import { CareerPath } from '@/lib/ai/schemas';
import PathCard from './PathCard';

interface PathDeckProps {
  paths: CareerPath[];
  deckCount: number;
  selectedIndex: number | null;
  onSelectIndex: (index: number | null) => void;
  onSelectPath: (path: CareerPath) => void;
  onRegenerate: () => void;
  onRejectAll: () => void;
  isLoading: boolean;
}

export default function PathDeck({
  paths,
  deckCount,
  selectedIndex,
  onSelectIndex,
  onSelectPath,
  onRegenerate,
  onRejectAll,
  isLoading,
}: PathDeckProps) {
  const maxDecks = 3;
  const canRegenerate = deckCount < maxDecks;

  const handleToggleCard = (index: number) => {
    onSelectIndex(selectedIndex === index ? null : index);
  };

  return (
    <div className="w-full space-y-6 my-8 animate-fade-in">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-linear-to-br from-indigo-600 to-violet-600 shadow-sm flex-shrink-0">
            <Compass className="w-5 h-5 text-white" />
          </span>
          <span>Your recommended career paths</span>
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Deck {deckCount} of {maxDecks} · Expand a path to review it, then lock it in.
        </p>
      </div>

      {/* Single vertical column — each path is a full-width accordion, stacked in recommendation order */}
      <div className="flex flex-col gap-4">
        {paths.map((path, index) => (
          <PathCard
            key={index}
            path={path}
            isSelected={selectedIndex === index}
            onToggle={() => handleToggleCard(index)}
            onLockIn={() => onSelectPath(path)}
            disabled={isLoading}
          />
        ))}
      </div>

      {/* Control Buttons underneath the deck */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
        {canRegenerate ? (
          <button
            type="button"
            onClick={() => {
              onSelectIndex(null);
              onRegenerate();
            }}
            disabled={isLoading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 rounded-xl font-semibold shadow-sm transition-all duration-150 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Show me more paths</span>
          </button>
        ) : (
          <div className="text-xs text-slate-500 font-medium px-4 py-2 bg-slate-100 rounded-lg">
            Maximum path recommendation decks shown (9 options total).
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onSelectIndex(null);
            onRejectAll();
          }}
          disabled={isLoading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl font-medium transition-all duration-150 disabled:opacity-50"
        >
          <XCircle className="w-4 h-4" />
          <span>Decline all paths</span>
        </button>
      </div>
    </div>
  );
}
