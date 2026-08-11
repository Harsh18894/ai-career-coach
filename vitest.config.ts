import { defineConfig } from 'vitest/config';

// Component tests (React/DOM) — separate from evals/vitest.config.ts, which scopes itself to
// evals/suites/**/*.eval.ts and is invoked explicitly via `--config evals/vitest.config.ts`, so
// the two never collide.
export default defineConfig({
  test: {
    // Component tests run in jsdom; lib tests are plain Node modules but are cheap enough to
    // run in the same environment rather than maintaining a second project config.
    include: ['components/**/*.test.tsx', 'lib/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
