import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Component tests (React/DOM) — separate from evals/vitest.config.ts, which scopes itself to
// evals/suites/**/*.eval.ts and is invoked explicitly via `--config evals/vitest.config.ts`, so
// the two never collide.
export default defineConfig({
  // Mirrors the `@/*` path alias in tsconfig.json — component tests import the components
  // under test, which resolve their own imports through it.
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    // Component tests run in jsdom; lib tests are plain Node modules but are cheap enough to
    // run in the same environment rather than maintaining a second project config.
    // evals/lib/** is included too: those are pure helper unit tests (no network, no model)
    // that guard the measuring instruments. evals/vitest.config.ts scopes itself to
    // evals/suites/**/*.eval.ts, so the two configs still never pick up each other's files.
    include: ['components/**/*.test.tsx', 'lib/**/*.test.ts', 'evals/lib/**/*.test.ts'],
    environment: 'jsdom',
    // An explicit origin is required for localStorage to exist — on the default opaque origin
    // jsdom leaves `window.localStorage` undefined, and ChatWindow persists session state to it.
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    setupFiles: ['./vitest.setup.ts'],
  },
});
