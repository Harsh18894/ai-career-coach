import OpenAI from 'openai';
import { z } from 'zod';
import { Profile, ProfileSchema, CareerPath, PathDeckSchema, Roadmap, RoadmapSchema, AdaptiveQuestion, AdaptiveQuestionSchema } from './schemas';
import { ChatMessage, UserSignals } from '../state/conversation';
import { TIER_TIMELINE } from './tiers';

const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not defined.');
  }
  return new OpenAI({ apiKey });
};

export const MENTOR_SYSTEM_PROMPT = `Your name is Aria. You are a sharp, experienced career mentor and career advisor — direct, warm, and economical with words.
You speak like a senior operator who has seen thousands of careers, not like a chatbot or a recruiter. 
You ask one good question at a time and react to what the person actually said. You never sound like a form. 
You never give a recommendation without tying it to a specific fact about this person. 
You are honest about gaps and tensions. Keep messages short (2–5 sentences) unless presenting structured recommendations.

Hard tone rules, no exceptions:
1. Write the way a sharp human mentor talks out loud. Never output raw data structures, 
JSON, code-style identifiers, or snake_case/category labels in your prose 
(e.g. never write "stay_in_current_company" — say "staying at your current company" instead). If you need to reference internal data, 
translate it into a full natural-language phrase first.

2. Vary sentence rhythm and openings turn to turn — do not reuse the same template ("Got it.", "Nice.", "Pattern:") every single message.

3. Sound like you actually noticed what they said, not like you are filling a slot.

4. Never assert seniority, job titles, tenure, or "years in the field" that the candidate's actual profile does not support.
Match your framing to where they really are in their career.
If they are a student or new grad, do not treat them like they're already in a field — they are exploring and figuring it out.

5. Never present a forced multiple-choice menu as your question (e.g. "do you want that as a headline or as a bullet?").
Ask one natural, open question instead — if you genuinely need to offer options, fold them into a real sentence, not a form-style either/or.

6. HARD BOUNDARY, no exceptions: you ONLY do career coaching — profile-building, direction-finding, path recommendations, roadmap planning. If the candidate asks you to discuss or help with anything else (movies, books, music, general life advice, relationships, coding help unrelated to their stated path, or any other off-topic request), do NOT answer it, not even briefly, not even as a "quick aside" before redirecting, and do not ask follow-up/clarifying questions about it either. This applies no matter how many times they ask, insist, or rephrase it. State plainly and kindly that you only help with career coaching, nothing else.`;

/* =====================================================================================
 * Derived helpers (no model call) — pure functions that compute coach behavior parameters
 * (journey stage, target market, readiness gates) from the candidate's profile/signals.
 * ===================================================================================== */

export type ExperienceBand = 'fresh' | 'early' | 'building' | 'experienced' | 'senior';

export function deriveExperienceBand(
  yearsExperience: number,
  persona?: Profile['inferredPersona']
): ExperienceBand {
  if (persona === 'early_career' || yearsExperience < 1) return 'fresh'; // students / new grads / internship seekers
  if (yearsExperience <= 2) return 'early';        // 0-2 yrs, relatively fresh in industry
  if (yearsExperience < 4) return 'building';      // ~3 yrs, forming specialization
  if (yearsExperience <= 6) return 'experienced';  // 4-6 yrs, solid IC / new manager
  return 'senior';                                 // 7+ yrs
}

export function journeyGuidance(band: ExperienceBand): string {
  switch (band) {
    case 'fresh':
      return `This person is a student / recent graduate / internship-or-first-job seeker with essentially no professional track record. 
      Do NOT ask about job titles, "title vs impact" gaps, tenure, or "what field are you already in" — they are not in a field yet. 
      Focus on: what they studied, what kind of work energizes them, what they can build or learn, and anchoring on ONE concrete domain plus one skill. 
      Frame recommendations as first roles, internships, or entry tracks, not lateral moves.`;
    case 'early':
      return `This person is 1-2 years in — early and still forming a direction. 
      Ask what they like and dislike in their current work, what they want more of, and whether they want to go deeper or switch tracks. 
      Avoid senior-leadership framing.`;
    case 'building':
      return `This person is roughly 3 years in — past the entry stage and building specialization. 
      Ask about the specialization they're forming, the ownership they want, and the gap to the next level.`;
    case 'experienced':
      return `This person is 4-6 years in — a solid IC or new manager. 
      The relevant tensions are title-vs-impact gaps, plateaus, scope, and the IC-vs-management fork. 
      Treat them as a peer; skip basic onboarding questions.`;
    case 'senior':
      return `This person is 7 or more years in — senior. Focus on scope, leadership, strategic ownership, and whether their next move is up, across, or out.
      Do not ask entry-level questions.`;
  }
}

// Default realistic weekly time budget for roadmap pacing, by experience band. Students/new
// grads with no full-time job competing for their time can credibly commit more hours/week
// than working professionals — this drives how many weeks a given amount of content takes
// (see generateRoadmap), rather than letting every roadmap converge on the same "2-3 months".
export function deriveWeeklyHoursCommitment(band: ExperienceBand): string {
  return band === 'fresh' ? '8-10 hours/week' : '4-6 hours/week';
}

// Resolves which job market to calibrate salaries/roles to.
export type MarketResolution = { country: string; needsCountryConfirmation: boolean };

export function resolveMarket(profile: Profile | null, signals: UserSignals): MarketResolution {
  // 1. A country the user explicitly stated/confirmed always wins.
  if (signals.country) return { country: signals.country, needsCountryConfirmation: false };

  const distinct = Array.from(
    new Set((profile?.countriesDetected ?? []).map(c => c.trim()).filter(Boolean))
  );

  // 2. Resume references more than one country -> must ask before recommending.
  if (distinct.length > 1) return { country: 'India', needsCountryConfirmation: true };

  // 3. Exactly one country in the resume -> use it.
  if (distinct.length === 1) return { country: distinct[0], needsCountryConfirmation: false };

  // 4. A single best-guess country field on the profile.
  if (profile?.country) return { country: profile.country, needsCountryConfirmation: false };

  // 5. Default: India / Indian market.
  return { country: 'India', needsCountryConfirmation: false };
}

