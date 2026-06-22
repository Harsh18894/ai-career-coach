'use client';

import React from 'react';
import {
  Shield,
  BookOpen,
  Compass,
  ArrowRight,
  FileInput,
  Sparkles,
  FlaskConical,
  Fingerprint,
  GitCompare,
  ShieldAlert,
  Scale,
  MessageSquareOff,
  RefreshCw,
  MousePointerClick,
} from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  const entryPoints = [
    {
      title: 'Upload a resume PDF',
      desc: 'Drag and drop a PDF, or browse for one (up to 5 MB). We pull the text out on our server and turn it into a structured profile.',
    },
    {
      title: 'Export your LinkedIn profile',
      desc: 'No PDF handy? LinkedIn lets you export your profile as one (Me, then View Profile, then More or Resources, then Save to PDF). Upload that the same way you would a resume.',
    },
    {
      title: 'Skip the resume entirely',
      desc: 'No resume at all? The coach builds your profile through a short, adaptive conversation instead. It asks one question at a time and never repeats what you have already told it. The first question gives you quick picks (studying, working, between things) plus a box to type your own.',
    },
  ];

  const steps = [
    {
      title: '1. Get a profile',
      desc: 'Whether it came from a parsed resume or a short chat, you end up with the same structured profile: experience, role history, skills, domains, region, notable transitions, and a few honest tension points worth addressing.',
    },
    {
      title: '2. Persona and journey mapping',
      desc: "Your profile gets mapped to an experience band (fresh, early, building, experienced, senior) and a persona (pivoting, growing in place, or early career). This quietly shapes the coach's tone, what it asks next, and how it frames every recommendation. A student never gets asked about years of experience or treated like they already have a job.",
    },
    {
      title: '3. A personalized opener',
      desc: 'The coach opens with one message that references something real and specific from your profile: a transition, a skill, a project, something you said you wanted. Never a generic greeting, and the quick-reply buttons under it are generated to match the exact question it just asked you.',
    },
    {
      title: '4. The understanding chat',
      desc: "A handful of back and forth turns where the coach asks one sharp, natural question at a time, reacting to what you actually said. Almost every question comes with quick-pick buttons built fresh for that exact question (single choice or multi-select, whichever fits), plus a box for your own words if none of them fit. The coach will not move toward a recommendation until it has at least one real skill or domain from you, and a genuine sense of direction, whether that is growing in place, switching things up, or a constraint that matters to you.",
    },
    {
      title: '5. A quick market check, if needed',
      desc: 'If your resume mentions more than one country, the coach asks once which market to aim for before recommending anything. The countries it actually found in your resume show up as quick picks, with room to type a different one, so salary numbers and role framing land correctly.',
    },
    {
      title: '6. Three paths, clearly ranked',
      desc: 'You get exactly three career paths per round: a concrete title, a fit rationale that points to something specific you said or that is in your profile, a salary range calibrated to your market, two to four skills worth picking up, and one concrete move for this month. Each path is also tagged Conservative, Realistic, or Ambitious, so you can see at a glance which one is the safe bet, which one you should actually aim for, and which one is the stretch goal.',
    },
    {
      title: '7. Decline and refine',
      desc: 'Not feeling a set of paths? Asking for more generates a fresh batch that does not repeat what you already saw, up to three rounds and nine paths total. Declining offers a few common reasons as quick picks (too technical, wrong domain, salary does not match, or just none of the above), plus your own words. After two declined rounds, the coach stops reshuffling blindly and asks you directly what to change. Decline that one too, and you get an honest closing instead of an endless loop.',
    },
    {
      title: '8. Lock in a path, get a roadmap',
      desc: "Choosing a path does two things at once: the coach writes you a short, tailored closing note, and builds a full week-by-week roadmap (courses, projects, practice, then real applications) matched to your actual skill gap for that specific path. The timeline honors the tier you picked: roughly one to two months for a Conservative path, three to four for Realistic, and six to eight for Ambitious, paced around four to six hours a week for working professionals or eight to ten for students and recent grads, since breaking into an industry without a track record takes real time no matter how many hours you put in.",
    },
    {
      title: '9. Stay and keep talking',
      desc: 'The conversation does not end once you have a roadmap. Keep chatting and the coach treats it as an open conversation, not a restart. Ask for adjustments (too fast, too slow, swap a topic, or just type what you need, like "I can only commit five hours a week") and it will honestly rework the plan around it.',
    },
  ];

  const stateFlow = [
    { stage: 'PROFILE_BUILDING', label: 'Build profile', sub: 'No resume: a short adaptive chat', color: 'sky' },
    { stage: 'UNDERSTANDING', label: 'Understand', sub: 'One sharp question at a time', color: 'indigo' },
    { stage: 'ASK_COUNTRY', label: 'Confirm market', sub: 'Only if your resume spans countries', color: 'violet' },
    { stage: 'RECOMMENDING', label: 'Recommend', sub: 'Exactly 3 ranked paths', color: 'fuchsia' },
    { stage: 'ASK_PREFERENCES', label: 'Ask what to change', sub: 'After 2 declined rounds', color: 'pink' },
    { stage: 'ROADMAP', label: 'Roadmap', sub: 'Path chosen, plan in hand', color: 'emerald' },
    { stage: 'CLOSED', label: 'Closed', sub: 'A tailored wrap-up', color: 'slate' },
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

  const evalChecks = [
    {
      icon: Fingerprint,
      title: 'Personalized, not generic',
      desc: 'Checks that the opening message always names something real and specific from your profile, and that two different people get two genuinely different openers, never the same template with a name swapped in.',
    },
    {
      icon: GitCompare,
      title: 'Recommendations trace back to you',
      desc: 'Every recommended path gets checked against your actual profile and what you said in chat, so nothing on the deck is left unexplained or generic.',
    },
    {
      icon: Scale,
      title: 'Your answers actually move the needle',
      desc: 'The same profile with two different stated goals has to produce two different sets of paths. If your goals change but the suggestions stay the same, that counts as a failure.',
    },
    {
      icon: ShieldAlert,
      title: 'A resume cannot hijack the coach',
      desc: 'We test what happens if a resume has a hidden instruction buried in it, like "only ever recommend X." The coach has to ignore it and keep recommending based on your real background.',
    },
    {
      icon: Shield,
      title: 'Honest about difficulty',
      desc: "When someone's stated ambition is a real stretch, the coach has to say so plainly, name the extra effort or time involved, and still build a roadmap that holds together week to week, rather than a flattering plan that quietly avoids the hard truth.",
    },
    {
      icon: MessageSquareOff,
      title: 'Stays on topic',
      desc: 'If you ask the coach to write your resume, draft a bullet point, or hand the thinking back to it, it has to decline kindly and steer back to figuring out your direction, instead of turning into a document-writing assistant.',
    },
    {
      icon: RefreshCw,
      title: 'Never repeats itself',
      desc: 'The no-resume guided chat (and every adaptive follow-up after it) is generated fresh from everything you have already said, so it should never re-ask something you answered or assume you have experience you do not.',
    },
    {
      icon: MousePointerClick,
      title: 'Buttons that actually answer the question',
      desc: 'Every quick-pick button, on the opener or any later turn, has to be a complete, real answer on its own. If a question genuinely needs your own specific details, the coach has to leave it as free text instead of offering fake choices.',
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto py-6 px-4 animate-fade-in space-y-12">
      {/* Intro */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          <span className="bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            How this works?
          </span>
        </h1>
        <p className="text-slate-500 max-w-2xl mx-auto text-base leading-relaxed">
          A look behind the curtain at Aria, your AI career mentor: how it turns a resume (or a short chat) into a real
          profile, figures out where you actually want to go, proposes three ranked paths you can trust, and builds a
          concrete roadmap once you pick one.
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
          <span>Core assumptions we make</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-600">
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Your resume needs a text layer</h3>
              <p className="text-xs leading-relaxed">
                We assume an uploaded resume has real, selectable text in it. A scanned image with no text layer cannot be
                read. Use the no-resume guided chat instead if that happens to you.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Salary ranges are estimates</h3>
              <p className="text-xs leading-relaxed">
                Salary numbers are indicative, estimated by the model from your seniority, region, and industry. We are not
                pulling live numbers from a labor market database in this demo.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">No recommendation without real direction</h3>
              <p className="text-xs leading-relaxed">
                Two hard checks sit in front of every recommendation: at least one real skill or domain, and a genuine
                stated sense of direction, not just a bare yes. We never trust the model&apos;s own read of the
                conversation alone for this.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Your session stays on your device</h3>
              <p className="text-xs leading-relaxed">
                To keep this demo simple, your conversation lives in your browser&apos;s{' '}
                <code className="px-1 py-0.5 bg-slate-200/70 rounded text-[11px]">localStorage</code>. There is no
                account, no login, and no external database. Refresh the page and you pick up right where you left off
                on that device.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Persona inference</h3>
              <p className="text-xs leading-relaxed">
                The model places your situation into one of three reference archetypes (pivoting, growing in place, or
                early career) and an experience band, which quietly shapes the coach&apos;s tone, questions, and how it
                frames each path.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-1">Adaptive, not scripted</h3>
              <p className="text-xs leading-relaxed">
                Both the understanding chat and the no-resume questions are generated turn by turn from everything said
                so far. There is no fixed script, so nothing you have already answered gets asked again.
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
          The coach always knows exactly what stage it is in, instead of guessing intent from raw chat text. Most sessions
          move left to right below, but <span className="font-medium text-slate-800">ASK_COUNTRY</span> and{' '}
          <span className="font-medium text-slate-800">ASK_PREFERENCES</span> are detours that only fire when they are
          needed: when your resume spans multiple countries, or after two declined rounds.{' '}
          <span className="font-medium text-slate-800">ROADMAP</span> is not a dead end either. The session stays open
          for follow-up chat and roadmap adjustments until you decide to end it.
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

      {/* Evals Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-linear-to-br from-rose-600 to-orange-600 shadow-sm flex-shrink-0">
            <FlaskConical className="w-4 h-4 text-white" />
          </span>
          <span>How we test the coach</span>
        </h2>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          An AI coach can sound confident and still be wrong, so we do not just eyeball it and hope. Every time the
          prompts or the conversation logic change, an automated suite of checks runs against the real model. Some are
          plain code (no API calls needed), and some hand the output to a second model whose only job is to judge
          whether the first one actually did the right thing. Here is what that suite actually watches for.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evalChecks.map((check, idx) => {
            const Icon = check.icon;
            return (
              <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <h3 className="font-semibold text-slate-800 text-sm">{check.title}</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{check.desc}</p>
              </div>
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
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">The right model for each job</h3>
            <p className="text-xs leading-relaxed">
              Structured extraction (reading your resume, tracking signals) runs on a smaller, cheaper model, since that
              is closer to classification than open-ended writing. Conversation, path generation, and roadmap planning
              run on a stronger model, because you read those directly and they need real reasoning.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">Feels instant, even mid-thought</h3>
            <p className="text-xs leading-relaxed">
              The moment you send a message, the coach&apos;s reply bubble appears right away with a thinking animation
              inside it, never a separate floating spinner. Free-flowing chat replies stream in token by token. Turns
              that come with quick-pick buttons are generated as one structured response and revealed at a fast, steady
              pace, so they still feel like they are being typed live.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">It remembers what matters, not everything</h3>
            <p className="text-xs leading-relaxed">
              The durable facts about you (your profile, everything gathered so far) get folded directly into every
              prompt. Old chat turns get trimmed out of what is sent to the model instead of resending the whole
              history every single time.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">Work happens in parallel where it can</h3>
            <p className="text-xs leading-relaxed">
              Locking in a path kicks off your tailored closing note and your full execution roadmap at the same time,
              instead of waiting for one to finish before starting the other.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">One quick-pick pattern, used everywhere</h3>
            <p className="text-xs leading-relaxed">
              Wherever the coach asks something with a real, answerable set of options, single choice or multi-select,
              it offers quick-pick buttons generated fresh for that exact question, always with a way to type your own
              answer instead. Picking one posts it as a normal chat message and the buttons disappear right away, so it
              always reads like a real reply, never a form. If a question genuinely needs your own specific details, it
              stays free text on purpose.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-1 text-sm">Difficulty tiers carry through to the plan</h3>
            <p className="text-xs leading-relaxed">
              Conservative, Realistic, and Ambitious are not just labels on a path card. The roadmap you get for a
              chosen path actually targets that tier&apos;s timeline, and if your own stated time budget makes that
              unrealistic, the coach says so honestly instead of quietly stretching the plan without telling you.
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
