'use client';

import React from 'react';
import { Shield, BookOpen, Compass, ArrowRight, FileInput, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  const entryPoints = [
    {
      title: 'Upload a resume PDF',
      desc: 'Drag-and-drop or browse for a PDF (up to 5 MB). Text is extracted server-side and parsed into a structured profile.',
    },
    {
      title: 'Export your LinkedIn profile',
      desc: "Don't have a PDF handy? LinkedIn lets you export your profile as a PDF (Me → View Profile → More/Resources → Save to PDF) — upload that the same way as a resume.",
    },
    {
      title: 'Skip the resume entirely',
      desc: "No resume at all? The coach builds your profile from a short adaptive Q&A instead — it asks one question at a time, never re-asking what you've already told it. The opening question offers quick picks (studying / working / between things) alongside a custom option.",
    },
  ];

  const steps = [
    {
      title: '1. Get a profile',
      desc: 'From a parsed resume or a guided Q&A — whichever path you took, you end up with the same structured profile: experience, role history, skills, domains, region/country, notable transitions, and tension points.',
    },
    {
      title: '2. Persona & journey mapping',
      desc: "The profile is mapped to an experience band (fresh / early / building / experienced / senior) and a persona ('pivot', 'grow in place', or 'early career'). This silently shapes the coach's tone, what it asks next, and how it frames recommendations — a student never gets asked about 'years of experience' or treated like they already have a job.",
    },
    {
      title: '3. Personalized opener',
      desc: 'A one-off opening message references a specific, real detail from your profile — a transition, a skill, a project, a stated interest — never a generic greeting.',
    },
    {
      title: '4. Understanding chat',
      desc: 'A few back-and-forth turns where the coach asks exactly one sharp, natural question at a time, reacting to what you actually said. The very first reply is offered as one-click options (grow in place / switch jobs / change domain) instead of a blank box, since that\'s effectively the direction question the coach needs answered anyway — pick one, or type your own. It will not move toward recommendations until it has at least one concrete skill or domain from you, AND a sense of direction (grow in place vs. switch, what you\'re optimizing for, or a real constraint) — both are hard-checked, not just assumed from the model\'s own read of the conversation.',
    },
    {
      title: '5. Market check (if needed)',
      desc: 'If your resume spans more than one country, the coach asks once which market to target before recommending — the countries actually detected in your resume are offered as quick picks, with a custom option if you mean somewhere else, so salary ranges and role framing calibrate correctly.',
    },
    {
      title: '6. Path generation',
      desc: 'Generates exactly 3 career paths per deck: a concrete title, a fit rationale that cites a specific fact or statement from you, a market-calibrated salary range, 2-4 concrete upskills, a first move for this month, and an honest "ambition check" comparing what you\'re aiming for against what your profile actually supports.',
    },
    {
      title: '7. Decline & refine loop',
      desc: 'Not feeling a deck? "Show me more paths" generates a fresh, non-overlapping deck (up to 3 decks, 9 paths total) — declining offers common reasons (too technical, wrong domain, salary mismatch, or none at all) as quick picks, plus a custom option. After two declined decks, the coach stops reshuffling blindly and asks directly what you\'d change (again as quick picks or custom text) before generating a tailored third deck. Decline that too, and you get an honest closing instead of an endless shuffle.',
    },
    {
      title: '8. Lock in a path → roadmap',
      desc: "Choosing a path triggers two things at once: a tailored closing reflection from the coach, and a full week-by-week execution roadmap — phased (courses/projects/practice/application) and classified to your actual skill level for that specific path, not your general seniority. The timeline is paced to a realistic weekly time budget (8-10 hrs/week if you're a student or new grad, 4-6 hrs/week if you're working) rather than a generic \"2-3 months\" for every plan — the same content takes roughly twice as long at the lower end, and a wide skill gap genuinely takes longer than a narrow one.",
    },
    {
      title: '9. Stay and iterate',
      desc: "The session doesn't end at the roadmap. You can keep chatting (the coach treats this as open conversation, not re-onboarding) or request roadmap adjustments — quick picks for pacing too fast/slow or swapping a topic, or your own typed feedback (e.g. \"I can only commit 5 hours a week\") — which regenerate the plan honestly incorporating it, overriding the default pacing.",
    },
  ];

  const stateFlow = [
    { stage: 'PROFILE_BUILDING', label: 'Build profile', sub: 'No resume — adaptive Q&A', color: 'sky' },
    { stage: 'UNDERSTANDING', label: 'Understand', sub: 'One sharp question at a time', color: 'indigo' },
    { stage: 'ASK_COUNTRY', label: 'Confirm market', sub: 'Only if resume spans countries', color: 'violet' },
    { stage: 'RECOMMENDING', label: 'Recommend', sub: 'Exactly 3 paths per deck', color: 'fuchsia' },
    { stage: 'ASK_PREFERENCES', label: 'Ask what to change', sub: 'After 2 declined decks', color: 'pink' },
    { stage: 'ROADMAP', label: 'Roadmap', sub: 'Path chosen, plan in hand', color: 'emerald' },
    { stage: 'CLOSED', label: 'Closed', sub: 'Tailored wrap-up', color: 'slate' },
  ];

  const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    sky: { bg: 'from-sky-50 to-white', border: 'border-sky-200', text: 'text-sky-500' },
    indigo: { bg: 'from-indigo-50 to-white', border: 'border-indigo-200', text: 'text-indigo-500' },
    violet: { bg: 'from-violet-50 to-white', border: 'border-violet-200', text: 'text-violet-500' },
    fuchsia: { bg: 'from-fuchsia-50 to-white', border: 'border-fuchsia-200', text: 'text-fuchsia-500' },
    pink: { bg: 'from-pink-50 to-white', border: 'border-pink-200', text: 'text-pink-500' },
    emerald: { bg: 'from-emerald-50 to-white', border: 'border-emerald-200', text: 'text-emerald-500' },
    slate: { bg: 'from-slate-50 to-white', border: 'border-slate-200', text: 'text-slate-500' },
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6 px-4 animate-fade-in space-y-12">
      {/* Intro */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          <span className="bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            How Aria&apos;s logic works
          </span>
        </h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
          Behind the scenes of Aria, our AI career mentor: turning a resume (or a short conversation) into a structured profile,
          understanding your direction, proposing traceable career paths, and building a concrete roadmap once you pick one.
        </p>
      </div>

      {/* Entry points */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-linear-to-br from-sky-600 to-indigo-600 shadow-sm flex-shrink-0">
            <FileInput className="w-4 h-4 text-white" />
          </span>
          <span>How to get started</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entryPoints.map((ep, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 text-sm mb-1">{ep.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{ep.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Assumptions Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-linear-to-br from-indigo-600 to-blue-600 shadow-sm flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </span>
          <span>Core assumptions taken</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-600">
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Resume text layer</h3>
              <p className="text-xs leading-relaxed">
                We assume uploaded resumes have a parseable text layer. Scanned-image PDFs without one cannot be parsed — use the no-resume guided Q&amp;A instead.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Model-estimated salary ranges</h3>
              <p className="text-xs leading-relaxed">
                Salary suggestions are indicative and estimated by the AI based on the user&apos;s seniority, region, and industry profile. We do not integrate live labor market API databases for this demo.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Never recommend without direction</h3>
              <p className="text-xs leading-relaxed">
                Two hard, non-AI gates sit in front of every recommendation: at least one concrete skill or domain, and a genuine stated sense of direction (not just a bare &quot;yes&quot;). The model&apos;s own self-assessment is never trusted alone.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Session-only storage</h3>
              <p className="text-xs leading-relaxed">
                To simplify the demo, conversation state is held in memory and persisted to <code className="px-1 py-0.5 bg-slate-200/70 rounded text-[11px]">localStorage</code> per session. There is no external database or user authentication (no login required) — refreshing the page resumes your last session on this device.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Persona inference</h3>
              <p className="text-xs leading-relaxed">
                The model maps your professional situation into one of three reference archetypes (Pivot, Grow in Place, Early Career) and an experience band, to determine the coach&apos;s tone, questions, and path framing.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Adaptive, not scripted</h3>
              <p className="text-xs leading-relaxed">
                Both the understanding chat and the no-resume intake question are generated turn-by-turn from everything said so far — there is no fixed question script, so nothing you&apos;ve already answered gets re-asked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-linear-to-br from-violet-600 to-purple-600 shadow-sm flex-shrink-0">
            <BookOpen className="w-4 h-4 text-white" />
          </span>
          <span>How a session unfolds</span>
        </h2>
        <div className="space-y-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-4 border-l-2 border-slate-200 pl-4 py-1">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-800">{step.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-linear-to-br from-fuchsia-600 to-pink-600 shadow-sm flex-shrink-0">
            <Compass className="w-4 h-4 text-white" />
          </span>
          <span>Conversation state machine</span>
        </h2>
        <p className="text-sm text-slate-600 mb-8 leading-relaxed">
          The coach tracks an explicit stage at all times rather than guessing intent from raw chat text. Most sessions move
          left to right below, but <span className="font-medium text-slate-800">ASK_COUNTRY</span> and{' '}
          <span className="font-medium text-slate-800">ASK_PREFERENCES</span> are conditional detours, they only fire when
          the resume spans multiple countries, or after two declined decks, respectively. <span className="font-medium text-slate-800">ROADMAP </span> isn&apos;t a dead end either: the session stays open for follow-up chat and roadmap adjustments until you end it.
        </p>

        {/* Visual State flow chart */}
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-2 max-w-3xl mx-auto bg-linear-to-r from-indigo-50/60 via-violet-50/40 to-emerald-50/40 p-6 rounded-2xl border border-slate-200">
          {stateFlow.map((s, idx) => {
            const c = colorClasses[s.color];
            return (
              <React.Fragment key={s.stage}>
                <div
                  className={`flex flex-col items-center p-3.5 bg-linear-to-br ${c.bg} rounded-xl shadow-sm border ${c.border} w-[140px] text-center`}
                >
                  <span className={`text-[10px] font-semibold tracking-wide uppercase ${c.text}`}>Stage {idx + 1}</span>
                  <span className="text-xs font-bold text-slate-800 mt-1">{s.label}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{s.sub}</span>
                </div>
                {idx < stateFlow.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {/* Under the hood */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-linear-to-br from-emerald-600 to-teal-600 shadow-sm flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </span>
          <span>Under the hood</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">Right-sized models per task</h3>
            <p className="text-xs leading-relaxed">
              Structured extraction (resume parsing, signal tracking) runs on a smaller, cheaper model — it&apos;s
              classification into a fixed schema, not open-ended writing. Conversational replies, path generation, and
              roadmap planning run on a stronger model, since those are read directly by you and need real reasoning.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">Streamed replies</h3>
            <p className="text-xs leading-relaxed">
              Every message you read directly — chat replies and guided-intake questions — streams in token by token
              instead of waiting for the full response, so the coach feels responsive even on longer answers.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">Bounded conversation history</h3>
            <p className="text-xs leading-relaxed">
              The durable facts about you (profile, accumulated signals) are distilled into every prompt directly, so
              very old chat turns are capped out of the model context rather than resent in full on every single turn.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">Parallel work, not sequential</h3>
            <p className="text-xs leading-relaxed">
              Locking in a path kicks off your tailored closing message and your execution roadmap at the same time,
              instead of waiting for one to finish before starting the other.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">One quick-pick pattern, reused everywhere</h3>
            <p className="text-xs leading-relaxed">
              Every point in the conversation with a small, predictable set of likely answers — your first reply,
              confirming a market, declining a deck, what to change, roadmap pacing — uses the same one-click options
              control, always with a &quot;something else&quot; escape into free text. Picking an option posts it as
              a normal chat message and the options disappear immediately, so it always reads as a real reply, never
              a form. Open-ended, dynamically generated questions (the rest of the understanding chat, the adaptive
              guided-intake questions) stay free text, since there&apos;s no small fixed answer set to offer.
            </p>
          </div>
        </div>
      </section>

      {/* Back button */}
      <div className="text-center pt-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <span>Return to chat with Aria</span>
        </Link>
      </div>
    </div>
  );
}
