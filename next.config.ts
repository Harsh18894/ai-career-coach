import type { NextConfig } from "next";
import { withBotId } from 'botid/next/config';

const isProduction = process.env.NODE_ENV === 'production';

/* =====================================================================================
 * Content-Security-Policy
 *
 * Read the honest version first, because a CSP that is believed to be stronger than it is
 * does more harm than none at all:
 *
 * `script-src` carries 'unsafe-inline'. Next's App Router streams the RSC payload through
 * inline <script> tags, so a strict script-src needs a per-request nonce, and a per-request
 * nonce needs middleware, and middleware makes every page dynamic — trading the static
 * rendering of /, /about and /review for it. That trade is worth revisiting; it has not been
 * made here, and this comment exists so nobody assumes it was.
 *
 * So what is this CSP actually for? The asset worth stealing in this app is the candidate's
 * resume — in the DOM, and in localStorage. Stealing it requires getting it OUT, and getting
 * it out requires a network call to somewhere else. That is what `default-src 'none'` plus a
 * two-entry `connect-src` closes, and it stays closed whether or not script-src is strict.
 * `form-action 'self'` shuts the non-JS exfiltration path, and `frame-ancestors 'none'` stops
 * the page being framed and clickjacked.
 *
 * In short: this CSP is a good exfiltration control and a weak injection control. Both halves
 * are deliberate.
 * ===================================================================================== */
const csp = [
  "default-src 'none'",

  // 'unsafe-inline': see above. challenges.cloudflare.com is Turnstile (lib/turnstile.ts).
  // 'unsafe-eval' in development only — React Fast Refresh needs it, production does not.
  //
  // Vercel BotId needs NO entry here. `withBotId` (bottom of this file) rewrites its challenge
  // script and its telemetry to same-origin paths under /149e9513-…/, so 'self' already covers
  // both the <script> and the fetches. Adding api.vercel.com would be adding an exfiltration
  // destination for no reason — the browser never talks to it directly.
  `script-src 'self' 'unsafe-inline' ${isProduction ? '' : "'unsafe-eval' "}https://challenges.cloudflare.com`,

  // Tailwind ships as a stylesheet, but Next injects inline <style> for critical CSS and
  // next/font. There is no nonce-free way around this one either.
  "style-src 'self' 'unsafe-inline'",

  // data: for inline SVG/icon payloads; blob: for anything the PDF path creates client-side.
  "img-src 'self' data: blob:",

  // next/font/google self-hosts at build time, so no external font origin is needed. If a font
  // ever fails to load, resist adding fonts.gstatic.com here — check the build instead.
  "font-src 'self' data:",

  // The one that matters. 'self' is this app's own API routes; Cloudflare is Turnstile's
  // verification traffic. Adding a third entry to this line should require an argument.
  "connect-src 'self' https://challenges.cloudflare.com",

  // Turnstile renders its (invisible) challenge in an iframe.
  "frame-src https://challenges.cloudflare.com",

  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Only in production: on http://localhost this is a no-op in every browser worth worrying
  // about, but leaving it out of dev removes the question entirely.
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },

  // Stops a browser second-guessing a Content-Type — the reason an API route returning JSON
  // can never be coaxed into being treated as HTML.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Send the full URL to ourselves, only the origin cross-site, and nothing when downgrading
  // to http. Resume review URLs carry no identifiers today, and this keeps it that way if one
  // ever does.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // This app needs none of these. Denying them outright means a future dependency cannot
  // quietly start asking a visitor for their camera.
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'usb=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  },

  // Redundant with frame-ancestors for any current browser, kept for the ones that only
  // understand this.
  { key: 'X-Frame-Options', value: 'DENY' },

  // Production only. HSTS is ignored over plain http anyway, but emitting it in development
  // is the kind of thing that eventually pins localhost to https in somebody's browser.
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  // Removes `X-Powered-By: Next.js`. Version disclosure is not an attack, but it is free to
  // stop offering it.
  poweredByHeader: false,

  // Already the default; stated explicitly because "are the source maps off?" is a question
  // worth being able to answer from the config rather than from a build directory. Server
  // code is never in the browser bundle regardless — this is about not shipping a readable
  // map of the client either.
  productionBrowserSourceMaps: false,

  /* /coach was folded into "/" — the session and the page that explains it are the same
   * place now. Anything already linking to the old route (a Reddit comment, a bookmark) lands
   * on the home page rather than a 404. */
  async redirects() {
    return [{ source: '/coach', destination: '/', permanent: false }];
  },

  async headers() {
    return [
      {
        // Everything, including API routes: the headers that matter for a JSON response
        // (nosniff, and a CSP that stops it being rendered) matter there too.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },

  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  // pdfjs-dist (used by pdf-parse) reaches several of its own assets via paths built at
  // runtime — `await import(this.workerSrc)` for its worker, plus cmaps/standard_fonts for
  // embedded/non-standard fonts, and @napi-rs/canvas (behind a dynamic createRequire) to
  // polyfill DOMMatrix/ImageData/Path2D for gradients/patterns (e.g. LinkedIn export banners).
  // None of these are visible to Next.js's static file tracer, so they get dropped from the
  // deployed function unless explicitly included here.
  outputFileTracingIncludes: {
    '/api/parse-resume': [
      './node_modules/@napi-rs/canvas*/**/*',
      './node_modules/pdfjs-dist/legacy/build/*.mjs',
      './node_modules/pdfjs-dist/cmaps/**/*',
      './node_modules/pdfjs-dist/standard_fonts/**/*',
    ],
  },
};

/*
 * withBotId does three things, and it is worth knowing which:
 *   1. rewrites /149e9513-…/a-4-a/c.js  -> Vercel's challenge script
 *   2. rewrites /149e9513-…/:path*      -> Vercel's proxy
 *   3. appends a headers rule for those paths setting X-Frame-Options: SAMEORIGIN and
 *      Content-Security-Policy: frame-ancestors 'self'
 *
 * (3) matters here. This app's own rule uses `source: '/:path*'`, which also matches the BotId
 * paths — and because withBotId appends AFTER it, its narrower rule wins on those paths and
 * relaxes frame-ancestors from 'none' to 'self' for the challenge iframe. That is exactly what
 * BotId needs and it does not touch any app route, but it is the one place the security headers
 * above are not the last word, so it is written down rather than discovered.
 */
export default withBotId(nextConfig);
