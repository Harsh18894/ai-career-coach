import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatWindow from './ChatWindow';
import { ERROR_MESSAGES, type ErrorCode } from '@/lib/errors';
import type { Profile, AdaptiveQuestion } from '@/lib/ai/schemas';
import { STORAGE_KEYS } from '@/lib/brand';

/* =====================================================================================
 * Failure-mode rendering.
 *
 * Every OpenAI call is behind fetch, so failures are injected by mocking fetch rather than the
 * client — same observable result for the UI, without reaching the network. What is asserted
 * here is exactly what a user would see: which sentence appears, whether a recovery action is
 * offered, and that the spinner always stops.
 * ===================================================================================== */

const PROFILE: Profile = {
  name: 'Sam Rivera',
  yearsExperience: 4,
  currentRole: 'Backend Engineer',
  currentLevel: 'IC',
  roleHistory: [{ title: 'Backend Engineer', company: 'Northwind Systems', durationMonths: 48 }],
  skills: ['Python', 'PostgreSQL'],
  domains: ['fintech'],
  region: null,
  country: 'India',
  countriesDetected: ['India'],
  notableTransitions: [],
  tensions: [],
  inferredPersona: 'grow',
};

// options: null mirrors an opener that proposed no quick replies, which is what makes
// ChatWindow fall back to the static direction options for the first reply.
const OPENER: AdaptiveQuestion = {
  message: 'Four years at Northwind on one backend stack. What is pulling at you?',
  options: null,
  allowMultiple: false,
  offTopic: false,
};

const SIGNALS = {
  intentGuess: 'grow',
  motivations: [],
  constraints: [],
  rejectedDirections: [],
  knownSkills: ['Python'],
  knownDomains: ['fintech'],
  country: 'India',
  notes: [],
  readyForRecommendation: false,
  hasUsableInfo: true,
};

/** The typed envelope every route returns on failure (lib/api-response.ts). */
function errorResponse(code: ErrorCode, status: number, message?: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message: message ?? ERROR_MESSAGES[code] } }),
  } as unknown as Response;
}

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as unknown as Response;
}

/**
 * A streaming response that emits `chunks`, then either closes or fails. Modelled as a bare
 * object rather than a real Response because the component only ever touches `.ok`, `.json()`
 * and `.body.getReader()`, and jsdom's stream support is not worth fighting.
 */
function streamResponse(chunks: string[], { failAfter = false } = {}) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (i < chunks.length) return { done: false, value: encoder.encode(chunks[i++]) };
          if (failAfter) throw new Error('socket hang up');
          return { done: true, value: undefined };
        },
      }),
    },
  } as unknown as Response;
}

/** Reads the `action` out of a mocked coach request. */
function actionOf(init?: RequestInit): string {
  if (!init?.body || typeof init.body !== 'string') return '';
  try {
    return (JSON.parse(init.body) as { action?: string }).action ?? '';
  } catch {
    return '';
  }
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderChat() {
  return render(<ChatWindow initialProfile={PROFILE} initialOpener={OPENER} onReset={vi.fn()} />);
}

/**
 * The first UNDERSTANDING reply is answered through the direction quick-options, not the
 * composer — ChatWindow disables the textarea while any options panel is showing. Clicking the
 * option is therefore the only realistic way to send that turn.
 */
const FIRST_REPLY_OPTION = 'Grow in the same role/organisation';
const FIRST_REPLY_TEXT = "I'd like to grow in my current role and organization rather than switch jobs.";

async function sendFirstReply() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: FIRST_REPLY_OPTION }));
  return user;
}

/** Sends through the free-text composer — valid once no options panel is showing. */
async function sendMessage(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), text);
  await user.click(screen.getByRole('button', { name: 'Send message' }));
  return user;
}

/* =====================================================================================
 * One failure mode per code
 * ===================================================================================== */

