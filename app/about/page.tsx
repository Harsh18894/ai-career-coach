'use client';

import React from 'react';
import {
  Shield,
  BookOpen,
  Compass,
  ArrowRight,
  FileInput,
  FileSearch,
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
import { BackLink } from '@/components/shell/BackLink';

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

  const reviewPersonas = [
    {
      persona: 'Student',
      who: 'Studying, or graduated within the last year, with no full-time job yet',
      bar: 'Are the sections that matter actually there, and is there any evidence of what you can do? A bullet without a number is barely worth mentioning at this stage — nobody expects one yet.',
    },
    {
      persona: 'Early career',
      who: '0–2 years in your first full-time role',
      bar: 'You have real work to point at now. The bar is moving from describing duties to describing what changed because you were there.',
    },
    {
      persona: 'Mid level',
      who: '2–6 years',
      bar: 'Critical. A bullet with no outcome at all is the single most common reason a mid-level resume reads as junior, so here it counts as serious.',
    },
    {
      persona: 'Senior',
      who: '6+ years',
      bar: 'Hardest. Beyond the lines themselves, the roles have to add up to one story with visible growth in scope. A senior resume that is merely tidy is not a good senior resume, and it gets told so.',
    },
  ];

  const reviewRefusals = [
    'No score out of 100. A single number implies a precision this cannot honestly offer.',
    'No ranking against other candidates. It has never seen another candidate.',
    'No prediction of whether you will get the job. That depends on the team, the other applicants, and the interview — none of which it can see.',
    'No rewriting your whole resume in its own voice. You get targeted edits you can accept or reject, line by line.',
    'On the against-a-job path, no verdict on whether you are a good fit. It reports which requirements your resume already evidences, which is a different and much smaller claim.',
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

  /* One accent, used positionally.
   *
   * This was seven hues — sky, indigo, violet, fuchsia, pink, emerald, slate — one per stage,
   * which made the diagram read as a colour key the reader had to decode. The palette now has
   * a single accent, so the stages are distinguished by their labels and their order (which is
   * the actual information) and orange marks only the stage a session is genuinely centred on.
   * The stage names remain the sole carrier of meaning, so nothing depends on colour. */
  const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    sky: { bg: 'bg-paper', border: 'border-border-soft', text: 'text-ink-muted' },
    indigo: { bg: 'bg-hachi/8', border: 'border-hachi/30', text: 'text-hachi' },
    violet: { bg: 'bg-paper', border: 'border-border-soft', text: 'text-ink-muted' },
    fuchsia: { bg: 'bg-hachi/8', border: 'border-hachi/30', text: 'text-hachi' },
    pink: { bg: 'bg-paper', border: 'border-border-soft', text: 'text-ink-muted' },
    emerald: { bg: 'bg-hachi/8', border: 'border-hachi/30', text: 'text-hachi' },
    slate: { bg: 'bg-paper', border: 'border-border-soft', text: 'text-ink-muted' },
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
      <BackLink />

      {/* Intro */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          <span className="text-hachi">
            How this works?
          </span>
        </h1>
        <p className="text-ink-muted max-w-2xl mx-auto text-base leading-relaxed">
          A look behind the curtain at Hachi, your AI career mentor: how it turns a resume (or a short chat) into a real
          profile, figures out where you actually want to go, proposes three ranked paths you can trust, and builds a
          concrete roadmap once you pick one.
        </p>
      </div>

      {/* Entry points */}
      <section className="bg-white border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-ink flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-ink shadow-sm flex-shrink-0">
            <FileInput className="w-4 h-4 text-white" />
          </span>
          <span>How to get started</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entryPoints.map((ep, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-paper border border-border-soft">
              <h3 className="font-semibold text-ink text-sm mb-1">{ep.title}</h3>
              <p className="text-xs text-ink-muted leading-relaxed">{ep.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Assumptions Section */}
      <section className="bg-white border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-ink flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-ink shadow-sm flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </span>
          <span>Core assumptions we make</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-ink-muted">
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-paper border border-border-soft">
              <h3 className="font-semibold text-ink mb-1">Your resume needs a text layer</h3>
              <p className="text-xs leading-relaxed">
                We assume an uploaded resume has real, selectable text in it. A scanned image with no text layer cannot be
                read. Use the no-resume guided chat instead if that happens to you.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-paper border border-border-soft">
              <h3 className="font-semibold text-ink mb-1">Salary ranges are estimates</h3>
              <p className="text-xs leading-relaxed">
                Salary numbers are indicative, estimated by the model from your seniority, region, and industry. We are not
                pulling live numbers from a labor market database in this demo.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-paper border border-border-soft">
              <h3 className="font-semibold text-ink mb-1">No recommendation without real direction</h3>
              <p className="text-xs leading-relaxed">
                Two hard checks sit in front of every recommendation: at least one real skill or domain, and a genuine
                stated sense of direction, not just a bare yes. We never trust the model&apos;s own read of the
                conversation alone for this.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-paper border border-border-soft">
              <h3 className="font-semibold text-ink mb-1">Your session stays on your device</h3>
              <p className="text-xs leading-relaxed">
                To keep this demo simple, your conversation lives in your browser&apos;s{' '}
                <code className="px-1 py-0.5 bg-border-soft/70 rounded text-[11px]">localStorage</code>. There is no
                account, no login, and no external database. Refresh the page and you pick up right where you left off
                on that device.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-paper border border-border-soft">
              <h3 className="font-semibold text-ink mb-1">Persona inference</h3>
              <p className="text-xs leading-relaxed">
                The model places your situation into one of three reference archetypes (pivoting, growing in place, or
                early career) and an experience band, which quietly shapes the coach&apos;s tone, questions, and how it
                frames each path.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-paper border border-border-soft">
              <h3 className="font-semibold text-ink mb-1">Adaptive, not scripted</h3>
              <p className="text-xs leading-relaxed">
                Both the understanding chat and the no-resume questions are generated turn by turn from everything said
                so far. There is no fixed script, so nothing you have already answered gets asked again.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="bg-white border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-ink flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl shadow-sm flex-shrink-0">
            <BookOpen className="w-4 h-4 text-white" />
          </span>
          <span>How a session unfolds</span>
        </h2>
        <div className="space-y-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-4 border-l-2 border-border-soft pl-4 py-1">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow Section */}
      <section className="bg-white border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-ink flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-ink shadow-sm flex-shrink-0">
            <Compass className="w-4 h-4 text-white" />
          </span>
          <span>Conversation state machine</span>
        </h2>
        <p className="text-sm text-ink-muted mb-8 leading-relaxed">
          The coach always knows exactly what stage it is in, instead of guessing intent from raw chat text. Most sessions
          move left to right below, but <span className="font-medium text-ink">ASK_COUNTRY</span> and{' '}
          <span className="font-medium text-ink">ASK_PREFERENCES</span> are detours that only fire when they are
          needed: when your resume spans multiple countries, or after two declined rounds.{' '}
          <span className="font-medium text-ink">ROADMAP</span> is not a dead end either. The session stays open
          for follow-up chat and roadmap adjustments until you decide to end it.
        </p>

        {/* Visual State flow chart */}
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-2 max-w-3xl mx-auto p-6 rounded-2xl border border-border-soft">
          {stateFlow.map((s, idx) => {
            const c = colorClasses[s.color];
            return (
              <React.Fragment key={s.stage}>
                <div
                  className={`flex flex-col items-center p-3.5 ${c.bg} rounded-xl shadow-sm border ${c.border} w-[140px] text-center`}
                >
                  <span className={`text-[10px] font-semibold tracking-wide uppercase ${c.text}`}>Stage {idx + 1}</span>
                  <span className="text-xs font-bold text-ink mt-1">{s.label}</span>
                  <span className="text-[10px] text-ink-muted mt-0.5">{s.sub}</span>
                </div>
                {idx < stateFlow.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-ink-muted/50 flex-shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {/* Evals Section */}
      <section className="bg-white border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-ink flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-ink shadow-sm flex-shrink-0">
            <FlaskConical className="w-4 h-4 text-white" />
          </span>
          <span>How we test the coach</span>
        </h2>
        <p className="text-sm text-ink-muted mb-6 leading-relaxed">
          An AI coach can sound confident and still be wrong, so we do not just eyeball it and hope. Every time the
          prompts or the conversation logic change, an automated suite of checks runs against the real model. Some are
          plain code (no API calls needed), and some hand the output to a second model whose only job is to judge
          whether the first one actually did the right thing. Here is what that suite actually watches for.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evalChecks.map((check, idx) => {
            const Icon = check.icon;
            return (
              <div key={idx} className="p-4 rounded-xl bg-paper border border-border-soft">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <h3 className="font-semibold text-ink text-sm">{check.title}</h3>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{check.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Under the hood */}
      {/* Resume review */}
      <section className="bg-white border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-ink flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-ink shadow-sm flex-shrink-0">
            <FileSearch className="w-4 h-4 text-white" />
          </span>
          <span>The resume review, and why it works this way</span>
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-6">
          Separate from the coaching conversation, and deliberately so: being coached toward a direction and having a
          document marked up are different jobs. You can do either without the other.
        </p>

        <h3 className="font-semibold text-ink text-sm mb-3">Two ways to be reviewed</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h4 className="font-semibold text-ink text-sm mb-1">On its own merits</h4>
            <p className="text-xs text-ink-muted leading-relaxed">
              No job attached. The question is whether this resume is doing its job for someone at your stage — which
              means the standard it is held to changes depending on who you are.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h4 className="font-semibold text-ink text-sm mb-1">Against one specific job</h4>
            <p className="text-xs text-ink-muted leading-relaxed">
              Paste the description or give a link. It reads your resume the way a recruiter would in the ten or fifteen
              seconds they actually spend, then walks the job&apos;s stated requirements one by one. Pasting always
              works; links often will not, because most large job sites block automated reading.
            </p>
          </div>
        </div>

        <h3 className="font-semibold text-ink text-sm mb-1">The bar moves with your experience</h3>
        <p className="text-xs text-ink-muted leading-relaxed mb-4">
          The same bullet can be fine for one person and a serious problem for another. A student writing &ldquo;helped
          maintain the reporting pipeline&rdquo; is doing about what anyone expects; someone eight years in writing the
          same sentence has failed to say what they actually did. So the review works out roughly where you are first,
          and judges everything against that. A harsher bar means <em>more things count</em>, never that the writing
          gets meaner.
        </p>
        <div className="space-y-2 mb-4">
          {reviewPersonas.map((row) => (
            <div key={row.persona} className="p-4 rounded-xl bg-paper border border-border-soft">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                <h4 className="font-semibold text-ink text-sm">{row.persona}</h4>
                <span className="text-xs text-ink-muted">{row.who}</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">{row.bar}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-muted leading-relaxed mb-8">
          It shows you which one it picked and why, and you can change it in one click — the review re-runs at the new
          bar. Getting this wrong is the worst thing it could do: telling an experienced engineer to go find an
          internship would be both wrong and insulting, so it is never decided silently. If the call is close, it says
          so and asks you to confirm before you read anything. Someone changing career gets treated as two things at
          once: judged on writing and structure at the level their years earn, but on domain evidence against the field
          they are moving into.
        </p>

        <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 mb-8">
          <h3 className="font-semibold text-amber-900 text-sm mb-1 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            It will not invent a number for you
          </h3>
          <p className="text-xs text-amber-900 leading-relaxed">
            This is the rule everything else bends around. It would be trivial to turn &ldquo;worked on the billing
            service&rdquo; into &ldquo;drove a 40% reduction in billing latency&rdquo; — it reads better, and it is a
            lie you would have to defend in an interview you would then fail. So where a line needs a number you have
            not given, you get a blank instead:{' '}
            <span className="font-mono bg-amber-100 px-1 rounded-sm ring-1 ring-amber-300">[X%]</span>, for you to fill
            in with something true.
          </p>
          <p className="text-xs text-amber-900 leading-relaxed mt-2">
            And this is not left to the model&apos;s good intentions. Every suggested rewrite is checked in code before
            you see it: any number that is not already in your own words, and not inside a blank, means the whole
            suggestion is thrown away rather than shown to you. The same check runs automatically against a set of test
            resumes every time the project is built, so it cannot quietly stop working.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h4 className="font-semibold text-ink text-sm mb-1">Where the links come from</h4>
            <p className="text-xs text-ink-muted leading-relaxed">
              If you are a student, the review suggests places to look for internships. Those links are not written by
              the model — it chooses from a short list kept in the code, and the actual web address is looked up
              afterwards. A model asked for a URL will happily produce one that has never existed, and the one thing
              worse than no suggestion is a dead link presented confidently. The list is also filtered to your region,
              because pointing someone in Ohio at an India-only jobs board wastes their afternoon.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h4 className="font-semibold text-ink text-sm mb-1">A good resume is allowed to come back quiet</h4>
            <p className="text-xs text-ink-muted leading-relaxed">
              If there is nothing serious wrong, it says so and stops. A tool that always finds ten problems is not
              being thorough, it is being decorative — and after the second invented complaint you would stop believing
              any of them.
            </p>
          </div>
        </div>

        <h3 className="font-semibold text-ink text-sm mb-3 flex items-center gap-2">
          <MessageSquareOff className="w-4 h-4 text-ink-muted flex-shrink-0" />
          What it deliberately will not do
        </h3>
        <ul className="space-y-2">
          {reviewRefusals.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-xs text-ink-muted leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border border-border-soft rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-ink flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-ink shadow-sm flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </span>
          <span>Under the hood</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-ink-muted">
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h3 className="font-semibold text-ink mb-1 text-sm">The right model for each job</h3>
            <p className="text-xs leading-relaxed">
              Structured extraction (reading your resume, tracking signals) runs on a smaller, cheaper model, since that
              is closer to classification than open-ended writing. Conversation, path generation, and roadmap planning
              run on a stronger model, because you read those directly and they need real reasoning.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h3 className="font-semibold text-ink mb-1 text-sm">Feels instant, even mid-thought</h3>
            <p className="text-xs leading-relaxed">
              The moment you send a message, the coach&apos;s reply bubble appears right away with a thinking animation
              inside it, never a separate floating spinner. Free-flowing chat replies stream in token by token. Turns
              that come with quick-pick buttons are generated as one structured response and revealed at a fast, steady
              pace, so they still feel like they are being typed live.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h3 className="font-semibold text-ink mb-1 text-sm">It remembers what matters, not everything</h3>
            <p className="text-xs leading-relaxed">
              The durable facts about you (your profile, everything gathered so far) get folded directly into every
              prompt. Old chat turns get trimmed out of what is sent to the model instead of resending the whole
              history every single time.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h3 className="font-semibold text-ink mb-1 text-sm">Work happens in parallel where it can</h3>
            <p className="text-xs leading-relaxed">
              Locking in a path kicks off your tailored closing note and your full execution roadmap at the same time,
              instead of waiting for one to finish before starting the other.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h3 className="font-semibold text-ink mb-1 text-sm">One quick-pick pattern, used everywhere</h3>
            <p className="text-xs leading-relaxed">
              Wherever the coach asks something with a real, answerable set of options, single choice or multi-select,
              it offers quick-pick buttons generated fresh for that exact question, always with a way to type your own
              answer instead. Picking one posts it as a normal chat message and the buttons disappear right away, so it
              always reads like a real reply, never a form. If a question genuinely needs your own specific details, it
              stays free text on purpose.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-paper border border-border-soft">
            <h3 className="font-semibold text-ink mb-1 text-sm">Difficulty tiers carry through to the plan</h3>
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
          className="inline-flex items-center gap-2 px-6 py-3 bg-hachi hover:opacity-90 text-white rounded-xl font-semibold shadow-sm hover:shadow-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2"
        >
          <span>Return to chat with Hachi</span>
        </Link>
      </div>
    </div>
  );
}
