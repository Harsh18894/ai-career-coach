'use client';

import React from 'react';
import { Shield, BookOpen, Compass, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  const steps = [
    {
      title: '1. PDF parsing',
      desc: 'Local extraction on the server parses raw PDF text. A text-paste fallback is available if the PDF is scanned without OCR.',
    },
    {
      title: '2. Profile extraction',
      desc: 'OpenAI parses text into a structured profile: experience duration, current level, role history, notable pivots, skills, and tension points.',
    },
    {
      title: '3. Persona mapping',
      desc: "Categorizes the user into one of three reference archetypes: 'Pivot', 'Grow in Place', or 'Early Career'.",
    },
    {
      title: '4. Proof-of-understanding hook',
      desc: "Crafts a personalized opening message referencing a specific transition or title-vs-impact gap found only in their resume.",
    },
    {
      title: '5. Guided understanding chat',
      desc: '2 to 4 turns where the coach probes for drivers, location/work preferences, and constraints, asking one sharp question at a time.',
    },
    {
      title: '6. Path generation',
      desc: 'Generates exactly 3 career paths with concrete titles, fit rationales citing profile facts/statements, salaries, and gaps to close.',
    },
    {
      title: '7. Regeneration & closing loop',
      desc: 'Allows up to 3 decks (9 paths total), capturing rejection feedback to avoid duplicate directions, ending in a tailored mentor wrap-up.',
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto py-6 px-4 animate-fade-in space-y-12">
      {/* Intro */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
          How the career coach logic works
        </h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
          Behind the scenes of our AI mentor: parsing documents, mapping professional tensions, extracting chat signals, and proposing traceable career trajectories.
        </p>
      </div>

      {/* Assumptions Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5 mb-6">
          <Shield className="w-5 h-5 text-indigo-600" />
          <span>Core assumptions taken</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-600">
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Resume text layer</h3>
              <p className="text-xs leading-relaxed">
                We assume uploaded resumes have a parseable text layer. For scanned images (empty text), the app gracefully degrades to let you paste key highlights in a text field rather than failing.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Model-estimated salary ranges</h3>
              <p className="text-xs leading-relaxed">
                Salary suggestions are indicative and estimated by the AI based on the user&apos;s seniority, region, and industry profile. We do not integrate live labor market API databases for this demo.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Session-only storage</h3>
              <p className="text-xs leading-relaxed">
                To simplify the demo, we store conversation state in-memory and persist it to `localStorage` per session. There is no external database or user authentication (no login required).
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Persona inference</h3>
              <p className="text-xs leading-relaxed">
                The model maps your professional situation into one of three reference archetypes (Pivot, Grow in Place, Early Career) to determine the coach&apos;s tone, questions, and path selection bias.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5 mb-6">
          <BookOpen className="w-5 h-5 text-indigo-600" />
          <span>Steps finalizing the approach</span>
        </h2>
        <div className="space-y-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-4 border-l-2 border-slate-200 pl-4 py-1">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-800">{step.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5 mb-6">
          <Compass className="w-5 h-5 text-indigo-600" />
          <span>System state machine &amp; data flow</span>
        </h2>
        <p className="text-sm text-slate-600 mb-8 leading-relaxed">
          The Career Coach manages state transitions explicitly. When you submit a message, your chat signals are extracted in the background, shaping the recommendations produced.
        </p>

        {/* Visual State flow chart */}
        <div className="flex flex-col gap-4 md:gap-0 md:flex-row md:items-center md:justify-between max-w-2xl mx-auto bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <div className="flex flex-col items-center p-3.5 bg-white rounded-xl shadow-sm border border-slate-200 w-full md:w-36 text-center">
            <span className="text-[10px] font-semibold text-slate-400 tracking-wide uppercase">Stage 1</span>
            <span className="text-xs font-bold text-slate-800 mt-1">UPLOAD</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Resume PDF</span>
          </div>

          <div className="flex justify-center items-center h-6 md:h-auto">
            <ArrowRight className="w-4 h-4 text-slate-300 rotate-90 md:rotate-0" />
          </div>

          <div className="flex flex-col items-center p-3.5 bg-white rounded-xl shadow-sm border border-slate-200 w-full md:w-36 text-center">
            <span className="text-[10px] font-semibold text-slate-400 tracking-wide uppercase">Stage 2</span>
            <span className="text-xs font-bold text-slate-800 mt-1">UNDERSTAND</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Extract signals</span>
          </div>

          <div className="flex justify-center items-center h-6 md:h-auto">
            <ArrowRight className="w-4 h-4 text-slate-300 rotate-90 md:rotate-0" />
          </div>

          <div className="flex flex-col items-center p-3.5 bg-white rounded-xl shadow-sm border border-slate-200 w-full md:w-36 text-center">
            <span className="text-[10px] font-semibold text-slate-400 tracking-wide uppercase">Stage 3</span>
            <span className="text-xs font-bold text-slate-800 mt-1">RECOMMEND</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Exactly 3 paths</span>
          </div>

          <div className="flex justify-center items-center h-6 md:h-auto">
            <ArrowRight className="w-4 h-4 text-slate-300 rotate-90 md:rotate-0" />
          </div>

          <div className="flex flex-col items-center p-3.5 bg-white rounded-xl shadow-sm border border-slate-200 w-full md:w-36 text-center">
            <span className="text-[10px] font-semibold text-slate-400 tracking-wide uppercase">Stage 4</span>
            <span className="text-xs font-bold text-slate-800 mt-1">CLOSED</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Tailored wrap-up</span>
          </div>
        </div>
      </section>

      {/* Back button */}
      <div className="text-center pt-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <span>Return to career coach chat</span>
        </Link>
      </div>
    </div>
  );
}
