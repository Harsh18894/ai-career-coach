'use client';

import React from 'react';
import { Map, Clock, GraduationCap, Hammer, Briefcase, type LucideIcon } from 'lucide-react';
import { Roadmap, RoadmapPhase } from '@/lib/ai/schemas';

interface RoadmapViewProps {
  roadmap: Roadmap;
}

const PHASE_META: Record<RoadmapPhase['type'], { label: string; icon: LucideIcon }> = {
  course: { label: 'Learn', icon: GraduationCap },
  project: { label: 'Build', icon: Hammer },
  application: { label: 'Apply', icon: Briefcase },
};

const SKILL_LEVEL_LABEL: Record<Roadmap['skillLevel'], string> = {
  beginner: 'Beginner',
  basic: 'Basic skills',
  good: 'Good skills',
  experienced: 'Experienced',
};

export default function RoadmapView({ roadmap }: RoadmapViewProps) {
  return (
    <div className="w-full my-8 animate-fade-in">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Map className="w-5 h-5 text-indigo-600" />
              <span>Your execution roadmap</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
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

        {/* Phases timeline */}
        <ol className="divide-y divide-slate-100">
          {roadmap.phases.map((phase, idx) => {
            const meta = PHASE_META[phase.type];
            const Icon = meta.icon;
            return (
              <li key={idx} className="p-6 flex gap-4">
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  {idx < roadmap.phases.length - 1 && (
                    <div className="w-px flex-1 bg-slate-200 mt-2" aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold tracking-wide uppercase text-indigo-600">
                      {meta.label}
                    </span>
                    <h3 className="text-base font-semibold text-slate-900">{phase.title}</h3>
                    <span className="text-xs font-medium text-slate-500 ml-auto flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {phase.timeline}
                    </span>
                  </div>
                  {phase.description && (
                    <p className="mt-1 text-sm text-slate-500 leading-relaxed">{phase.description}</p>
                  )}
                  <ul className="mt-3 space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                    {phase.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
