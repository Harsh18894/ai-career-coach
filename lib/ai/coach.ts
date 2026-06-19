import OpenAI from 'openai';
import { z } from 'zod';
import { Profile, ProfileSchema, CareerPath, PathDeckSchema, Roadmap, RoadmapSchema } from './schemas';
import { ChatMessage, UserSignals } from '../state/conversation';

// Initialize OpenAI client
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not defined.');
  }
  return new OpenAI({ apiKey });
};

// System prompt persona for the mentor
export const MENTOR_SYSTEM_PROMPT = `You are a sharp, experienced career mentor — direct, warm, and economical with words. You speak like a senior operator who has seen hundreds of careers, not like a chatbot or a recruiter. You ask one good question at a time and react to what the person actually said. You never sound like a form. You never give a recommendation without tying it to a specific fact about this person. You are honest about gaps and tensions. Keep messages short (2–5 sentences) unless presenting structured recommendations.`;

/**
 * Extracts a structured Profile from the raw resume text.
 * Returns null if the text does not contain enough real career information to build a profile from
 * (e.g. it is gibberish, unrelated content, or too sparse) — callers should fall back to the guided
 * profile-building chat in that case instead of forcing a low-quality extraction.
 */
export async function extractProfile(resumeText: string): Promise<Profile | null> {
  const openai = getOpenAIClient();

  const prompt = `You are a professional resume analyst. Parse the following raw resume text and extract a structured career profile.
Be honest, realistic, and insightful. Identify the notable transitions and tension points (e.g. title-vs-impact gaps, career plateaus, or missing credentials).

First, decide "hasSufficientInfo": output false ONLY if the text contains no real, identifiable career information (e.g. it is gibberish, an unrelated document like an article or recipe, or far too sparse to extract a meaningful job history/skills from). If it has at least some genuine resume content, even if thin, output true.

Output a single JSON object with EXACTLY these fields (no extra fields, no nesting under another key):
- "hasSufficientInfo": boolean, required (see above). If false, you may leave the remaining fields as empty defaults — they will be ignored.
- "name": string, optional. The candidate's name if present.
- "yearsExperience": number, required. Total years of professional experience (estimate from role durations).
- "currentRole": string, optional. Their most recent/current job title.
- "currentLevel": required, one of "IC" | "senior_IC" | "manager" | "unknown".
- "roleHistory": required array of objects, one per role, each with: "title" (string, required), "company" (string, optional), "durationMonths" (number, optional).
- "skills": required array of strings.
- "domains": required array of strings (industries/domains they've worked in, e.g. "fintech", "B2B SaaS").
- "region": string, optional. Their inferred location/region.
- "notableTransitions": required array of strings describing notable career transitions.
- "tensions": required array of strings describing tension points (e.g. title-vs-impact gaps, plateaus, missing credentials).
- "inferredPersona": required, one of "pivot" | "grow_in_place" | "early_career" | "unknown":
  - 'pivot': ~2 years in (SDR/analyst/etc), wants to switch tracks, wants ownership/strategic work.
  - 'grow_in_place': 4-6 years, solid IC or new manager, feels invisible, title lags impact, wants to level up in place (no company switch).
  - 'early_career': <=1 year/new grad, overwhelmed by options, needs structured thinking.
  - 'unknown': doesn't fit the above.

If a required array has no items to report, output an empty array rather than omitting the field.

Resume Text:
"""
${resumeText}
"""`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a career profile parser. Output JSON matching the requested schema.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);

  if (parsed.hasSufficientInfo === false) {
    return null;
  }

  return ProfileSchema.parse(parsed);
}

/**
 * Builds a structured Profile from guided Q&A answers, used when a candidate has no resume
 * (or their resume had no usable content) and instead answers a short sequence of chat questions.
 */
