import type { IntakeSource } from './intake';

/* =====================================================================================
 * A resume picked in one place, consumed in another.
 *
 * The "Try Hachi" chooser is mounted by the site header, so it opens on every route — but the
 * conversation only exists on "/". When someone picks a PDF from /review, the File has to
 * survive exactly one client-side navigation.
 *
 * A File cannot be put in a URL, in sessionStorage, or in history.state. IndexedDB can hold one,
 * but adds an async round trip and a persistence lifetime you then have to expire. Uploading
 * inside the dialog would drag fetch, progress UI and error state into a modal that is about to
 * unmount. A module-level holder is synchronous, typed, and survives router.push, because App
 * Router navigations stay in the same JS context.
 *
 * On a hard reload the holder is empty — and because the flow reuses the existing ?start=own
 * param, an empty holder is indistinguishable from that deep link: the visitor lands on the
 * intake screen. No error, no half-started state.
 * ===================================================================================== */

let pending: IntakeSource | null = null;

export function setPendingIntake(source: IntakeSource): void {
  pending = source;
}

/**
 * Read and clear in one step. Take-once matters: the consumer runs in a mount effect, which
 * React invokes twice in development StrictMode, and a resume must not be uploaded twice.
 */
export function takePendingIntake(): IntakeSource | null {
  const source = pending;
  pending = null;
  return source;
}
