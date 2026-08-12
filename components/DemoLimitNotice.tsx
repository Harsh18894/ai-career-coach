'use client';

import React from 'react';
import Link from 'next/link';
import { HachiResting } from './Illustrations';
import { BRAND } from '@/lib/brand';
import type { ErrorCode } from '@/lib/errors';

/* =====================================================================================
 * The two "you've hit a wall, and it isn't your fault" states: the daily budget being spent,
 * and an hourly rate limit.
 *
 * These are the moments the reusable illustration exists for. A Reddit spike means a lot of
 * people meet one of these two screens, and for many of them it will be the only screen they
 * ever see. The difference between a generic red error box and an honest sentence with a
 * companion next to it is the difference between "this is broken" and "this is a free thing
 * someone made, and I came at a busy moment".
 *
 * Neither of these is an error, so neither is styled as one. No red, no warning triangle, no
 * "something went wrong" — both are the system working exactly as designed, and saying so is
 * more respectful than dressing a spend cap up as a fault.
 * ===================================================================================== */

export function isDemoLimit(code: ErrorCode): boolean {
  return code === 'BUDGET_EXCEEDED' || code === 'RATE_LIMITED';
}

export function DemoLimitNotice({
  code,
  retryAfterSeconds,
}: {
  code: 'BUDGET_EXCEEDED' | 'RATE_LIMITED';
  retryAfterSeconds?: number;
}) {
  const budget = code === 'BUDGET_EXCEEDED';

  return (
    <section
      role="status"
      className="my-8 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70"
    >
      <div className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:items-center sm:gap-6 sm:p-7 sm:text-left">
        <HachiResting className="h-20 w-auto flex-shrink-0" />

        <div className="min-w-0">
          <h2 className="text-base font-semibold text-amber-950">
            {budget ? 'That’s today’s budget spent.' : 'Steady on — that’s the hourly limit.'}
          </h2>

          <div className="mt-2 space-y-2 text-sm leading-relaxed text-amber-900">
            {budget ? (
              <>
                <p>
                  {BRAND.name} is a free side project and every session costs me a few cents of
                  API credit, so there&rsquo;s a daily ceiling to stop one busy day emptying my
                  card. It has been reached — which usually means a lot of people showed up at
                  once.
                </p>
                <p>
                  It resets at midnight UTC. Nothing you did caused this, and nothing you typed
                  was lost.
                </p>
              </>
            ) : (
              <>
                <p>
                  There&rsquo;s an hourly cap per visitor, which is what keeps this free and open
                  to everyone without a signup wall.
                  {typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0 && (
                    <> Try again in about {formatWait(retryAfterSeconds)}.</>
                  )}
                </p>
                <p>Your conversation is saved in this browser — it will be here when you come back.</p>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-3 sm:justify-start">
            <a
              href="https://github.com/harshdeep-singh/hachi"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-900 transition-colors hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Read the code instead
            </a>
            <Link
              href="/about"
              className="rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-900 transition-colors hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              How it works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Whole minutes, rounded up — "in about 12 minutes" is useful, "in 683 seconds" is not. */
function formatWait(seconds: number): string {
  if (seconds < 90) return 'a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}
