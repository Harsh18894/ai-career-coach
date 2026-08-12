/* =====================================================================================
 * Carries the resume text between the coaching intake and the review surface, so someone who
 * has already uploaded a PDF is not asked to upload it again to get it reviewed.
 *
 * sessionStorage, not localStorage: this is a whole resume, and it should not outlive the tab.
 * The coaching session state in lib/session.ts is deliberately separate and longer-lived.
 * ===================================================================================== */

import { STORAGE_KEYS } from './brand';

const STORAGE_KEY = STORAGE_KEYS.lastResumeText;

export function stashResumeText(text: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (text.trim()) window.sessionStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Private mode or quota — the review surface simply asks for the resume again.
  }
}

export function readStashedResumeText(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStashedResumeText(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
