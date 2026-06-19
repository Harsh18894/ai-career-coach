import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AI Career Coach | Find Your Next Strategic Move',
  description: 'Upload your resume PDF for a natural, guided chat with a senior career mentor and discover exactly 3 tailored career growth paths.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh antialiased`}
    >
      <body className="h-dvh overflow-hidden flex flex-col bg-white text-slate-900 selection:bg-indigo-100">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <header className="w-full flex-shrink-0 border-b border-slate-200 bg-white/85 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <Compass className="w-6 h-6 text-indigo-600 group-hover:rotate-12 transition-transform duration-200" />
              <span className="font-bold text-slate-900 tracking-tight text-lg">
                Career<span className="text-indigo-600">Coach</span>
              </span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link
                href="/about"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors duration-150"
              >
                About the Logic
              </Link>
            </nav>
          </div>
        </header>
        <main id="main-content" className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {children}
        </main>
        <footer className="w-full flex-shrink-0 py-6 border-t border-slate-200 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} CareerCoach AI. Demo-ready prototype.
        </footer>
      </body>
    </html>
  );
}
