'use client';

import React, { useState } from 'react';
import { Map, Clock, GraduationCap, Hammer, Dumbbell, Briefcase, ChevronDown, type LucideIcon } from 'lucide-react';
import { Roadmap, RoadmapPhase } from '@/lib/ai/schemas';

interface RoadmapViewProps {
  roadmap: Roadmap;
}

const PHASE_META: Record<RoadmapPhase['type'], { label: string; icon: LucideIcon; chipClass: string; labelClass: string }> = {
  course: { label: 'Learn', icon: GraduationCap, chipClass: 'bg-linear-to-br from-sky-500 to-blue-600', labelClass: 'text-blue-600' },
  project: { label: 'Build', icon: Hammer, chipClass: 'bg-linear-to-br from-violet-500 to-purple-600', labelClass: 'text-violet-600' },
  practice: { label: 'Practice', icon: Dumbbell, chipClass: 'bg-linear-to-br from-fuchsia-500 to-pink-600', labelClass: 'text-fuchsia-600' },
  application: { label: 'Apply', icon: Briefcase, chipClass: 'bg-linear-to-br from-emerald-500 to-teal-600', labelClass: 'text-emerald-600' },
};

const SKILL_LEVEL_LABEL: Record<Roadmap['skillLevel'], string> = {
  beginner: 'Beginner',
  basic: 'Basic skills',
  good: 'Good skills',
  experienced: 'Experienced',
};

export default function RoadmapView({ roadmap }: RoadmapViewProps) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0);

  return (
    <div className="w-full animate-fade-in">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-linear-to-r from-indigo-50 via-violet-50/60 to-white border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-linear-to-br from-indigo-600 to-violet-600 shadow-sm flex-shrink-0">
                <Map className="w-4 h-4 text-white" />
              </span>
              <span>Your execution roadmap</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 bg-linear-to-r from-indigo-100 to-violet-100 text-indigo-700 rounded-full border border-indigo-200">
                {SKILL_LEVEL_LABEL[roadmap.skillLevel]}
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                {roadmap.totalDuration}
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{roadmap.summary}</p>
        </div>

        {/* Phases — collapsible, each holding its own week-by-week breakdown */}
        <div className="divide-y divide-slate-100">
          {roadmap.phases.map((phase, idx) => {
            const meta = PHASE_META[phase.type];
            const Icon = meta.icon;
            const isOpen = expandedPhase === idx;
            const firstWeek = phase.weeks[0]?.week;
            const lastWeek = phase.weeks[phase.weeks.length - 1]?.week;
            const weekRangeLabel = firstWeek === lastWeek ? `Week ${firstWeek}` : `Weeks ${firstWeek}-${lastWeek}`;

            return (
              <div key={idx}>
                <button
                  type="button"
                  onClick={() => setExpandedPhase(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-4 p-6 text-left hover:bg-slate-50/60 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <div className={`flex-shrink-0 w-9 h-9 rounded-full text-white shadow-sm flex items-center justify-center ${meta.chipClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-semibold tracking-wide uppercase ${meta.labelClass}`}>
                        {meta.label}
                      </span>
                      <h3 className="text-base font-semibold text-slate-900">{phase.title}</h3>
                    </div>
                    {phase.description && (
                      <p className="mt-0.5 text-sm text-slate-500 leading-relaxed">{phase.description}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5" />
                      {weekRangeLabel}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 animate-fade-in">
                    <ol className="space-y-4 pl-[52px]">
                      {phase.weeks.map((week) => (
                        <li key={week.week} className="flex gap-3">
                          <span className={`flex-shrink-0 w-12 text-xs font-semibold pt-0.5 ${meta.labelClass}`}>
                            Week {week.week}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-800">{week.focus}</p>
                            <ul className="mt-1.5 space-y-1 text-sm text-slate-600 list-disc pl-5">
                              {week.items.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