// Never recommend without at least one concrete skill OR domain to anchor on.
export function hasSkillOrDomain(profile: Profile | null, signals: UserSignals): boolean {
  const fromProfile = ((profile?.skills?.length ?? 0) + (profile?.domains?.length ?? 0)) > 0;
  const fromSignals = ((signals.knownSkills?.length ?? 0) + (signals.knownDomains?.length ?? 0)) > 0;
  return fromProfile || fromSignals;
}

// We must also never recommend on a skill/domain alone — a skill/domain says WHAT they can do,
// not HOW they want to progress (grow in place vs switch roles/companies, what they're
// optimizing for, or a real constraint). Without this, decks end up generic or premature even
// when readyForRecommendation gets set true by a model call that drifted off-topic mid-chat.
export function hasDirectionSignal(signals: UserSignals): boolean {
  return ((signals.motivations?.length ?? 0) + (signals.constraints?.length ?? 0)) > 0;
}

// The single gate the orchestration should call before generating any deck. Deliberately not
// just `signals.readyForRecommendation` — that's a single LLM self-assessment and can drift
// (e.g. agreeing to recommend after an off-topic tangent). hasSkillOrDomain/hasDirectionSignal
// are hard, non-LLM-dependent backstops on top of it.
export function canRecommend(profile: Profile | null, signals: UserSignals): boolean {
  return (
    Boolean(signals.readyForRecommendation) &&
    hasSkillOrDomain(profile, signals) &&
    hasDirectionSignal(signals)
  );
}

/* =====================================================================================
 * Profile extraction
 * ===================================================================================== */

/**
 * Extracts a structured Profile from the raw resume text.
 * Returns null if the text does not contain enough real career information.
 */
