/**
 * Client-side session identity for telemetry.
 *
 * Deliberately separate from the conversation state in lib/state/conversation.ts and stored
 * under its own localStorage key: this is an analytics concern, and folding an id into the
 * conversation blob would mean the state machine's shape changes for a reason that has nothing
 * to do with coaching. It also survives independently — clearing the conversation starts a new
 * session id, which is exactly the boundary "cost per completed session" should measure.
 *
 * The id is opaque and random. It identifies a browser session's conversation for cost
 * attribution only — it carries no personal data and is not used for auth or access control.
 */

import { STORAGE_KEYS } from './brand';

const STORAGE_KEY = STORAGE_KEYS.sessionMeta;

export type SessionMeta = {
  id: string;
  /** True for sessions started from the "try with a sample resume" button, so demo traffic is
   * excluded from real usage metrics. Set at session start and fixed for its lifetime. */
  isSample: boolean;
  /** Which sample profile (lib/samples) this session was started from, when isSample. Lets the
   * in-session badge name the profile, and lets logs be split per sample. */
  sampleId?: string;
};

function newId(): string {
  // randomUUID needs a secure context; localhost and https both qualify, but fall back rather
  // than throw so telemetry can never break the app.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function read(): SessionMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as SessionMeta).id === 'string' &&
      (parsed as SessionMeta).id
    ) {
      const meta = parsed as SessionMeta;
      return {
        id: meta.id,
        isSample: meta.isSample === true,
        ...(typeof meta.sampleId === 'string' ? { sampleId: meta.sampleId } : {}),
      };
    }
  } catch {
    // Corrupt or unavailable storage — fall through and mint a fresh one.
  }
  return null;
}

function write(meta: SessionMeta): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Private-mode / quota failures are non-fatal: the id stays in-memory for this page load.
  }
}

/** Current session meta, minting one on first use. */
export function getSessionMeta(): SessionMeta {
  const existing = read();
  if (existing) return existing;
  const meta: SessionMeta = { id: newId(), isSample: false };
  write(meta);
  return meta;
}

/** Begins a new measurable session. Called when the user resets, and by the sample-resume
 * entry point (which passes isSample). */
export function startNewSession(options: { isSample?: boolean; sampleId?: string } = {}): SessionMeta {
  const meta: SessionMeta = {
    id: newId(),
    isSample: options.isSample === true,
    ...(options.sampleId ? { sampleId: options.sampleId } : {}),
  };
  write(meta);
  return meta;
}

export function isSampleSession(): boolean {
  return getSessionMeta().isSample;
}

/** The sample profile id backing this session, or null for a real one. */
export function currentSampleId(): string | null {
  const meta = getSessionMeta();
  return meta.isSample ? meta.sampleId ?? null : null;
}

/**
 * Headers attached to every API request. Sent as headers rather than body fields so the
 * multipart resume upload carries them too, and so the server can attribute a request before
 * reading its body.
 */
export function sessionHeaders(): Record<string, string> {
  const meta = getSessionMeta();
  return {
    'x-hachi-session-id': meta.id,
    'x-hachi-sample': meta.isSample ? '1' : '0',
    ...(meta.sampleId ? { 'x-hachi-sample-id': meta.sampleId } : {}),
  };
}
