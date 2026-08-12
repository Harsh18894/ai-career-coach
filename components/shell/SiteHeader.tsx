'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { StartHachiButton } from '@/components/StartHachi';

/* =====================================================================================
 * The header. Wordmark, three links, one action.
 *
 * "HACHI ●" — the orange dot is the wordmark's punctuation and the same dot that means "you"
 * in the trajectory diagram. It is the smallest possible carrier of the identity, which is why
 * it can sit in a 56px bar without a logo lockup.
 * ===================================================================================== */

const LINKS = [
  { href: '/review', label: 'Resume review' },
  { href: '/about', label: 'How it works' },
  { href: '/privacy', label: 'Privacy' },
];

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className="font-semibold tracking-[-0.01em] text-ink">{BRAND.name.toUpperCase()}</span>
      <span aria-hidden="true" className="h-[7px] w-[7px] translate-y-[-1px] rounded-full bg-hachi" />
    </span>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border-soft/70 bg-paper/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          <Wordmark className="text-[15px]" />
          <span className="sr-only">{BRAND.name} — home</span>
        </Link>

        <nav className="hidden items-center gap-7 sm:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded text-sm text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
            >
              {l.label}
            </Link>
          ))}
          <StartHachiButton
            label={`Try ${BRAND.name}`}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper transition-transform duration-150 hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          />
        </nav>

        {/* Mobile: one button, one panel. No drawer library, no overlay animation. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi sm:hidden"
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <span aria-hidden="true" className="relative block h-4 w-5">
            <span
              className={`absolute left-0 block h-[1.5px] w-5 bg-current transition-all duration-200 ${open ? 'top-[7px] rotate-45' : 'top-0.5'}`}
            />
            <span
              className={`absolute left-0 top-[7px] block h-[1.5px] w-5 bg-current transition-opacity duration-200 ${open ? 'opacity-0' : 'opacity-100'}`}
            />
            <span
              className={`absolute left-0 block h-[1.5px] w-5 bg-current transition-all duration-200 ${open ? 'top-[7px] -rotate-45' : 'top-[13px]'}`}
            />
          </span>
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-border-soft bg-paper px-4 pb-4 pt-2 sm:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded py-2.5 text-[15px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi"
            >
              {l.label}
            </Link>
          ))}
          <StartHachiButton
            label={`Try ${BRAND.name}`}
            className="mt-2 block w-full rounded-lg bg-ink px-4 py-3 text-center text-[15px] font-semibold text-paper"
          />
        </nav>
      )}
    </header>
  );
}