describe('ChatWindow failure handling', () => {
  it('explains the spent budget honestly instead of showing an error, and offers no Retry', async () => {
    // Not an alert and not red: a spend cap is the demo working as designed. A Reddit spike
    // means this is the only screen many visitors ever see, so it has to read as "free side
    // project, come back tomorrow" rather than as a fault.
    fetchMock.mockResolvedValue(errorResponse('BUDGET_EXCEEDED', 429));

    renderChat();
    await sendFirstReply();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/today’s budget spent/i);
    expect(notice).toHaveTextContent(/resets at midnight/i);
    // The repo is offered as the thing to do instead — the point of the section.
    expect(screen.getByRole('link', { name: /read the code instead/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    // And it is not dressed as an error.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains the rate limit as the reason the demo is free, and offers no Retry', async () => {
    fetchMock.mockResolvedValue(errorResponse('RATE_LIMITED', 429));

    renderChat();
    await sendFirstReply();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/hourly limit/i);
    expect(notice).toHaveTextContent(/keeps this free/i);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each<[ErrorCode, number]>([
    ['UPSTREAM_TIMEOUT', 504],
    ['UPSTREAM_ERROR', 502],
    ['INVALID_OUTPUT', 502],
  ])('shows the %s message and offers Retry', async (code, status) => {
    fetchMock.mockResolvedValue(errorResponse(code, status));

    renderChat();
    await sendFirstReply();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGES[code]);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('never shows a raw upstream message, even when the server sends one', async () => {
    // A pre-taxonomy `{ error: "..." }` body, which is what a stale route would return.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Error: 429 Rate limit reached for gpt-5-mini in org-abc123' }),
    } as unknown as Response);

    renderChat();
    await sendFirstReply();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGES.UNKNOWN);
    expect(alert).not.toHaveTextContent(/gpt-5-mini|org-abc123|rate limit reached/i);
  });

  it('always stops the loading indicator when a turn fails', async () => {
    fetchMock.mockResolvedValue(errorResponse('UPSTREAM_ERROR', 502));

    const { container } = renderChat();
    await sendFirstReply();

    await screen.findByRole('alert');
    await waitFor(() => {
      expect(container.querySelector('.animate-bounce')).not.toBeInTheDocument();
    });
  });

  /* =================================================================================== */

  it('recovers the conversation when Retry succeeds', async () => {
    // Keyed on the request, not on call order. Analytics and journey pings share this mock and
    // fire at unpredictable moments, so a mockResolvedValueOnce queue would be consumed by
    // whichever telemetry ping happened to go first — which is exactly what it used to do.
    let analyzeCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && (url.includes('/api/events') || url.includes('/api/journey'))) {
        return jsonResponse({ ok: true });
      }
      if (actionOf(init) === 'analyze') {
        analyzeCalls += 1;
        // Fail the first attempt only; the retry succeeds.
        if (analyzeCalls === 1) return errorResponse('UPSTREAM_ERROR', 502);
        return jsonResponse({ signals: SIGNALS });
      }
      return jsonResponse({ message: 'Say more about the platform side.', options: null, allowMultiple: false });
    });

    renderChat();
    const user = await sendFirstReply();

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: /retry/i }));

    // The error clears and the retried turn's reply is rendered.
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText(/Say more about the platform side/)).toBeInTheDocument();

    // The user's original message is still in the transcript — the turn was resent, not lost.
    expect(screen.getByText(FIRST_REPLY_TEXT)).toBeInTheDocument();
  });

  it('keeps the partial reply visible when the stream dies mid-answer, and can retry it', async () => {
    // A ROADMAP-stage session is the path that streams a free-text reply, so it is what
    // exercises a mid-stream failure. Seeded through localStorage, which ChatWindow restores.
    localStorage.setItem(
      STORAGE_KEYS.session,
      JSON.stringify({
        stage: 'ROADMAP',
        profile: PROFILE,
        signals: SIGNALS,
        messages: [{ id: 'opener', role: 'assistant', content: OPENER.message, createdAt: new Date().toISOString() }],
        deckCount: 1,
        shownPaths: ['Platform Engineer'],
        rejectedDirections: [],
        changeRequests: null,
        chosenPath: {
          title: 'Platform Engineer',
          tier: 'realistic',
          fitRationale: 'Four years of backend work at Northwind.',
          salaryRange: '₹20-30 LPA',
          upskills: ['Kubernetes'],
          firstMove: 'Ship one internal tool.',
          ambitionCheck: { verdict: 'aligned', note: 'Consistent with the evidence.' },
        },
        currentPaths: null,
        roadmap: {
          skillLevel: 'good',
          summary: 'Solid backend base.',
          weeklyHoursCommitment: '8-10 hours/week',
          totalWeeks: 12,
          totalDuration: '12 weeks (~3 months)',
          phases: [
            {
              type: 'course',
              title: 'Foundations',
              description: null,
              weeks: [{ week: 1, focus: 'Containers', items: ['Docker basics', 'Build an image'] }],
            },
          ],
        },
        roadmapVersion: 1,
        selectedPathIndex: 0,
        roadmapPanelOpen: false,
        understandingMessageCount: 3,
        noUsefulInfoStreak: 0,
        profileBuildStep: 0,
        profileBuildAnswers: [],
        profileBuildQuestions: [],
        pendingTurnOptions: null,
      })
    );

    let chatCalls = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const action = actionOf(init);
      if (action === 'analyze') return jsonResponse({ signals: SIGNALS });
      if (action === 'chat') {
        chatCalls += 1;
        // First attempt dies partway; the retry completes.
        return chatCalls === 1
          ? streamResponse(['Start with the Kubernetes'], { failAfter: true })
          : streamResponse(['Start with the Kubernetes module, then ship one internal tool.']);
      }
      return jsonResponse({});
    });

    renderChat();
    await waitFor(() => expect(screen.getByText(OPENER.message)).toBeInTheDocument());

    const user = await sendMessage('How should I start week one?');

    // The partial text stays on screen, with an inline notice and a way forward.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cut off partway/i);
    expect(screen.getByText(/Start with the Kubernetes/)).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: /retry/i });
    await user.click(retry);

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

    // The completed reply replaces the truncated one rather than sitting below it.
    expect(await screen.findByText(/ship one internal tool/)).toBeInTheDocument();
    expect(screen.queryByText('Start with the Kubernetes')).not.toBeInTheDocument();
    expect(chatCalls).toBe(2);
  });
});

