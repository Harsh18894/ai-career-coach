import React from 'react';

/**
 * A bounded, viewport-height flex context for the interactive surfaces.
 *
 * The chat's composer is pinned and its transcript scrolls internally, so ChatWindow's root
 * (`flex-1 min-h-0`) needs a parent with a real height. That used to come from `h-dvh
 * overflow-hidden` on <body> — which also made every OTHER page a nested scroller, so on mobile
 * the URL bar never collapsed and the landing fold lost ~60px.
 *
 * Applying the constraint per-route fixes both: /review gets the bounded box it
 * needs, and the home page and the prose pages scroll the document normally. (The coaching
 * session lives on "/" now and sets its own bounded height in HomeExperience.)
 *
 * The offset matches the header's own height (h-14 mobile, h-16 from sm).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col sm:min-h-[calc(100dvh-4rem)]">
      {children}
    </div>
  );
}