export async function extractProfile(resumeText: string): Promise<Profile | null> {
  const openai = getOpenAIClient();

  const prompt = `You are a professional resume analyst. Parse the following raw resume text and extract a structured career profile.
Be honest, realistic, and insightful. Identify the notable transitions and tension points (e.g. title-vs-impact gaps, career plateaus, or missing credentials).

First, decide "hasSufficientInfo": output false ONLY if the text contains no real, identifiable career information 
(e.g. it is gibberish, an unrelated document like an article or recipe, or far too sparse to extract a meaningful job history/skills from). 
If it has at least some genuine resume content, even if thin, output true.

Output a single JSON object with EXACTLY these fields (no extra fields, no nesting under another key):
- "hasSufficientInfo": boolean, required (see above). If false, you may leave the remaining fields as empty defaults — they will be ignored.
- "name": string, optional. The candidate's name if present.
- "yearsExperience": number, required. Total years of professional experience (estimate from role durations). 
  Use 0 for students / new graduates with no professional roles.
- "currentRole": string, optional. Their most recent/current job title. Use student/graduate title if they have no professional roles.
- "currentLevel": required, one of "IC" | "senior_IC" | "manager" | "unknown".
- "roleHistory": required array of objects, one per role, each with: "title" (string, required), "company" (string, optional), "durationMonths" (number, optional). 
  Use null for students/graduates. If no roles can be inferred, output an empty array.
- "skills": required array of strings.
- "domains": required array of strings (industries/domains they've worked in or field in which they are studying, e.g. "fintech", "B2B SaaS", "electronics", "computer science").
- "region": string, optional. Their inferred city/region.
- "country": string, optional. Their single best-guess country, inferred from locations, addresses, phone country code, or education. 
  Output null if it cannot be determined or the resume spans multiple countries with no clear "home" one.
- "countriesDetected": required array of strings. 
  Every DISTINCT country that appears anywhere in the resume — role locations, education, address. 
  Empty array if none are present. Do not invent countries; only list ones actually evidenced in the text.
- "notableTransitions": required array of strings describing notable career transitions.
- "tensions": required array of strings describing tension points (e.g. title-vs-impact gaps, plateaus, missing credentials, missing skills, missing projects).
- "inferredPersona": required, one of "pivot" | "grow" | "early_career" | "unknown":
  - 'pivot': ~2 years in (SDR/analyst/etc), wants to switch tracks, wants ownership/strategic work.
  - 'grow': 3-6 years, solid IC or new manager, feels invisible, title lags impact, wants to level up.
  - 'early_career': <=1 year/new grad/student, overwhelmed by options, needs structured thinking.
  - 'unknown': doesn't fit the above.

If a required array has no items to report, output an empty array rather than omitting the field.

Resume Text:
"""
${resumeText}
"""`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [
      { role: 'system', content: 'You are a career profile parser. Output JSON matching the requested schema.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);

  if (parsed.hasSufficientInfo === false) {
    return null;
  }

  return ProfileSchema.parse(parsed);
}

/**
 * Builds a structured Profile from guided Q&A answers, used when a candidate has no resume.
 */
export async function buildProfileFromAnswers(
  answers: { question: string; answer: string }[]
): Promise<Profile> {
  const openai = getOpenAIClient();

  const transcript = answers
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n');

  const prompt = `You are a professional career analyst. A candidate without a resume answered a short series of guided questions about their current situation, 
  experience (only if the user is working or has worked previously), skills, and interests. Build a structured career profile from their answers.
Be honest, realistic, and insightful. Infer notable transitions and tension points where the answers suggest them 
— it is fine to leave these as empty arrays if nothing notable applies.

Q&A transcript:
"""
${transcript}
"""

Output a single JSON object with EXACTLY these fields (no extra fields, no nesting under another key):
- "name": string, optional. Omit if not mentioned.
- "yearsExperience": number, required. Estimate from their stated experience; use 0 if they are a student or complete beginner.
- "currentRole": string, optional. Their stated current role, focus, or field of study.
- "currentLevel": required, one of "IC" | "senior_IC" | "manager" | "unknown". Use "unknown" for students/beginners.
- "roleHistory": required array of objects, each with "title" (string, required), "company" (string, optional), "durationMonths" (number, optional). Single best-effort entry, or an empty array if nothing to infer generally in case of students/beginners.
- "skills": required array of strings, from their stated skills/tools.
- "domains": required array of strings, from their stated industry/field of interest.
- "region": string, optional. From their stated location, if mentioned.
- "country": string, optional. From their stated location/country if mentioned; otherwise null.
- "countriesDetected": required array of strings. Any countries they explicitly mentioned or mentioned in resume; empty array otherwise.
- "notableTransitions": required array of strings. Empty array if none apply.
- "tensions": required array of strings. Empty array if none apply.
- "inferredPersona": required, one of "pivot" | "grow" | "early_career" | "unknown":
  - 'pivot': has some experience but wants to switch tracks/industries entirely.
  - 'grow': has relevant experience and wants to advance in the same domain.
  - 'early_career': little to no experience (student, complete beginner), needs structured thinking.
  - 'unknown': doesn't clearly fit the above.

If a required array has no items to report, output an empty array rather than omitting the field.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: 'You are a career profile builder. Output JSON matching the requested schema.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return ProfileSchema.parse(parsed);
}

/**
 * Streams the NEXT guided-onboarding question for a candidate with no resume, given the Q&A
 * pairs so far. Turn-by-turn adaptive — unlike a fixed question script, this sees everything
 * already said and never re-asks or restates it (e.g. if skills were already named, it asks
 * how they've been applied, not for the skills again; if no professional role is evident, it
 * asks about projects/coursework built, not "years of experience"). Streamed (like
 * streamChatTurn) since it's read directly by the user, not parsed as structured data.
 */
export async function nextGuidedProfileQuestion(
  answersSoFar: { question: string; answer: string }[]
): Promise<AdaptiveQuestion> {
  const openai = getOpenAIClient();

  const transcript = answersSoFar
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n');

  const prompt = `A candidate without a resume is answering a short guided intake, one question at a time. Here is the Q&A so far:
"""
${transcript}
"""

FIRST, check the most recent answer: did the candidate try to redirect this conversation into something unrelated to building their career profile (e.g. asking for movie/book/music recommendations, general life advice, unrelated coding help, or any other off-topic request), instead of answering or engaging with the career question? If so:
- Set "offTopic": true.
- Set "message" to a short (1-2 sentence), firm-but-kind statement that you only help with career coaching and this session is now closing — do NOT answer, discuss, or ask any follow-up/clarifying question about the off-topic thing itself, even briefly.
- Set "options": null and "allowMultiple": false, and skip the rest of this prompt entirely.

Otherwise, set "offTopic": false and continue as below.

Ask exactly ONE short, natural next question that fills the most useful gap below. Never re-ask, restate, or thank them for anything already said above — read the transcript carefully first.

Checklist, in order of usefulness (skip any already covered):
1. Depth of experience: if no professional role is evident (student, complete beginner, between things), ask what they've actually BUILT or worked on — projects, coursework, personal work — in their stated area. Do NOT ask "years of experience" for someone with no professional role. If real professional experience is evident, asking about years/role depth is fine. This is a "name and describe specifics" question — per the options rule below, it must get "options": null.
2. Concrete practical application: if they named skills/tools/languages but not how they've actually used them, ask specifically about that (real frameworks, real projects, real depth) — never re-ask for the skills/tools themselves.
3. Narrower domain/field interest, only if their stated area is still broad and not already implied or answered.

Additionally, propose 2-5 short quick-reply options covering the most likely answers to your question, and set "allowMultiple":
- An option is only valid if picking it, alone, IS the complete answer — the coach must be able to act on it with no further detail from the candidate. If a reasonable reply still requires the candidate to type in specifics (a name, a number, a description of what they actually did), this question cannot be turned into a fixed set — omit "options" entirely (set it to null) and let them type freely. Do NOT offer vague categories or placeholders (e.g. "a personal project", "coursework", "a paid job") as if they were answers to a question that asked for specifics — that gives the coach no real information and is worse than no options at all.
- This means: a question asking the candidate to CLASSIFY or pick from genuinely enumerable, named things (tools/skills/languages, yes-or-no, mutually exclusive directions like "grow in place or switch?") is a good fit for options. A question asking them to NAME, DESCRIBE, or ELABORATE on something specific to their own history (e.g. "what have you built — name up to three things and what you did in each") is NOT — always omit options for these, regardless of how the question is phrased.
- If the question has mutually-exclusive answers, set "allowMultiple": false and write options as short, natural standalone statements.
- If several answers could reasonably apply together AND each is independently a complete, nameable answer (e.g. "which of these tools have you used?" with options like "Python", "Excel"), set "allowMultiple": true and write options as short NOUN-PHRASE fragments — NOT full sentences — since multiple picks get joined together into one message, and full sentences don't join naturally.

Output a single JSON object with EXACTLY these fields:
- "message": the question text itself — 1-2 short sentences, no preamble, no quotes, no labels like "Question:".
- "options": array of 2-5 short strings as described above, or null.
- "allowMultiple": boolean as described above (still required even when "options" is null — just set it false).
- "offTopic": boolean, as described above.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: MENTOR_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return AdaptiveQuestionSchema.parse(parsed);
}

/* =====================================================================================
 * Path generation
 * ===================================================================================== */

/**
 * Generates exactly 3 Career Paths, with salary calibrated to the resolved market.
 * `changeRequests` is optional — when set, it's because the candidate declined earlier
 * rounds and told us what they actually want, so it drives this new set as the primary input.
 */
export async function generatePaths(
  profile: Profile,
  signals: UserSignals,
  shownPaths: string[],
  rejectedDirections: string[],
  options?: { country?: string; changeRequests?: string }
): Promise<CareerPath[]> {
  const openai = getOpenAIClient();

  const country = options?.country ?? resolveMarket(profile, signals).country;
  const band = deriveExperienceBand(profile.yearsExperience, profile.inferredPersona);

  const prompt = `You are a sharp career mentor. Generate exactly 3 personalized career path recommendations for this candidate.

Candidate's parsed profile:
${JSON.stringify(profile, null, 2)}

Signals accumulated during the conversation so far:
${JSON.stringify(signals, null, 2)}

Journey stage (calibrate the TYPE of role accordingly):
${journeyGuidance(band)}

Target job market: ${country}. Calibrate every salary range to ${country} and quote it in that market's local currency (for India use INR / LPA, e.g. "₹8–12 LPA"; for the US use USD; etc.). Label ranges as indicative.

Hard constraints to follow:
1. Every recommendation's fitRationale MUST reference a specific fact from the candidate's profile (a company, duration, role transition, skill, or field) or a specific statement they made. Quote or paraphrase the source.
2. Respect the constraints (e.g. if they want to stay in their current company, recommend paths that grow in place; if they reject remote work, don't suggest fully remote roles).
3. Do NOT recommend paths that overlap with already-recommended ones. Already shown: ${JSON.stringify(shownPaths)}.
4. Avoid any directions the candidate has rejected: ${JSON.stringify(rejectedDirections)}.
${options?.changeRequests ? `5. The candidate declined the earlier rounds and asked specifically for these changes — treat them as the PRIMARY driver of this new set, not an afterthought: "${options.changeRequests}".` : ''}
6. Design each path card with:
   - title: Concrete, descriptive role title appropriate to their journey stage (for a fresh grad these are entry roles/internships, not senior moves).
   - fitRationale: Specific reasons why this fits them, citing facts.
   - salaryRange: Realistic, market-calibrated (see above).
   - upskills: 2 to 4 concrete, actionable gaps to close.
   - firstMove: A concrete "first move this month" step.
7. Calibrate ambition honestly via "ambitionCheck" on EVERY path — compare what the candidate is aiming for against what their profile supports:
   - "too_high": their target jumps further than their evidence supports. Set verdict "too_high" and in "note" say plainly they'll need more-than-average effort, with a concrete extended timeline and/or the realistic number of intermediate job-switches/promotions needed.
   - "too_low": their target undersells demonstrated capability. Set verdict "too_low", cite the specific evidence, and push the title/scope above what they asked for.
   - "aligned": target roughly matches evidence. Fill "note" with a one-sentence honest confirmation citing why.
   Never fabricate "aligned" just to be agreeable.
8. Assign each of the 3 paths a distinct "tier" — exactly one path per tier, all three tiers used once each. Base the tier on the ACTUAL size of THIS candidate's skill/experience gap for THIS specific path (not title prestige alone), standardized at a baseline of ~4-6 hours/week of effort regardless of the candidate's actual persona:
   - "conservative": the safest, most immediately attainable move — smallest gap from where they are today, achievable within 1-2 months at ~4-6 hours/week.
   - "realistic": the path they should actually aim for — a balanced stretch, achievable in 3-4 months at ~4-6 hours/week. This is usually your strongest, most-recommended path.
   - "ambitious": a high-reach path with real upside — bigger leap, could take 6-8 months at ~4-6 hours/week.
   If the candidate is a student/recent graduate with no professional track record (journey stage "fresh"), use these EXACT SAME three timeline bands — do NOT compress them just because a student might study more hours per week than a working professional. Breaking into the industry with no track record is inherently harder, which offsets any extra weekly hours available; the extra time should buy deeper preparation, not a shorter timeline.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: `${MENTOR_SYSTEM_PROMPT} Output exactly 3 career paths in a JSON array inside a "paths" key matching the requested schema.` },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  const validated = PathDeckSchema.parse(parsed);
  return validated.paths;
}

/* =====================================================================================
 * Chat turn streaming
 * ===================================================================================== */

/**
 * Discriminated turn intent — every `streamChatTurn` call passes exactly one of these so the
 * coach knows unambiguously which stage-specific instruction to use, instead of inferring it
 * from a combination of boolean flags.
 */
export type CoachTurn =
  | { kind: 'understanding' }
  | { kind: 'ask_country'; detectedCountries: string[] }
  | { kind: 'ask_preferences' }                       // after 2 declined decks, before a tailored 3rd
  | { kind: 'insufficient_info' }                      // candidate never gave anything usable — give-up decline
  | { kind: 'rejected_all_final' }                     // declined every deck, including the tailored one
  | { kind: 'path_locked'; chosenPath: CareerPath }    // closing after selection
  | { kind: 'roadmap_followup'; chosenPath: CareerPath; roadmap: Roadmap };

/** Wraps an OpenAI streaming completion into a chunked text Response. Shared by every
 * user-facing text generator that streams (currently streamChatTurn and
 * nextGuidedProfileQuestion) so the ReadableStream plumbing is written once. */
function toStreamingResponse(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
): Response {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}

/** Shared preamble (persona prompt, profile/signals context, journey stage, market) every
 * chat-turn system instruction starts with, regardless of which stage-specific rules follow. */
function buildBaseSystemInstruction(
  profile: Profile | null,
  signals: UserSignals,
  band: ExperienceBand,
  market: MarketResolution
): string {
  return `${MENTOR_SYSTEM_PROMPT}

Candidate profile context (raw data for YOUR reasoning only — never quote keys/values/formatting back; always translate to plain speech):
${profile ? JSON.stringify(profile) : 'No resume uploaded yet — you are building understanding purely from the conversation.'}

Current conversation signals:
${JSON.stringify(signals)}

Journey stage guidance for THIS candidate:
${journeyGuidance(band)}

Market: assume ${market.country} and its job-market / salary norms unless the candidate says otherwise.
`;
}

/**
 * The UNDERSTANDING-phase instruction body — scope-discipline rules, the known-facts recap,
 * the readiness gates (rules 4/5) — shared by both `streamChatTurn`'s 'understanding' case
 * (used once, for the transition into UNDERSTANDING, where the immediately-following options
 * are a static hardcoded panel) and `generateUnderstandingTurn` below (used for every turn
 * after that, where options are generated alongside the question itself). Factored out so this
 * sensitive prompt — h1-scope-discipline.eval.ts regression-tests rule 6 specifically — exists
 * in exactly one place instead of drifting between two copies.
 */
function buildUnderstandingInstruction(
  profile: Profile | null,
  signals: UserSignals,
  isFirstCoachMessage: boolean
): string {
  const knownDomains = [...(profile?.domains ?? []), ...(signals.knownDomains ?? [])].filter(Boolean);
  const knownSkills = [...(profile?.skills ?? []), ...(signals.knownSkills ?? [])].filter(Boolean);
  const years = profile ? profile.yearsExperience : null;

  return `
You are in the UNDERSTANDING phase. Keep messages short (2-5 sentences), ask exactly ONE sharp, natural question at a time, and react to what they just said. Your questions should never feel like a form. Be warm and kind.
${isFirstCoachMessage && !(profile?.name) ? `This is your first message and you do NOT know their name yet — greet warmly and ask their name in one short, natural clause before anything else.` : ''}
${profile?.name && isFirstCoachMessage ? `Address them by their first name ("${profile.name}") in this first message.` : ''}

What you ALREADY know — do NOT ask about any of these again, and do not contradict them:
- Years of experience: ${years === null ? 'still being established' : years}
- Field(s)/domain(s) already stated: ${knownDomains.length ? knownDomains.join(', ') : 'none yet'}
- Skill(s) already stated: ${knownSkills.length ? knownSkills.join(', ') : 'none yet'}
- Motivations: ${signals.motivations?.join(', ') || 'none yet'} | Constraints: ${signals.constraints?.join(', ') || 'none yet'}

Rules:
1. If a domain/field was already given${knownDomains[0] ? ` (e.g. "${knownDomains[0]}")` : ''},
do NOT ask which field interests them — build on it (go deeper, or ask about specific skills/roles within it).
2. If they have 0 / no experience, NEVER ask "what field are you already in" or anything that assumes a current job.
If they are studying or a new grad, then domain/field would be the area they are studying or want to enter.
Treat them as a fresh entrant exploring options.
3. Tailor every question to their journey stage above.
4. You may NOT move toward recommendations until you have at least ONE concrete skill OR domain from them. If you still don't have one, this turn's question must be aimed at getting it.
5. You may ALSO NOT move toward recommendations until you know something about HOW they want to progress — e.g. grow in place vs switch roles/companies, what they're optimizing for (comp, ownership, learning, stability, flexibility), or a real constraint. A skill/domain alone is not direction. If this is still missing (see Motivations/Constraints above), this turn's question must be aimed at surfacing it — that takes priority over everything except rule 4.
6. You are a career-direction coach in this phase — not a resume-writing/formatting/document-drafting assistant, and not a data-collection form. If the candidate asks you to do something else — pull/write a resume bullet, draft a headline, rewrite a line, reformat something, or hands the question back to you ("fetch it from my resume", "you tell me") — do not perform that task, AND do not ask them to paste/upload/supply raw text as a substitute either (that is still outsourcing the thinking, just in a different shape). Acknowledge briefly in passing (a short clause, never the point of the message), then re-ask your real question in plain spoken terms they can answer from memory — rephrase it simpler if it helps — or move to whichever of rules 4/5 is still open. The point of every turn is a real answer about THEM, never a document exchange.
7. If they're vague / evasive / one-word, do not let it slide — ask a sharper, more concrete follow-up. Don't move on with nothing.
8. If they contradict themselves, name it kindly and directly, and ask which is the real driver.
9. If they say "nothing bothers me" or they're happy, pivot to what they want MORE of, or what the next level looks like.
10. Make it feel like a coffee chat with a senior career mentor, not a scripted intake form.`;
}

/**
 * Streams a chat turn from the coach. Always pass the explicit `turn` intent so the
 * coach knows which stage it's in. Profile/signals/journey/market are folded into the
 * system instruction so every turn is stage- and persona-aware.
 */
export async function streamChatTurn(
  chatHistory: ChatMessage[],
  profile: Profile | null,
  signals: UserSignals,
  turn: CoachTurn
): Promise<Response> {
  const openai = getOpenAIClient();

  const band = deriveExperienceBand(profile?.yearsExperience ?? 0, profile?.inferredPersona);
  const market = resolveMarket(profile, signals);
  const isFirstCoachMessage = chatHistory.filter(m => m.role === 'assistant').length === 0;

  let systemInstruction = buildBaseSystemInstruction(profile, signals, band, market);

  switch (turn.kind) {
    case 'understanding':
      systemInstruction += buildUnderstandingInstruction(profile, signals, isFirstCoachMessage);
      break;

    case 'ask_country':
      systemInstruction += `
The resume references more than one country (${turn.detectedCountries.join(', ')}), so you don't yet know which job market to calibrate salaries and roles to.
Ask, in ONE warm, natural sentence, which country / market they're targeting for this move. Do not recommend anything yet and do not ask anything else.`;
      break;

    case 'ask_preferences':
      systemInstruction += `
The candidate has now declined TWO full sets of recommendations. Don't just reshuffle again.
In one or two sentences, acknowledge that the first two rounds missed, then ask them directly what they'd change — what kind of role, domain, or direction they actually want, or what specifically felt off. Ask ONE focused question. Do not present any paths in this message.`;
      break;

    case 'insufficient_info':
      systemInstruction += `
Across this entire conversation the candidate has still given nothing real to work with 
— no concrete skill, domain, or direction, only vague, evasive, or non-answers.
You will NOT invent a recommendation. Write a short, kind-but-direct closing that:
1. Is honest and a touch wry about having nothing concrete to go on — never mean.
2. States plainly that you can't responsibly recommend paths without at least one real skill, domain, or goal, and that you won't fake it.
3. Invites them to come back once they've jotted down their role, experience, skills, and goals.
Keep it to 3-4 sentences, end warm. Ask no further questions — this ends the session.`;
      break;

    case 'path_locked':
      systemInstruction += `
The candidate selected this path: "${turn.chosenPath.title}".
Write a tailored closing: reflect their choice back with encouragement, 
restate the 1-2 highest-leverage next moves in your own natural words 
(their upskills: ${JSON.stringify(turn.chosenPath.upskills)}; first move: ${turn.chosenPath.firstMove ?? 'n/a'}), 
and end on one decisive mentor line. No questions. 3-5 sentences.`;
      break;

    case 'roadmap_followup':
      systemInstruction += `
The candidate locked in "${turn.chosenPath.title}" and is reviewing their roadmap (skill level: ${turn.roadmap.skillLevel}, ${turn.roadmap.totalDuration}). 
The session is OPEN — this is NOT a closing message.
1. Respond naturally to whatever they said.
2. If they want a roadmap change (pace, focus, swapping a topic), acknowledge it and point them to the "Adjust roadmap" control — 
you are not regenerating the structured roadmap in this reply.
3. Keep it to 2-4 sentences, warm, senior. Do not re-ask onboarding questions.`;
      break;

    case 'rejected_all_final':
      systemInstruction += `
The candidate has declined every set of recommendations, INCLUDING the round tailored to the specific changes they asked for.
Write the final closing: honestly name the pattern across their rejections in your own plain words (never repeat the raw rejected-direction strings verbatim), offer one grounded direction for them to sit with, and close warmly but decisively. No questions. This ends the session. 3-5 sentences.`;
      break;
  }

  // Cap the history sent to the model — token cost grows with conversation length, and the
  // durable facts (profile, signals) are already distilled into the system instruction above,
  // so very old turns add cost without adding information. Always keep the first couple of
  // messages (the personalized opener) for continuity, plus the most recent window.
  const HISTORY_WINDOW = 16;
  const boundedHistory =
    chatHistory.length > HISTORY_WINDOW
      ? [...chatHistory.slice(0, 2), ...chatHistory.slice(-(HISTORY_WINDOW - 2))]
      : chatHistory;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemInstruction },
    ...boundedHistory.map(msg => ({
      role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: msg.content
    }))
  ];

  const stream = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages,
    stream: true,
  });

  return toStreamingResponse(stream);
}