/* =====================================================================================
 * Concurrent calls (B6)
 *
 * Locking a path fires the roadmap request and streams the closing reflection at the same
 * time. They are independent, and the failure handling has to treat them that way: for a while
 * both lived in one try block, so a stream failure jumped to catch and left the roadmap promise
 * unawaited — an unhandled rejection, and a roadmap that had already been generated and paid
 * for was thrown away.
 * ===================================================================================== */

const PATH = {
  title: 'Platform Engineer',
  tier: 'realistic' as const,
  fitRationale: 'Four years on backend systems at Northwind.',
  salaryRange: '₹18–24 LPA (indicative)',
  upskills: ['Kubernetes', 'Terraform'],
  firstMove: 'Ship one internal tool on the platform team this month.',
  ambitionCheck: { verdict: 'aligned' as const, note: 'Matches the backend depth already shown.' },
};

const ROADMAP = {
  skillLevel: 'good' as const,
  summary: 'Four years of backend work makes this a short hop.',
  weeklyHoursCommitment: '6-8 hours/week',
  totalWeeks: 12,
  totalDuration: '12 weeks (~3 months)',
  phases: [
    {
      type: 'course' as const,
      title: 'Foundations',
      description: null,
      weeks: [{ week: 1, focus: 'Kubernetes basics', items: ['Run a cluster locally', 'Deploy one service'] }],
    },
  ],
};

/** Drives the conversation to a rendered path deck, then locks the first path. */
async function lockInAPath(onCoach: (action: string) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => onCoach(actionOf(init)));

  renderChat();
  await sendFirstReply();
  await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
  await sendMessage('I want more ownership of systems end to end.');

  // The deck renders once `recommend` returns paths.
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
  await user.click(await screen.findByRole('button', { name: /Build your roadmap/ }));
  return user;
}

describe('ChatWindow concurrent roadmap + closing stream', () => {
  it('keeps the roadmap when the closing stream fails, instead of discarding it', async () => {
    await lockInAPath((action) => {
      if (action === 'analyze') return jsonResponse({ signals: { ...SIGNALS, readyForRecommendation: true } });
      if (action === 'recommend') return jsonResponse({ paths: [PATH], country: 'India' });
      if (action === 'roadmap') return jsonResponse({ roadmap: ROADMAP });
      // The closing reflection dies mid-stream.
      return streamResponse(['Good choice — '], { failAfter: true });
    });

    // The roadmap arrived and is shown, even though its concurrent partner failed.
    // getAllByText: the duration appears in both the summary card and the panel.
    await waitFor(() => expect(screen.getAllByText(/12 weeks/).length).toBeGreaterThan(0));
    // The stream's failure is still surfaced somewhere — asserted as "an error is shown"
    // rather than a specific code, because a mid-stream socket failure classifies differently
    // from an HTTP error envelope and pinning the code here would test the classifier, not the
    // concurrency behaviour this case is about.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('surfaces the roadmap failure rather than the stream failure when both fail', async () => {
    await lockInAPath((action) => {
      if (action === 'analyze') return jsonResponse({ signals: { ...SIGNALS, readyForRecommendation: true } });
      if (action === 'recommend') return jsonResponse({ paths: [PATH], country: 'India' });
      if (action === 'roadmap') return errorResponse('UPSTREAM_TIMEOUT', 504);
      return streamResponse(['Good choice — '], { failAfter: true });
    });

    // The roadmap is the more valuable half, so its error is the one reported.
    await waitFor(() =>
      expect(screen.getByText(ERROR_MESSAGES.UPSTREAM_TIMEOUT)).toBeInTheDocument()
    );
  });

  it('stops both loading indicators once the concurrent pair settles', async () => {
    await lockInAPath((action) => {
      if (action === 'analyze') return jsonResponse({ signals: { ...SIGNALS, readyForRecommendation: true } });
      if (action === 'recommend') return jsonResponse({ paths: [PATH], country: 'India' });
      if (action === 'roadmap') return errorResponse('UPSTREAM_ERROR', 502);
      return streamResponse(['Good choice — '], { failAfter: true });
    });

    await waitFor(() => expect(screen.getByText(ERROR_MESSAGES.UPSTREAM_ERROR)).toBeInTheDocument());
    expect(screen.queryByText(/Building your roadmap/i)).not.toBeInTheDocument();
  });
});

