import React from 'react';
import { AppShell } from '@/components/shell/AppShell';

/** See components/shell/AppShell.tsx — the interactive surfaces need a bounded height that the
 * landing and prose pages must not have. */
export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
