'use client';

import React, { useState } from 'react';
import { Compass, Sparkles, XCircle, CheckCircle } from 'lucide-react';
import { CareerPath } from '@/lib/ai/schemas';
import PathCard from './PathCard';

interface PathDeckProps {
  paths: CareerPath[];
  deckCount: number;
  onSelectPath: (path: CareerPath) => void;
  onRegenerate: () => void;
  onRejectAll: () => void;
  isLoading: boolean;
}

export default function PathDeck({
  paths,
  deckCount,
  onSelectPath,
  onRegenerate,
  onRejectAll,
  isLoading,
}: PathDeckProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const maxDecks = 3;
  const canRegenerate = deckCount < maxDecks;

  const handleSelectCard = (index: number) => {
    setSelectedIndex((prevIndex) => (prevIndex === index ? null : index));
  };

  const handleConfirmChoice = () => {
    if (selectedIndex !== null) {
      onSelectPath(paths[selectedIndex]);
    }
  };

  return (
    <div className="w-full space-y-8 my-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-4 gap-3 md:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
            <span>Your recommended career paths</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Deck {deckCount} of {maxDecks} · Review the rationales and choose a path to lock down.
          </p>
        </div>

        {selectedIndex !== null && (
          <button
            type="button"
            onClick={handleConfirmChoice}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Lock in &ldquo;{paths[selectedIndex].title}&rdquo;</span>
          </button>
        )}
      </div>

      {/* Grid containing exactly 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {paths.map((path, index) => (
          <PathCard
            key={index}
            path={path}
            isSelected={selectedIndex === index}
            onSelect={() => handleSelectCard(index)}
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
              setSelectedIndex(null);
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
            setSelectedIndex(null);
            onRejectAll();
          }}
          disabled={isLoading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl font-medium transition-all duration-150 disabled:opacity-50"
        >
          <XCircle className="w-4 h-4" />
          <span>Decline all paths</span>
        </button>
      </div>
    </div>
  );
}
