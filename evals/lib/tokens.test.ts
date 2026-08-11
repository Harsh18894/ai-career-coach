import { describe, expect, it } from 'vitest';
import { containsToken } from './tokens';

/* =====================================================================================
 * B1's matcher decides whether an opener is "grounded". It reported a well-grounded opener as
 * citing nothing at all because of a hyphen, so it is worth pinning down exactly how loose it
 * is and, more importantly, exactly how loose it is not.
 * ===================================================================================== */

describe('containsToken', () => {
  it('matches across a hyphen, which is the case that produced a false B1 failure', () => {
    const opener =
      'you shipped a capstone backend/API to production and fixed a data-pipeline bug during your data-engineering internship';
    expect(containsToken(opener, 'data engineering')).toBe(true);
  });

  it('matches the plain-space form too', () => {
    expect(containsToken('worked in data engineering for two years', 'data engineering')).toBe(true);
  });

  it('matches across underscores and slashes', () => {
    expect(containsToken('the data_engineering track', 'data engineering')).toBe(true);
    expect(containsToken('a data/engineering hybrid role', 'data engineering')).toBe(true);
  });

  it('matches when the token itself is hyphenated and the text is not', () => {
    expect(containsToken('she led product marketing', 'product-marketing')).toBe(true);
  });

  it('still respects word boundaries — the reason the check is not a plain substring', () => {
    // The original motivation for the boundary: a two-letter token must not match inside a
    // longer word. Loosening separators must not have quietly loosened this.
    expect(containsToken('a trip to ICELAND', 'IC')).toBe(false);
    expect(containsToken('reactor design', 'React')).toBe(false);
  });

  it('does not match across arbitrary words', () => {
    // "data engineering" must not be satisfied by "data" and "engineering" appearing with
    // unrelated words between them — that would make the grounding check meaningless.
    expect(containsToken('the data showed that engineering was slow', 'data engineering')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(containsToken('DATA-ENGINEERING internship', 'data engineering')).toBe(true);
  });

  it('handles numeric tokens as plain substrings, including percentages', () => {
    expect(containsToken('grew revenue 23% year on year', '23%')).toBe(true);
    expect(containsToken('a team of 12 engineers', '12')).toBe(true);
  });

  it('does not throw on regex metacharacters in a token', () => {
    expect(() => containsToken('some text', 'C++ (advanced)')).not.toThrow();
    expect(containsToken('strong C++ (advanced) skills', 'C++ (advanced)')).toBe(true);
  });

  it('matches a token that ends in punctuation, which \\b alone cannot', () => {
    // Latent false negative found while fixing the hyphen case: `\bC\+\+\b` never matches,
    // because after the second '+' comes a space and two non-word chars are not a boundary.
    // Any skill ending in punctuation could never ground an opener.
    expect(containsToken('strong C++ and Rust skills', 'C++')).toBe(true);
    expect(containsToken('writes F# daily', 'F#')).toBe(true);
  });

  it('returns false for an empty token rather than matching everything', () => {
    expect(containsToken('any text at all', '   ')).toBe(false);
  });
});
