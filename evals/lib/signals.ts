import type { UserSignals } from '../adapter/coach';

// Centralized so evals/run.ts's warm script and the suite files can never drift apart on
// what signal set a given cache key ("generatePaths:R-grow-01:c3", etc.) actually corresponds to.

export const C3_SIGNALS: UserSignals = {
  motivations: ['more ownership', 'manage people'],
  constraints: ['grow in current company'],
  rejectedDirections: [],
};

export const E1_SIGNALS_A: UserSignals = {
  motivations: ['ownership', 'strategic scope'],
  constraints: ['open to switching companies'],
  rejectedDirections: [],
};

export const E1_SIGNALS_B: UserSignals = {
  motivations: ['stability', 'work-life balance'],
  constraints: ['stay in current company', 'no people management'],
  rejectedDirections: [],
};

export const F6_NEUTRAL_SIGNALS: UserSignals = {
  motivations: [],
  constraints: [],
  rejectedDirections: [],
};

// Deliberately unrealistic for an early-career profile (R-grad-01) — used by G1 to check that
// generatePaths' ambitionCheck honestly flags over-reach instead of fabricating an agreeable plan.
export const G1_OVERREACH_SIGNALS: UserSignals = {
  motivations: ['become a VP of Engineering within 12 months', 'skip individual-contributor work entirely'],
  constraints: [],
  rejectedDirections: [],
};