/**
 * Ongoing UNDERSTANDING-phase turn (every reply after the candidate's first), returned as
 * structured data instead of a stream — alongside the question text, the model proposes
 * quick-reply options so the candidate can tap an answer instead of typing one out every turn.
 * Deliberately NOT used for the very first UNDERSTANDING message (the profile-build/resume-opener
 * transition) — that one is immediately followed by a static, hardcoded direction-options panel,
 * not model-generated options, so it stays on the plain-streaming `streamChatTurn` path above.
 */
export async function generateUnderstandingTurn(
  chatHistory: ChatMessage[],
  profile: Profile | null,
  signals: UserSignals
): Promise<AdaptiveQuestion> {
  const openai = getOpenAIClient();

  const band = deriveExperienceBand(profile?.yearsExperience ?? 0, profile?.inferredPersona);
  const market = resolveMarket(profile, signals);
  // Always false here: by definition this function is only ever called for turns AFTER the
  // first coach message, so the "is this your first message, greet + ask their name" framing
  // inside buildUnderstandingInstruction never applies.
  const systemInstruction = buildBaseSystemInstruction(profile, signals, band, market)
    + buildUnderstandingInstruction(profile, signals, false)
    + `

FIRST, check the candidate's most recent message: did they try to redirect this conversation into something unrelated to their career entirely (e.g. asking for movie/book/music recommendations, general life advice, unrelated coding help, or any other off-topic request) — this is a stronger, more absolute case than rule 6 above (which covers them deflecting into a resume-formatting task while still nominally talking about their career). If so:
- Set "offTopic": true.
- Set "message" to a short (1-2 sentence), firm-but-kind statement that you only help with career coaching and this session is now closing — do NOT answer, discuss, or ask any follow-up/clarifying question about the off-topic thing itself, even briefly.
- Set "options": null and "allowMultiple": false, and skip the rest of this section entirely.

Otherwise, set "offTopic": false and continue as below — additionally, propose 2-5 short quick-reply options covering the most likely answers to the question you just asked, and set "allowMultiple":
- An option is only valid if picking it, alone, IS the complete answer — the coach must be able to act on it with no further detail from the candidate. If a reasonable reply still requires the candidate to type in specifics (a name, a number, a description of what they actually did or want), this question cannot be turned into a fixed set — omit "options" entirely (set it to null) and let them type freely. Do NOT offer vague categories or placeholders as if they were answers to a question that asked for specifics (e.g. if you asked them to name particular companies, projects, titles, or numbers, do not offer generic buckets like "a personal project" or "a previous job" as options) — that gives the coach no real information and is worse than no options at all.
- This means: a question asking the candidate to CLASSIFY or pick from genuinely enumerable, named things (tools/skills/languages they may know, yes-or-no, mutually exclusive directions like "grow in place or switch?") is a good fit for options. A question asking them to NAME, DESCRIBE, or ELABORATE on something specific to their own history or preferences is NOT — always omit options for these, regardless of how the question is phrased.
- If the question has mutually-exclusive answers (e.g. "grow in place or switch?"), set "allowMultiple": false and write options as short, natural standalone statements.
- If several answers could reasonably apply together AND each is independently a complete, nameable answer (e.g. "what skills/tools do you already use?" with options like "Python", "stakeholder management"), set "allowMultiple": true and write options as short NOUN-PHRASE fragments — NOT full sentences — since multiple picks get joined together into one message ("Python, SQL, and stakeholder management"), and full sentences don't join naturally.

Output a single JSON object with EXACTLY these fields:
- "message": your question/message text, exactly as you would say it.
- "options": array of 2-5 short strings as described above, or null.
- "allowMultiple": boolean as described above (still required even when "options" is null — just set it false).
- "offTopic": boolean, as described above.`;

  const HISTORY_WINDOW = 16;
  const boundedHistory =
    chatHistory.length > HISTORY_WINDOW
      ? [...chatHistory.slice(0, 2), ...chatHistory.slice(-(HISTORY_WINDOW - 2))]
      : chatHistory;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemInstruction },
    ...boundedHistory.map(msg => ({
      role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: msg.content
    }))
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return AdaptiveQuestionSchema.parse(parsed);
}

