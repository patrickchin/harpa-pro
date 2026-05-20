/**
 * Unit tests for `deriveTitleFromSummary`.
 *
 * The aggregator route uses this helper to populate `app.notes.title`
 * from the summary string. The column allows up to 200 chars (per the
 * CHECK constraint in migration 0004); the helper itself caps at
 * `MAX_TITLE_CHARS` (80) so list views show a single line.
 */
import { describe, expect, it } from 'vitest';
import { MAX_TITLE_CHARS, deriveTitleFromSummary } from './voiceSummary.js';

describe('deriveTitleFromSummary', () => {
  it('returns null for null / undefined / empty input', () => {
    expect(deriveTitleFromSummary(null)).toBeNull();
    expect(deriveTitleFromSummary(undefined)).toBeNull();
    expect(deriveTitleFromSummary('')).toBeNull();
    expect(deriveTitleFromSummary('   \n  ')).toBeNull();
  });

  it('returns the first sentence verbatim when it fits', () => {
    expect(
      deriveTitleFromSummary('Crew of three poured the slab. Inspection scheduled.'),
    ).toBe('Crew of three poured the slab');
  });

  it('uses the whole input when there is no sentence terminator', () => {
    expect(deriveTitleFromSummary('Slab poured')).toBe('Slab poured');
  });

  it('collapses internal whitespace within the first sentence', () => {
    expect(deriveTitleFromSummary('Slab    poured on   site. More notes.')).toBe(
      'Slab poured on site',
    );
  });

  it('treats newline as a sentence terminator', () => {
    expect(deriveTitleFromSummary('Slab poured\nMore detail follows')).toBe(
      'Slab poured',
    );
  });

  it('truncates with ellipsis when too long, preferring word boundaries', () => {
    const long =
      'The crew completed the rebar tie-in across the entire east footing while the inspector observed';
    const out = deriveTitleFromSummary(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(MAX_TITLE_CHARS + 1); // +1 for the ellipsis
    expect(out!.endsWith('…')).toBe(true);
    // The cut runs at the last space within the slice (when one
    // exists past 60% of the cap), so the visible text ends with a
    // complete word followed by the ellipsis.
    expect(out!).not.toMatch(/ …$/);
  });

  it('honours the max length when there is no usable word boundary', () => {
    const noSpaces = 'a'.repeat(120);
    const out = deriveTitleFromSummary(noSpaces);
    expect(out).not.toBeNull();
    expect(out!.endsWith('…')).toBe(true);
    expect(out!.length).toBe(MAX_TITLE_CHARS + 1);
  });

  it('strips trailing punctuation chunks before the ellipsis cut', () => {
    // First-sentence split happens at '.', '!', '?', or '\n'. Empty
    // first-sentence (string starts with a terminator) falls back to
    // the full trimmed input.
    expect(deriveTitleFromSummary('? Inspection done')).toBe('? Inspection done');
  });
});
