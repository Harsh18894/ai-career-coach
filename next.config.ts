import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  // pdfjs-dist (used by pdf-parse) lazily requires @napi-rs/canvas at runtime to polyfill
  // DOMMatrix/ImageData/Path2D for PDFs with gradients/patterns (e.g. LinkedIn export banners).
  // That require is hidden behind a dynamically constructed `createRequire(...)` call, which
  // Next.js's file tracer can't follow statically, so the native binary gets dropped from the
  // deployed function unless explicitly included here.
  outputFileTracingIncludes: {
    '/api/parse-resume': ['./node_modules/@napi-rs/canvas*/**/*'],
  },
};

export default nextConfig;
