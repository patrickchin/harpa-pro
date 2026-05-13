/**
 * Slug generator for public identifiers.
 * Uses nanoid with Crockford base32 alphabet (no I/L/O/U).
 * Per design-p30-ids-slugs.md.
 */
import { customAlphabet } from 'nanoid';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const nano = customAlphabet(ALPHABET, 6);

export type SlugPrefix = 'prj' | 'rpt' | 'fil' | 'not';

/**
 * Generate a prefixed slug: `<prefix>_<6-char nanoid>`.
 * Alphabet: Crockford base32 (no I/L/O/U). Output is lowercase.
 */
export function generateSlug(prefix: SlugPrefix): string {
  return `${prefix}_${nano()}`;
}
