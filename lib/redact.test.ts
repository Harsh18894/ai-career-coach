import { describe, expect, it } from 'vitest';
import { fingerprint, redact, redactInline } from './redact';

const RESUME_HEAD = 'Sofia Marchetti\nMilan, Italy | sofia.marchetti@example.com | +39 320 000 0000';

describe('redact', () => {
  it('returns a shape and a fingerprint, never the text', () => {
    const result = redact(RESUME_HEAD);
    const serialized = JSON.stringify(result);

    for (const pii of ['Sofia', 'Marchetti', 'sofia.marchetti', 'example.com', '+39', 'Milan']) {
      expect(serialized).not.toContain(pii);
    }
    expect(result.chars).toBeGreaterThan(0);
    expect(result.words).toBeGreaterThan(0);
  });

  it('counts the collapsed text, so a wrapped span and its unwrapped twin agree', () => {
    expect(redact('a  b\n c').chars).toBe(redact('a b c').chars);
    expect(redact('a  b\n c').words).toBe(3);
  });

  it('reports zero words for empty or whitespace-only input rather than one', () => {
    expect(redact('   ').words).toBe(0);
    expect(redact('').words).toBe(0);
  });
});

describe('fingerprint', () => {
  it('is stable for the same text', () => {
    expect(fingerprint('Reduced latency by 40%')).toBe(fingerprint('Reduced latency by 40%'));
  });

  it('ignores whitespace and case, so a re-wrapped bullet fingerprints the same', () => {
    // This is what makes the fingerprint useful for the question it replaced: "is this the
    // same span the model quoted last run?"
    expect(fingerprint('Reduced  latency\nby 40%')).toBe(fingerprint('reduced latency by 40%'));
  });

  it('differs for different text', () => {
    expect(fingerprint('Reduced latency by 40%')).not.toBe(fingerprint('Reduced latency by 50%'));
  });

  it('is short and hex, so it reads as a fingerprint rather than as data', () => {
    expect(fingerprint('anything')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('redactInline', () => {
  it('formats as an obvious redaction rather than a truncation', () => {
    // Deliberately ugly: a reader should never mistake this for a shortened quote and be
    // tempted to widen it back into one.
    expect(redactInline('one two three')).toMatch(/^<13c\/3w#[0-9a-f]{8}>$/);
  });

  it('leaks nothing from a realistic resume header', () => {
    const inline = redactInline(RESUME_HEAD);
    for (const pii of ['Sofia', 'Marchetti', 'example.com', '+39', 'Milan']) {
      expect(inline).not.toContain(pii);
    }
  });
});