/* =====================================================================================
 * Opening message
 * ===================================================================================== */

/**
 * Generates a highly personalized opening message (the hook) based on the profile.
 * Always addresses the candidate by name (or asks for it if unknown), and is journey-aware —
 * never frames a student/new-grad with experienced-person language. Returned as structured
 * data (not a plain string) because the message ends in a real, profile-specific question —
 * the accompanying quick-reply options must answer THAT question, not a generic stand-in.
 */
export async function generateOpeningMessage(profile: Profile): Promise<AdaptiveQuestion> {
  const openai = getOpenAIClient();
  const band = deriveExperienceBand(profile.yearsExperience, profile.inferredPersona);
  const name = profile.name?.trim();

  const prompt = `Analyze the candidate's career profile:
${JSON.stringify(profile, null, 2)}

Journey context for THIS candidate:
${journeyGuidance(band)}

Write the opening chat message as a sharp career mentor.
Guidelines:
1. ${name ? `Address them by their first name ("${name}") in the very first sentence.` : `Their name is unknown — open warmly without inventing a name, and ask their name in one short, natural clause.`}
2. Prove you read the profile — name a real, specific detail appropriate to their stage. For a student/new grad: their field of study, a project, or a stated interest.
For an experienced person: a role transition, tenure pattern, or title-vs-impact gap. Never assert seniority, titles, or "years in the field" the profile does not support.
3. Surface a genuine, specific tension or opportunity that fits their stage.
Do NOT use experienced-person framing ("title-vs-impact gap", "you're already in X field") for someone with little or no experience.
4. Keep it short and punchy (2-4 sentences, max 80 words).
5. Persona: direct, warm, economical. A senior career mentor, not a chatbot.
6. HARD RULE: no generic greetings ("Welcome!", "I have parsed your resume"). Jump into the specific observation. It must be impossible to send this message to any other candidate.
7. End on exactly ONE concrete question, naturally phrased.

Additionally, propose 2-4 short quick-reply options covering the most likely answers to the question you just asked, and set "allowMultiple":
- An option is only valid if picking it, alone, IS the complete answer — the candidate must be able to tap it with no further detail. If your question asks them to pick among specific things you just named from their own profile (e.g. "which of these three areas — X, Y, or Z — energizes you most?"), the options MUST be those exact named things, not generic, unrelated categories — an option that doesn't correspond to anything you actually asked about is wrong even if it sounds like a plausible thing to ask a candidate in general.
- If their name is unknown and this message asks for it, or the question otherwise demands the candidate's own specifics that no small fixed set could cover, omit "options" entirely (set it to null) and let them type freely.
- If the question has mutually-exclusive answers, set "allowMultiple": false and write options as short, natural standalone statements.
- If several answers could reasonably apply together AND each is independently a complete, nameable answer, set "allowMultiple": true and write options as short NOUN-PHRASE fragments — NOT full sentences — since multiple picks get joined together into one message.

Output a single JSON object with EXACTLY these fields:
- "message": the opening message itself, exactly as you'd send it (2-4 sentences as above).
- "options": array of 2-4 short strings as described above, or null.
- "allowMultiple": boolean as described above (still required even when "options" is null — just set it false).`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: MENTOR_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return AdaptiveQuestionSchema.parse(parsed);
}

