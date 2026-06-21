import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
