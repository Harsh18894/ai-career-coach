import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['evals/suites/**/*.eval.ts'],
    // Sequential file execution: these tests make real, paid API calls. Running files in
    // parallel would make the cost estimate meaningless and could trip rate limits.
    fileParallelism: false,
    testTimeout: 240_000,
    hookTimeout: 30_000,
    reporters: ['default'],
  },
});