/* =====================================================================================
 * Signal analysis
 * ===================================================================================== */

/**
 * Analyzes the chat history to extract and update career signals: concrete skills/domains,
 * motivations/constraints, an explicitly stated target country, and the readiness gates
 * (`readyForRecommendation`, `hasUsableInfo`) the orchestration uses to decide what's next.
 */
export async function analyzeSignals(
  chatHistory: ChatMessage[],
  currentSignals: UserSignals
): Promise<UserSignals> {
  const openai = getOpenAIClient();

  const prompt = `You are a career development analyst. Analyze the conversation transcript to update the user's signals.

Current Signals:
${JSON.stringify(currentSignals, null, 2)}

Chat history (focus on the latest messages):
${JSON.stringify(chatHistory.slice(-6), null, 2)}

Your task — update the UserSignals object:
1. "intentGuess": one of 'pivot' | 'grow' | 'early_career' | 'unknown'.
2. "motivations": career drivers (e.g. "higher salary", "product ownership", "remote work"). No duplicates.
3. "constraints": limitations (e.g. "no relocation", "must be in India", "max 40h/week").
4. "rejectedDirections": things they explicitly rejected or disliked. ALWAYS a full natural-language phrase (e.g. "not interested in management", "avoid sales roles") — NEVER a category code/slug/snake_case.
5. "knownSkills": concrete skills or tools the candidate has actually stated they know or are comfortable with. Empty array if none stated. Only real, specific skills — not aspirations.
6. "knownDomains": concrete fields/industries/domains the candidate has stated interest in OR experience in (e.g. "digital marketing", "B2B client outreach"). Empty array if none. Capture these even when expressed loosely, so we never re-ask which field interests them.
7. "country": a country/market the candidate has explicitly named as their target for this move. Null if they have not named one.
8. "notes": brief plain-English analytical notes (state of mind, contradictions).
9. "readyForRecommendation": true ONLY IF (a) "knownSkills" or "knownDomains" has at least one real entry, AND (b) the CANDIDATE has stated an actual motivation, constraint, or direction preference (e.g. grow in place vs switch roles/companies, what they're optimizing for) in their own words this conversation, reflected in "motivations" or "constraints" below. Do NOT count the assistant's own restated profile facts, or a bare acknowledgement like "yes"/"sure"/"ok" with no new content, as satisfying (b). If you have no concrete skill/domain, or no genuine candidate-stated direction, this MUST be false.
10. "hasUsableInfo": false ONLY if, across the ENTIRE conversation, the candidate has given no real career-relevant information at all — every reply has been a refusal, a non-answer ("idk", "whatever"), or off-topic. true the moment they've shared anything genuinely usable, even a small detail.

Preserve existing signals unless the user has directly changed their mind or contradicted them. Never drop a skill/domain/country once genuinely captured.`;

  const response = await openai.chat.completions.create({
    // gpt-5-nano (not -mini): this is a structured-extraction-into-a-fixed-schema task, the
    // same class of work extractProfile already does on nano — and it's the highest-frequency
    // call in the app (every chat turn), so model choice matters most here cost-wise.
    model: 'gpt-5-nano',
    messages: [
      { role: 'system', content: 'You are a career signals extractor. Output JSON matching the requested schema.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);

  const SignalsSchema = z.object({
    intentGuess: z.enum(['pivot', 'grow', 'early_career', 'unknown']),
    motivations: z.array(z.string()),
    constraints: z.array(z.string()),
    rejectedDirections: z.array(z.string()),
    knownSkills: z.array(z.string()),
    knownDomains: z.array(z.string()),
    country: z.string().nullish(),
    notes: z.array(z.string()),
    readyForRecommendation: z.boolean(),
    hasUsableInfo: z.boolean(),
  });

  // NOTE: keep the UserSignals type in ../state/conversation in sync with this schema.
  return SignalsSchema.parse(parsed) as UserSignals;
}

/* =====================================================================================
 * Roadmap generation
 * ===================================================================================== */

/**
 * Generates a phased, week-by-week execution roadmap for the chosen path, with application
 * channels and salary context localized to the resolved market.
 */
export async function generateRoadmap(
  profile: Profile,
  chosenPath: CareerPath,
  signals: UserSignals,
  feedback?: string
): Promise<Roadmap> {
  const openai = getOpenAIClient();
  const country = resolveMarket(profile, signals).country;
  const band = deriveExperienceBand(profile.yearsExperience, profile.inferredPersona);
  const defaultWeeklyHours = deriveWeeklyHoursCommitment(band);
  // chosenPath can come from a browser session persisted under a previous build's tier values
  // (e.g. the old "optimistic" key, renamed to "ambitious") — fall back to "realistic" rather
  // than crashing the route on a stale, now-unrecognized tier string.
  const { minWeeks, maxWeeks, monthsLabel } = TIER_TIMELINE[chosenPath.tier] ?? TIER_TIMELINE.realistic;

  const prompt = `You are a sharp career mentor building a concrete, week-by-week execution roadmap for a candidate who just locked in a target career path.

Candidate profile:
${JSON.stringify(profile, null, 2)}

Conversation signals (motivations, constraints, rejected directions):
${JSON.stringify(signals, null, 2)}

Chosen path:
${JSON.stringify(chosenPath, null, 2)}

Target market: ${country}. When you name application channels, communities, or salary context, make them realistic for ${country}.
${feedback ? `\nThe candidate already saw an earlier version of this roadmap and gave this feedback/preference update — revise the roadmap to honestly incorporate it (push back in "summary" if the feedback itself is unrealistic, but still produce the best honest plan): "${feedback}"\n` : ''}

Step 1: Classify the candidate's "skillLevel" for THIS SPECIFIC PATH (not their general seniority). Compare their existing skills/domains/roleHistory against what the chosen path's title and upskills demand. Use exactly one of:
- "beginner": Little to no overlap (e.g. <1-2 years total, or pivoting into a domain with no background).
- "basic": Some relevant foundational/adjacent skills, but missing the advanced ones the path demands.
- "good": Strong overlap — most core skills present; mainly needs to prove it with real work.
- "experienced": Already at/near this path's level; mainly needs to refresh/sharpen specific skills.

Step 2: Build the "phases" array using ONLY the phase combination that matches the classification. Every combination ends in exactly one "practice" phase immediately before the "application" phase — practice = mock interviews, timed case work, or simulated on-the-job tasks specific to ${chosenPath.title}, NOT more courses or building:
- "beginner" → "course" phase(s) basics THEN advanced → "project" → "practice" → "application" targeting internships/entry-level roles.
- "basic" → one "course" phase advanced-only (skip basics) → "project" → "practice" → "application" targeting relevant full roles.
- "good" → one "project" phase (portfolio-grade, industry-realistic; no course phase) → "practice" → "application".
- "experienced" → one "course" phase that is explicitly a refresher/advanced-edge phase (no project phase) → "practice" → "application".

Step 3: Determine a realistic weekly time commitment, then break EVERY phase into a week-by-week plan that targets the timeline this path was already classified at:
- This path was tagged "${chosenPath.tier}" when it was recommended — ${monthsLabel} of effort, i.e. a target of ${minWeeks}-${maxWeeks} weeks. Aim "totalWeeks" at this band for a typical gap at this tier.
- Default weekly commitment for this candidate: ${defaultWeeklyHours}. Use this UNLESS the candidate's signals (constraints/motivations) or the feedback below explicitly state a different weekly time commitment — if they do, use their stated number instead and name it in "summary". Weekly hours control how much CONTENT/DEPTH is packed into each week, NOT how many weeks the plan spans — a candidate with more weekly hours available (e.g. a student) should get MORE thorough preparation (deeper projects, more practice, more applications) within the SAME ${minWeeks}-${maxWeeks}-week window, not a shorter one. Breaking into the industry without a track record requires that extra depth regardless of how many hours/week are available — never shrink "totalWeeks" below the band just because weekly hours are high.
- The ${minWeeks}-${maxWeeks} band is a target, not an absolute wall: if THIS SPECIFIC candidate's gap for THIS path (per skillLevel and what the upskills actually demand) is genuinely too wide to compress into it without producing hollow, non-actionable weekly content, you may extend up to ${Math.round(maxWeeks * 1.5)} weeks — but you MUST say so honestly in "summary", naming why this specific gap needs more than the typical ${monthsLabel} for this tier (mirror the same honesty already required for "too_high" ambitionCheck verdicts). Do not extend just because it feels safer — only when the content genuinely doesn't fit.
- If the candidate's feedback explicitly states a much lower weekly commitment that makes even the extended band implausible, you may go beyond it — say so honestly in "summary", citing their stated constraint.
- Sequential "week" number incrementing across the whole roadmap (never restart at 1 for a later phase).
- Each week: a short "focus" theme and 2-5 concrete, specific "items" sized to fit inside the weekly hour budget — real course topics, real project milestones, real mock-interview formats, real application channels relevant to ${chosenPath.title} and ${country}. Never filler like "take some courses".

Output a single JSON object with EXACTLY these fields:
- "skillLevel": one of "beginner" | "basic" | "good" | "experienced".
- "summary": 1-2 sentences explaining the classification, citing a specific profile fact.
- "weeklyHoursCommitment": string, the weekly hours used for this plan (e.g. "8-10 hours/week" or "4-6 hours/week"), or the candidate's explicit stated commitment if it overrides the default.
- "totalWeeks": number, the highest "week" number used.
- "totalDuration": string derived from totalWeeks (e.g. "14 weeks (~3.5 months)").
- "phases": array of objects, each with "type", "title", "description", and "weeks" (array of { "week", "focus", "items" }).`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: 'You are a career roadmap planner. Output JSON matching the requested schema exactly.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  const roadmap = RoadmapSchema.parse(parsed);

  // Observability, not a hard gate — the prompt allows honest overflow up to 1.5x maxWeeks for
  // a genuinely wide gap, so this only flags totalWeeks that fell outside even that allowance.
  if (roadmap.totalWeeks < minWeeks || roadmap.totalWeeks > Math.round(maxWeeks * 1.5)) {
    console.warn(
      `generateRoadmap: totalWeeks (${roadmap.totalWeeks}) fell outside the "${chosenPath.tier}" tier's expected band (${minWeeks}-${Math.round(maxWeeks * 1.5)}) for path "${chosenPath.title}".`
    );
  }

  return roadmap;
}