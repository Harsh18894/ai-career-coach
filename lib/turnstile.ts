'use client';

/**
 * Browser half of the Turnstile gate.
 *
 * The design constraint from the brief is the important part: a legitimate user must never see
 * a challenge. So this runs the widget in invisible mode, mints a token in the background, and
 * hands it to the two or three requests that need one. Nothing renders, nothing is clicked, and
 * nothing blocks the page.
 *
 * Everything here degrades to `null` rather than throwing. A missing token is a decision the
 * SERVER makes (see lib/bot-protection.ts) — the browser's job is to try, and to get out of the
 * way when it cannot. If the script is blocked by an extension, a user still gets to the app and
 * a clear message, rather than a blank screen caused by their ad blocker.
 */

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile-script';

/** Long enough for a cold script load on a slow connection, short enough that a blocked script
 * does not hold up a session start. Past this the request goes without a token and the server
 * decides — which, when Turnstile is unconfigured, is "fine". */
const TOKEN_TIMEOUT_MS = 6_000;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
      size?: 'invisible' | 'normal' | 'compact' | 'flexible';
      appearance?: 'always' | 'execute' | 'interaction-only';
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type State = {
  widgetId: string | null;
  container: HTMLElement | null;
  /** Resolvers waiting on the next token. */
  waiters: ((token: string | null) => void)[];
  scriptPromise: Promise<boolean> | null;
  /** True once the widget has reported it cannot work here — a blocked script, a bad site key,
   * a network that filters Cloudflare. Latched so we stop waiting on every later call. */
  unavailable: boolean;
};

const state: State = {
  widgetId: null,
  container: null,
  waiters: [],
  scriptPromise: null,
  unavailable: false,
};

function siteKey(): string | null {
  // Inlined at build time by Next. Absent in local development, which disables the whole gate —
  // matching the server, where an absent secret key skips verification.
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}

export function isBotProtectionEnabled(): boolean {
  return Boolean(siteKey());
}

function settle(token: string | null): void {
  const waiters = state.waiters;
  state.waiters = [];
  for (const resolve of waiters) resolve(token);
}

function loadScript(): Promise<boolean> {
  if (state.scriptPromise) return state.scriptPromise;

  state.scriptPromise = new Promise<boolean>((resolve) => {
    if (typeof document === 'undefined') return resolve(false);
    if (window.turnstile) return resolve(true);

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.turnstile)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(Boolean(window.turnstile));
    // The common real-world case: a content blocker ate the request. Not an error worth
    // showing anyone — the server-side fallback covers it.
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return state.scriptPromise;
}

function ensureWidget(): void {
  const key = siteKey();
  if (!key || !window.turnstile || state.widgetId !== null) return;

  if (!state.container) {
    const container = document.createElement('div');
    // Invisible mode renders nothing, but the container is still positioned out of the way so
    // that a widget-mode misconfiguration in the Cloudflare dashboard degrades into something
    // off-screen rather than a checkbox appearing in the middle of the page.
    container.style.position = 'absolute';
    container.style.width = '0';
    container.style.height = '0';
    container.style.overflow = 'hidden';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
    state.container = container;
  }

  try {
    state.widgetId = window.turnstile.render(state.container, {
      sitekey: key,
      size: 'invisible',
      // 'execute' keeps it from painting anything until asked; combined with invisible sizing
      // the user never sees a thing in the happy path.
      appearance: 'execute',
      callback: (token: string) => settle(token),
      'error-callback': () => {
        state.unavailable = true;
        settle(null);
      },
      'expired-callback': () => {
        // Tokens live ~5 minutes. Nothing is waiting at this point; the reset just means the
        // next request finds a fresh one rather than a stale one.
        if (state.widgetId) window.turnstile?.reset(state.widgetId);
      },
    });
  } catch {
    state.unavailable = true;
  }
}

/**
 * Warms the widget so a token is ready before it is needed.
 *
 * Called on mount of the pages that can start a session. Without it the first token would be
 * minted during the session-start request itself, adding a visible pause to exactly the moment
 * the app should feel fastest.
 */
export function primeBotProtection(): void {
  if (!siteKey() || state.unavailable) return;
  void loadScript().then((ready) => {
    if (ready) ensureWidget();
    else state.unavailable = true;
  });
}

/**
 * A fresh single-use token, or null.
 *
 * Null is a normal outcome, not an error: protection is unconfigured, the script is blocked, or
 * Cloudflare is having a bad day. The server decides what null means.
 */
export async function getHumanToken(): Promise<string | null> {
  if (!siteKey() || state.unavailable) return null;

  const ready = await loadScript();
  if (!ready || !window.turnstile) {
    state.unavailable = true;
    return null;
  }

  ensureWidget();
  if (state.widgetId === null) return null;

  // Tokens are single-use, so every gated request needs its own. Resetting asks the widget for
  // a new one; the callback above resolves whoever is waiting.
  try {
    window.turnstile.reset(state.widgetId);
  } catch {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      state.waiters = state.waiters.filter((w) => w !== onToken);
      resolve(null);
    }, TOKEN_TIMEOUT_MS);

    const onToken = (token: string | null) => {
      clearTimeout(timer);
      resolve(token);
    };

    state.waiters.push(onToken);
  });
}

/** Header form, spread into a fetch's headers alongside sessionHeaders(). Empty when there is
 * no token, so the header is simply absent rather than present-and-empty. */
export async function humanTokenHeaders(): Promise<Record<string, string>> {
  const token = await getHumanToken();
  return token ? { 'x-aria-turnstile': token } : {};
}