export async function buildProfileFromAnswers(
  answers: { question: string; answer: string }[]
): Promise<Profile> {
  const openai = getOpenAIClient();

  const transcript = answers
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n');

  const prompt = `You are a professional career analyst. A candidate without a resume answered a short series of guided questions about their current situation, experience, skills, and interests. Build a structured career profile from their answers.
Be honest, realistic, and insightful. Infer notable transitions and tension points where the answers suggest them (e.g. a pivot, a skills gap for their stated interest, time without direction) — it is fine to leave these as empty arrays if nothing notable applies.

Q&A transcript:
"""
${transcript}
"""

Output a single JSON object with EXACTLY these fields (no extra fields, no nesting under another key):
- "name": string, optional. Omit if not mentioned.
- "yearsExperience": number, required. Estimate from their stated experience; use 0 if they are a complete beginner.
- "currentRole": string, optional. Their stated current role, focus, or field of study.
- "currentLevel": required, one of "IC" | "senior_IC" | "manager" | "unknown". Use "unknown" for beginners/students.
- "roleHistory": required array of objects, each with "title" (string, required), "company" (string, optional), "durationMonths" (number, optional). Use a single best-effort entry from their stated current role/experience, or an empty array if nothing to infer.
- "skills": required array of strings, from their stated skills/tools.
- "domains": required array of strings, from their stated industry/field of interest.
- "region": string, optional. From their stated location, if mentioned.
- "notableTransitions": required array of strings. Empty array if none apply.
- "tensions": required array of strings. Empty array if none apply.
- "inferredPersona": required, one of "pivot" | "grow_in_place" | "early_career" | "unknown":
  - 'pivot': has some experience but wants to switch tracks/industries entirely.
  - 'grow_in_place': has relevant experience and wants to advance further in the same field.
  - 'early_career': little to no experience (e.g. student, complete beginner), needs structured thinking.
  - 'unknown': doesn't clearly fit the above.

If a required array has no items to report, output an empty array rather than omitting the field.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a career profile builder. Output JSON matching the requested schema.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return ProfileSchema.parse(parsed);
}

/**
 * Generates exactly 3 Career Paths based on profile, user signals, shown paths, and rejected directions.
 */
export async function generatePaths(
  profile: Profile,
  signals: UserSignals,
  shownPaths: string[],
  rejectedDirections: string[]
): Promise<CareerPath[]> {
  const openai = getOpenAIClient();

  const prompt = `You are a sharp career mentor. Generate exactly 3 personalized career path recommendations for this candidate.
  
Below is the candidate's parsed profile:
${JSON.stringify(profile, null, 2)}

Below are the signals accumulated during the conversation so far:
${JSON.stringify(signals, null, 2)}

Hard constraints to follow:
1. Every recommendation's fitRationale MUST reference a specific fact from the candidate's profile (e.g. a company, duration, role transition) or a specific statement they made in the chat signals. Quote or paraphrase the source (e.g. "Because you mentioned wanting ownership, and you've already run X end to end...").
2. Respect the constraints (e.g. if they want to stay in their current company, recommend paths that grow in place. If they reject remote work, don't suggest fully remote roles).
3. Do NOT recommend paths that overlap with already recommended paths. Here are the paths already shown: ${JSON.stringify(shownPaths)}.
4. Avoid any topics/directions that the candidate has rejected. Here are their rejected directions: ${JSON.stringify(rejectedDirections)}.
5. Design each path card with:
   - title: Concrete, descriptive role title (e.g. "Product Manager (growth-leaning, B2C)")
   - fitRationale: Specific reasons why this fits them, citing facts.
   - salaryRange: Realistic range calibrated for the candidate's region/seniority (e.g., "$110k - $130k USD").
   - upskills: 2 to 4 concrete, actionable gaps to close (e.g. "learn SQL well enough to self-serve metrics", "ship one externally-facing roadmap").
   - firstMove: A concrete "first move this month" step.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `${MENTOR_SYSTEM_PROMPT} Output exactly 3 career paths in a JSON array inside a "paths" key matching the requested schema.` },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  const validated = PathDeckSchema.parse(parsed);
  return validated.paths;
}

/**
 * Streams a chat turn from the coach.
 * We include the conversation history, profile, and current signals to help it maintain context and guide the conversation.
 */
