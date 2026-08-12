'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Back navigation for every page that is not the home page.
 *
 * Uses browser history when there is any — so "back" returns you to wherever you actually came
 * from — and falls back to an explicit href when there is not, which is the case for a link
 * opened cold in a new tab. A control labelled "Back" that dead-ends on the first page of a
 * session is worse than no control.
 */
export function BackLink({ href = '/', label = 'Back' }: { href?: string; label?: string }) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(e) => {
        // Only intercept when there is history to go back to, and never for modified clicks
        // (new tab, new window) — those should behave like the plain link they look like.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (typeof window !== 'undefined' && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
    >
      <span aria-hidden="true">‹</span>
      {label}
    </Link>
  );
}
