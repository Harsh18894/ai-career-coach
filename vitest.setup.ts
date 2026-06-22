import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Without `globals: true` in vitest.config.ts, @testing-library/react's automatic cleanup
// (which detects the test framework via globals) doesn't register itself — do it explicitly so
// each test starts from an empty document instead of accumulating previous renders.
afterEach(cleanup);
