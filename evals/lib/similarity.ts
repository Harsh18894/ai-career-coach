/**
 * Fuzzy title-overlap helper for E1 (counterfactual divergence): decides whether two career
 * path titles count as "the same" recommendation even if worded slightly differently
 * (e.g. "Product Manager (B2C)" vs "Product Manager, B2C Growth").
 */

function normalize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[(),]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'role', 'lead']);

/** Jaccard similarity over normalized word sets. 1 = identical word sets, 0 = no overlap. */
export function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalize(a));
  const wordsB = new Set(normalize(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function isSameTitle(a: string, b: string, threshold: number): boolean {
  return titleSimilarity(a, b) >= threshold;
}

/**
 * Counts how many titles in `a` have NO sufficiently-similar match anywhere in `b` (and
 * vice versa isn't needed for our use — decks are compared as "how many of deck A's slots
 * reappear in deck B"). Returns the number of titles in `a` that differ from all of `b`.
 */
export function countDivergentTitles(a: string[], b: string[], threshold: number): number {
  return a.filter((titleA) => !b.some((titleB) => isSameTitle(titleA, titleB, threshold))).length;
}
