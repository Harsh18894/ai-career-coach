import React from 'react';
import Link from 'next/link';
import { Wordmark } from './SiteHeader';

/* One row on desktop, stacked on mobile. Everything that was explanatory copy in the old
 * footer now lives in the sections that earn it. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border-soft bg-paper">
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark className="text-sm" />

          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
            <Link href="/review" className="rounded transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi">
              Resume review
            </Link>
            <Link href="/about" className="rounded transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi">
              How it works
            </Link>
            <Link href="/privacy" className="rounded transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi">
              Privacy
            </Link>
            <a
              href="https://github.com/harshdeep-singh/hachi"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
            >
              GitHub
            </a>
          </nav>

          <p className="text-sm text-ink-muted">Built by Harsh</p>
        </div>

        <p className="mt-6 text-xs text-ink-muted/80">© {new Date().getFullYear()} Hachi</p>
      </div>
    </footer>
  );
}
