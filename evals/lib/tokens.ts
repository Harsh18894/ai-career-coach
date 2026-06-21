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

/** Case-insensitive, word-boundary-aware substring check. */
export function containsToken(haystack: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Numbers and short tokens: plain substring (word boundaries are unreliable around punctuation
  // like "23%"). Everything else: word-boundary match so "IC" doesn't match inside "ICELAND".
  if (/^\d/.test(token)) {
    return haystack.toLowerCase().includes(token.toLowerCase());
  }
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  return re.test(haystack);
}

/** Generic, could-be-sent-to-anyone openers that should always fail B1 regardless of tokens. */
export const GENERIC_OPENER_BLOCKLIST: RegExp[] = [
  /thanks for sharing/i,
  /i'?d love to help you explore/i,
  /based on your resume,? you have a strong background/i,
  /let'?s dive in/i,
];
