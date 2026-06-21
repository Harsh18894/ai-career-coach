'use client';

import React from 'react';
import { Map, Clock, ArrowUpRight } from 'lucide-react';

interface RoadmapTitleCardProps {
  title: string;
  totalDuration: string;
  onOpen: () => void;
}

/** Compact, clickable summary rendered in the chat stream once a roadmap exists — the full
 * structured roadmap lives in the side panel (or mobile drawer), never as a chat bubble. */
export default function RoadmapTitleCard({ title, totalDuration, onOpen }: RoadmapTitleCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full max-w-md flex items-center gap-4 p-5 my-4 rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-indigo-300 hover:shadow-md transition-all duration-150 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-linear-to-br from-indigo-600 to-violet-600 text-white shadow-sm flex items-center justify-center">
        <Map className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 ">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {totalDuration}
        </p>
      </div>
      <span className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-600 whitespace-nowrap">
        View roadmap
        <ArrowUpRight className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

