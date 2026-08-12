'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

/**
 * A client island whose only job is to record the landing view.
 *
 * Kept to this so app/page.tsx stays a server component and the fold still paints from HTML
 * with no client JS on the critical path. This mounts after hydration, which is the correct
 * moment anyway — a view recorded before the page is interactive counts bots and prefetches.
 */
export function LandingView() {
  useEffect(() => {
    track('landing_view');
  }, []);
  return null;
}
