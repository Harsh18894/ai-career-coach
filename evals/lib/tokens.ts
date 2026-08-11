import type { Profile } from '../adapter/coach';

/**
 * Extracts "grounding tokens" from a Profile: concrete, candidate-specific strings that a
 * generic opener could not plausibly contain. Used by B1 to check the opener actually cites
 * something real from THIS profile rather than writing fluent-but-generic prose.
 */
export function groundingTokens(profile: Profile): string[] {
  const tokens = new Set<string>();

  if (profile.currentRole) tokens.add(profile.currentRole);
  for (const role of profile.roleHistory) {
    tokens.add(role.title);
    if (role.company) tokens.add(role.company);
    if (role.durationMonths) {
      const years = role.durationMonths / 12;
      if (years >= 1) tokens.add(`${Math.round(years)} year`);
    }
  }
  for (const skill of profile.skills) tokens.add(skill);
  for (const domain of profile.domains) tokens.add(domain);
  for (const transition of profile.notableTransitions) {
    // Notable transitions are often full sentences; pull out capitalized multi-word phrases
    // and numbers rather than using the whole sentence as one brittle token.
    for (const phrase of extractPhrases(transition)) tokens.add(phrase);
  }
  for (const tension of profile.tensions) {
    for (const phrase of extractPhrases(tension)) tokens.add(phrase);
  }
  // Numbers anywhere in the profile (quota figures, percentages, etc.) are strong grounding
  // signals — a generic opener essentially never invents a specific number.
  for (const num of extractNumbers(JSON.stringify(profile))) tokens.add(num);

  return Array.from(tokens).filter((t) => t.trim().length >= 3);
}

function extractPhrases(sentence: string): string[] {
  const phrases: string[] = [];
  // Consecutive-capitalized-word runs (proper nouns / named things), e.g. "Notion templates".
  const capRun = sentence.match(/(?:[A-Z][a-zA-Z]+\s*){2,}/g);
  if (capRun) phrases.push(...capRun.map((p) => p.trim()));
  phrases.push(...extractNumbers(sentence));
  return phrases;
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+(\.\d+)?%?/g);
  return matches ? matches.filter((m) => m.length >= 2) : [];
}

/**
 * Separators a writer may use between the words of a multi-word token.
 *
 * This exists because B1 failed a genuinely well-grounded opener on a hyphen. The profile token
 * was "data engineering"; the opener said "data-engineering internship"; `\bdata engineering\b`
 * requires a literal space, so zero of twenty-one tokens matched and the eval reported the
 * opener as ungrounded. The opener was citing the candidate's actual internship.
 *
 * Hyphenating a compound modifier is ordinary English, not a failure to reference something.
 * Matching across the separators a human would use is what the check always meant.
 */
const WORD_SEPARATOR = '[\\s\\-\\u2010-\\u2015_/]+';

/**
 * Case-insensitive, word-boundary-aware, separator-insensitive containment check.
 *
 * Deliberately NOT loosened any further than that. The word boundaries stay (so "IC" still does
 * not match inside "ICELAND") and the ≥1-of-N threshold and the generic-phrasing blocklist in
 * B1 are untouched — this makes the matcher agree with what it claims to test, rather than
 * making the test easier to pass.
 */
export function containsToken(haystack: string, token: string): boolean {
  // Numbers and short tokens: plain substring (word boundaries are unreliable around punctuation
  // like "23%"). Everything else: word-boundary match so "IC" doesn't match inside "ICELAND".
  if (/^\d/.test(token)) {
    return haystack.toLowerCase().includes(token.toLowerCase());
  }

  const trimmed = token.trim();
  const pattern = trimmed
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(WORD_SEPARATOR);

  if (!pattern) return false;

  // `\b` only means anything next to a word character. A token like "C++" ends in '+', and
  // `\bC\+\+\b` can never match "strong C++ skills" — after the second '+' comes a space, and
  // two non-word characters are not a boundary. So the boundary is applied per edge, only
  // where the edge is actually a word character.
  //
  // This was a latent false negative, not something the separator change introduced: any skill
  // ending in punctuation ("C++", "F#") could never ground an opener, and B1 would have
  // reported it as ungrounded however well it was cited.
  const leading = /^\w/.test(trimmed) ? '\\b' : '';
  const trailing = /\w$/.test(trimmed) ? '\\b' : '';

  return new RegExp(`${leading}${pattern}${trailing}`, 'i').test(haystack);
}

/** Generic, could-be-sent-to-anyone openers that should always fail B1 regardless of tokens. */
export const GENERIC_OPENER_BLOCKLIST: RegExp[] = [
  /thanks for sharing/i,
  /i'?d love to help you explore/i,
  /based on your resume,? you have a strong background/i,
  /let'?s dive in/i,
];
