/**
 * Tests for slug generator.
 * Per design-p30-ids-slugs.md: Crockford base32 (no I/L/O/U), 6 chars, prefixed.
 */
import { describe, it, expect } from 'vitest';
import { generateSlug, type SlugPrefix } from './slug.js';

describe('generateSlug', () => {
  it('generates prj_ prefixed slugs matching regex', () => {
    const slug = generateSlug('prj');
    expect(slug).toMatch(/^prj_[0-9a-z]{6}$/);
  });

  it('generates rpt_ prefixed slugs matching regex', () => {
    const slug = generateSlug('rpt');
    expect(slug).toMatch(/^rpt_[0-9a-z]{6}$/);
  });

  it('generates fil_ prefixed slugs matching regex', () => {
    const slug = generateSlug('fil');
    expect(slug).toMatch(/^fil_[0-9a-z]{6}$/);
  });

  it('generates not_ prefixed slugs matching regex', () => {
    const slug = generateSlug('not');
    expect(slug).toMatch(/^not_[0-9a-z]{6}$/);
  });

  it('uses Crockford base32 alphabet (no I/L/O/U)', () => {
    // Generate many slugs and verify none contain forbidden chars
    const forbidden = /[ilou]/i;
    for (let i = 0; i < 100; i++) {
      const slug = generateSlug('prj');
      const suffix = slug.split('_')[1]!;
      expect(suffix).not.toMatch(forbidden);
    }
  });

  it('produces no collisions in 1000 iterations (sanity)', () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const slug = generateSlug('prj');
      expect(slugs.has(slug)).toBe(false);
      slugs.add(slug);
    }
    expect(slugs.size).toBe(1000);
  });

  it('accepts all valid prefix types', () => {
    const prefixes: SlugPrefix[] = ['prj', 'rpt', 'fil', 'not'];
    prefixes.forEach((prefix) => {
      const slug = generateSlug(prefix);
      expect(slug).toMatch(new RegExp(`^${prefix}_[0-9a-z]{6}$`));
    });
  });
});
