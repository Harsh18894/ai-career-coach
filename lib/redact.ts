import { createHash } from 'node:crypto';

/**
 * Turning user text into something safe to log.
 *
 * The rule this exists to enforce: **no log line contains a candidate's own words.** A resume is
 * personal data — names, employers, dates, sometimes an address — and Vercel retains logs. A
 * debugging convenience is not worth putting somebody's CV in a retained system, and "only the
 * first 120 characters" is not a mitigation when the first 120 characters of a resume are the
 * name, email, and phone number.
 *
 * What replaces it has to stay useful, or it will be worked around. A fingerprint plus a shape
 * answers the questions the raw text was there for:
 *   - "is this the same span the model quoted last run?"      -> compare hashes
 *   - "is the drop rule firing on empty/huge/odd input?"      -> read chars/words
 *   - "did this change between two runs of the same resume?"  -> compare hashes
 * What it cannot answer is "what did it actually say", which is the point.
 */

/** Short, stable, and not reversible to the original text. Eight hex characters is enough to
 * distinguish spans within one resume without inviting anyone to treat it as an identifier. */
export function fingerprint(text: string): string {
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex').slice(0, 8);
}

export type RedactedText = {
  chars: number;
  words: number;
  sha256: string;
};

/** The log-safe stand-in for a span of user text. */
export function redact(text: string): RedactedText {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return {
    chars: collapsed.length,
    words: collapsed ? collapsed.split(' ').length : 0,
    sha256: fingerprint(text),
  };
}

/**
 * Compact single-string form, for embedding in a `detail` message that is already prose.
 *
 * Reads as `<42c/7w#1a2b3c4d>` — deliberately ugly, so that a line containing one is obviously
 * a redaction and not a truncation someone might be tempted to widen later.
 */
export function redactInline(text: string): string {
  const { chars, words, sha256 } = redact(text);
  return `<${chars}c/${words}w#${sha256}>`;
}
