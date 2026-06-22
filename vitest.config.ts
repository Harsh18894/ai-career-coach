import { defineConfig } from 'vitest/config';

// Component tests (React/DOM) — separate from evals/vitest.config.ts, which scopes itself to
// evals/suites/**/*.eval.ts and is invoked explicitly via `--config evals/vitest.config.ts`, so
// the two never collide.
export default defineConfig({
  test: {
    include: ['components/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
