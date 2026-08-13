import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { BotIdClient } from 'botid/client';
import './globals.css';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { SiteFooter } from '@/components/shell/SiteFooter';
import { BRAND } from '@/lib/brand';
import { BOTID_PROTECTED_ROUTES } from '@/lib/protected-routes';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.titleTagline}`,
  description: BRAND.description,
  applicationName: BRAND.name,
  // Link previews are how this arrives in a Reddit comment thread, so they carry the same
  // concrete description as the page rather than a separate marketing line.
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    siteName: BRAND.name,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/*
          Arms Vercel BotId for the routes in lib/protected-routes.ts. Renders nothing and shows
          nothing — there is no challenge for a visitor to notice, which is what makes it
          affordable on every expensive route rather than only on session creation.

          In <head> and in the ROOT layout on purpose: the signal has to be collecting before the
          first protected request, and a visitor can reach one from any page (the header's "Try
          Hachi" chooser opens everywhere).
        */}
        <BotIdClient protect={BOTID_PROTECTED_ROUTES} />
      </head>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-paper"
        >
          Skip to content
        </a>

        <SiteHeader />

        <main id="main-content">{children}</main>

        <SiteFooter />
      </body>
    </html>
  );
}
