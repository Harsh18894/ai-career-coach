'use client';

import React from 'react';
import Link from 'next/link';
import { track } from '@/lib/analytics';
import type { FunnelEvent } from '@/lib/analytics-events';

/**
 * A Link that records the click before navigating.
 *
 * Still a real <a> underneath, so it keeps keyboard access, middle-click, open-in-new-tab and
 * the focus ring — an onClick handler on a <div> would have lost all four. The event is
 * fire-and-forget with `keepalive`, so navigating away immediately does not drop it.
 */
export function CtaLink({
  href,
  event,
  className,
  children,
}: {
  href: string;
  event: FunnelEvent;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => track(event)}>
      {children}
    </Link>
  );
}