export async function streamChatTurn(
  chatHistory: ChatMessage[],
  profile: Profile | null,
  signals: UserSignals,
  chosenPath?: CareerPath | null,
  rejectedAll?: boolean
): Promise<Response> {
  const openai = getOpenAIClient();

  // Create instructions for this chat turn based on the stage/state
  let systemInstruction = `${MENTOR_SYSTEM_PROMPT}

Keep in mind the candidate's profile context:
${profile ? JSON.stringify(profile) : 'No resume uploaded yet.'}

Current conversation signals:
${JSON.stringify(signals)}
`;

  if (chosenPath) {
    systemInstruction += `
The candidate has officially selected this path: "${chosenPath.title}".
Your task is to write a tailored closing message:
1. Reflect their choice back to them with encouragement.
2. Restate the 1-2 highest-leverage next moves they need to make based on this path (upskills: ${JSON.stringify(chosenPath.upskills)}, first move: ${chosenPath.firstMove}).
3. End with one decisive, powerful mentor-like line.
4. Do NOT ask any more questions. This is the end of the session. Keep it to 3-5 sentences, warm, direct, and senior.`;
  } else if (rejectedAll) {
    systemInstruction += `
The candidate has declined all recommended paths.
Your task is to write a tailored closing message:
1. Honestly name the pattern in their rejections based on their signals (rejected directions: ${JSON.stringify(signals.rejectedDirections)}). E.g., "Every path you turned down kept you a step away from owning the outcome — that's the real signal".
2. Give one grounded, realistic direction for them to think about.
3. Close warmly but decisively.
4. Do NOT ask any more questions. This is the end of the session. Keep it to 3-5 sentences, warm, direct, and senior.`;
  } else {
    systemInstruction += `
Guidelines for the conversation:
1. You are in the UNDERSTANDING phase. Keep messages short (2-5 sentences). 
2. Do not show lists, forms, or multiple questions at once. Ask exactly ONE sharp, natural question at a time.
3. React to what they just said. Do not ignore their responses.
4. Try to surface their motivations (e.g., salary vs. impact vs. learning), constraints (location, remote vs. onsite, staying vs. leaving), and narrow down their path.
5. If they give a one-word or very short answer, gently probe or call it out (e.g., "Money is a given, but what does that purchase you? Security, or flexibility?").
6. If they contradict themselves, point it out kindly but directly (e.g., "Earlier you said you wanted stability, but now you're talking about joining a 3-person pre-seed startup. Which one is the real driver?").
7. If they say "nothing bothers me" or they are happy, pivot to what they want *more* of, or what the next level looks like.
8. Make the conversation feel like a real coffee chat with a senior director, not a scripted intake form.`;
  }


  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemInstruction },
    ...chatHistory.map(msg => ({
      role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: msg.content
    }))
  ];

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
    temperature: 0.7,
  });

  // Convert the OpenAI stream into a Web standard ReadableStream for SSE / streaming response
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

/**
 * Generates a highly personalized opening message (the hook) based on the profile.
 * It must prove understanding by mentioning a specific detail and tension point.
 */
export async function generateOpeningMessage(profile: Profile): Promise<string> {
  const openai = getOpenAIClient();

  const prompt = `Analyze the candidate's career profile:
${JSON.stringify(profile, null, 2)}

Write the opening chat message as a sharp career mentor.
Guidelines:
1. Prove you read the resume — name a real, specific detail (a role transition in their history, a tenure pattern, a title-vs-impact gap, a skill cluster, or an industry shift).
2. Surface a genuine, specific tension or opportunity (e.g. "You've shipped X for 3 years but every title still says Y — that gap is the whole conversation").
3. Keep it short and punchy (2-4 sentences, max 80 words).
4. Persona: direct, warm, and economical with words. Speak like a senior operator, not a chatbot.
5. HARD RULE: No generic greetings (e.g. "Welcome!", "Hello! Let's get started", "I have parsed your resume"). Jump straight into the specific observation. It must be impossible to send this message to any other candidate.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: MENTOR_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.8,
  });

  return response.choices[0].message.content || 'I read your profile. Let us dive in.';
}

/**
 * Analyzes the chat history to extract and update career signals.
 */
export async function analyzeSignals(
  chatHistory: ChatMessage[],
  currentSignals: UserSignals
): Promise<UserSignals> {
  const openai = getOpenAIClient();

  const prompt = `You are a career development analyst. Analyze the following conversation transcript to update the user's signals.

Current Signals:
${JSON.stringify(currentSignals, null, 2)}

Chat history (focus on the latest messages):
${JSON.stringify(chatHistory.slice(-4), null, 2)}

Your task:
Extract the candidate's career preferences, rejections, constraints, and motivations. Update the UserSignals object:
1. "intentGuess": Refine based on their choice. Use:
   - 'pivot': Wants to transition to a different role/industry, values ownership/strategy.
   - 'grow_in_place': Wants to level up or resolve plateaus inside their current field/company.
   - 'early_career': New grad, needs structured choices.
   - 'unknown': Default if not yet clear.
2. "motivations": Add new career drivers (e.g., "higher salary", "product ownership", "mentorship", "wfh"). Do not duplicate.
3. "constraints": Add limitations (e.g., "no relocation", "must be in USA", "max 40h/week").
4. "rejectedDirections": Add things they explicitly rejected or disliked (e.g., "not interested in management", "avoid sales roles").
5. "notes": Brief analytical notes about their state of mind or contradictions.

Preserve existing signals unless the user has directly changed their mind or contradicted them.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a career signals extractor. Output JSON matching the requested schema.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  
  const SignalsSchema = z.object({
    intentGuess: z.enum(['pivot', 'grow_in_place', 'early_career', 'unknown']),
    motivations: z.array(z.string()),
    constraints: z.array(z.string()),
    rejectedDirections: z.array(z.string()),
    notes: z.array(z.string()),
  });

  return SignalsSchema.parse(parsed);
}