/* =====================================================================================
 * Perceived latency (B7)
 * ===================================================================================== */

describe('ChatWindow perceived latency', () => {
  it('dismisses the typing indicator on the FIRST token, not at the end of the stream', async () => {
    // Two chunks with a gap: after the first arrives the reply is visibly on screen, so the
    // "still thinking" bubble must already be gone. It used to stay up for the whole stream.
    // Definite assignment: the resolver is set synchronously inside the executor, but TS's
    // control-flow analysis cannot see that and narrows a `| null` binding to `never`.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A ROADMAP-stage session is the one whose replies stream free text, so it is what
    // exercises the first-token behaviour.
    localStorage.setItem(
      STORAGE_KEYS.session,
      JSON.stringify({
        stage: 'ROADMAP',
        profile: PROFILE,
        signals: SIGNALS,
        messages: [{ id: 'opener', role: 'assistant', content: OPENER.message, createdAt: new Date().toISOString() }],
        deckCount: 1,
        shownPaths: ['Platform Engineer'],
        rejectedDirections: [],
        changeRequests: null,
        chosenPath: {
          title: 'Platform Engineer',
          tier: 'realistic',
          fitRationale: 'Four years of backend work at Northwind.',
          salaryRange: '₹20-30 LPA',
          upskills: ['Kubernetes'],
          firstMove: 'Ship one internal tool.',
          ambitionCheck: { verdict: 'aligned', note: 'Consistent with the evidence.' },
        },
        currentPaths: null,
        roadmap: {
          skillLevel: 'good',
          summary: 'Solid backend base.',
          weeklyHoursCommitment: '8-10 hours/week',
          totalWeeks: 12,
          totalDuration: '12 weeks (~3 months)',
          phases: [
            {
              type: 'course',
              title: 'Foundations',
              description: null,
              weeks: [{ week: 1, focus: 'Containers', items: ['Docker basics', 'Build an image'] }],
            },
          ],
        },
        roadmapVersion: 1,
        selectedPathIndex: 0,
        roadmapPanelOpen: false,
        understandingMessageCount: 3,
        noUsefulInfoStreak: 0,
        profileBuildStep: 0,
        profileBuildAnswers: [],
        profileBuildQuestions: [],
        pendingTurnOptions: null,
      })
    );

    const encoder = new TextEncoder();
    let call = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (actionOf(init) === 'analyze') return jsonResponse({ signals: SIGNALS });
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              call += 1;
              if (call === 1) return { done: false, value: encoder.encode('Here is the first part') };
              await gate;
              return { done: true, value: undefined };
            },
          }),
        },
      } as unknown as Response;
    });

    renderChat();
    await sendMessage('How should I pace week three?');

    // The first chunk is rendered and the indicator is gone, while the stream is still open.
    await waitFor(() => expect(screen.getByText(/Here is the first part/)).toBeInTheDocument());
    expect(screen.queryByLabelText(/thinking/i)).not.toBeInTheDocument();

    release();
  });

  it('shows a sized skeleton and named steps during the long deck wait', async () => {
    let releaseRecommend!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseRecommend = resolve;
    });

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const action = actionOf(init);
      if (action === 'analyze') return jsonResponse({ signals: { ...SIGNALS, readyForRecommendation: true } });
      if (action === 'recommend') {
        await held;
        return jsonResponse({ paths: [PATH], country: 'India' });
      }
      return streamResponse(['ok']);
    });

    renderChat();
    await sendFirstReply();
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    await sendMessage('I want more ownership of systems end to end.');

    // Named progress, not a bare spinner — the first step of PATH_GENERATION_STEPS.
    await waitFor(() =>
      expect(screen.getByText(/Reading back everything you said/i)).toBeInTheDocument()
    );

    releaseRecommend();
    await waitFor(() => expect(screen.getByRole('button', { name: /Platform Engineer/ })).toBeInTheDocument());

    // And the skeleton is gone once the real deck lands.
    expect(screen.queryByText(/Reading back everything you said/i)).not.toBeInTheDocument();
  });
});
