import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Without `globals: true` in vitest.config.ts, @testing-library/react's automatic cleanup
// (which detects the test framework via globals) doesn't register itself — do it explicitly so
// each test starts from an empty document instead of accumulating previous renders.
afterEach(cleanup);

/**
 * localStorage shim.
 *
 * jsdom does not expose one here, and Node 26's own `localStorage` global is inert unless the
 * process is started with --localstorage-file, so both `window.localStorage` and
 * `globalThis.localStorage` come back undefined. Components under test persist session state,
 * so give them a real in-memory Storage rather than making every test stub it.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };

  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
  }
}

// jsdom implements no layout, so scrollIntoView does not exist. ChatWindow autoscrolls the
// transcript on every message change; without this every render throws.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