/**
 * Generates a phased execution roadmap for the path the candidate locked in.
 * The phase mix and content are tailored to the candidate's readiness for THIS
 * specific path (domain + skill overlap), not their general seniority.
 */
export async function generateRoadmap(
  profile: Profile,
  chosenPath: CareerPath,
  signals: UserSignals
): Promise<Roadmap> {
  const openai = getOpenAIClient();

  const prompt = `You are a sharp career mentor building a concrete execution roadmap for a candidate who just locked in a target career path.

Candidate profile:
${JSON.stringify(profile, null, 2)}

Conversation signals (motivations, constraints, rejected directions):
${JSON.stringify(signals, null, 2)}

Chosen path:
${JSON.stringify(chosenPath, null, 2)}

Step 1: Classify the candidate's "skillLevel" for THIS SPECIFIC PATH (not their general seniority — someone senior in one domain can be a beginner relative to a path in a new domain). Compare their existing skills/domains/roleHistory against what the chosen path's title and upskills demand. Use exactly one of:
- "beginner": Little to no existing skill/domain overlap with the path (e.g. <1-2 years total experience, or pivoting into a domain they have no background in).
- "basic": Some relevant foundational skills or adjacent experience, but missing the advanced/specialized skills the path demands.
- "good": Strong overlap — most of the core skills for the path are already present; mainly needs to prove it with real work.
- "experienced": Already operates at or near this path's level; mainly needs to refresh/sharpen specific skills before applying.

Step 2: Build the "phases" array using ONLY the phase combination that matches the classification (do not add phases outside this list, do not skip required ones):
- "beginner" → phases in order: one or two "course" phases covering basic foundations THEN advanced topics, then a "project" phase (can run partially in parallel with the courses — reflect that in the timeline strings), then an "application" phase targeting internships/entry-level roles.
- "basic" → phases in order: one "course" phase focused on advanced/specialized topics only (skip basics), then a "project" phase, then an "application" phase targeting relevant full roles.
- "good" → phases in order: one "project" phase building portfolio-grade, industry-realistic work (no course phase), then an "application" phase.
- "experienced" → phases in order: one "course" phase that is explicitly a refresher/advanced-edge-skills phase (not foundational), then an "application" phase (no project phase).

Step 3: For every phase, make "items" concrete and specific to the candidate's actual domain, skills, and stated requirements/constraints (e.g. name real course topics, real project ideas, real application channels relevant to ${chosenPath.title} and the candidate's region/domains) — never generic filler like "take some courses."

Output a single JSON object with EXACTLY these fields:
- "skillLevel": one of "beginner" | "basic" | "good" | "experienced" (from Step 1).
- "summary": string, 1-2 sentences explaining the classification, citing a specific profile fact.
- "totalDuration": string, one realistic end-to-end timeframe estimate (e.g. "3-5 months").
- "phases": array of objects, each with:
  - "type": one of "course" | "project" | "application".
  - "title": short phase name.
  - "timeline": realistic relative timeframe for this phase (e.g. "Weeks 1-6" or "Month 2-3").
  - "items": array of 3-6 concrete, specific action strings.
  - "description": one sentence on why this phase matters for this candidate.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a career roadmap planner. Output JSON matching the requested schema exactly.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return RoadmapSchema.parse(parsed);
}

