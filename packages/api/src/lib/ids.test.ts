/**
 * Tests for the slug-only ID generator and helpers (P3.1).
 */
import { describe, it, expect } from 'vitest';
import { newId, assertId, insertWithGeneratedId } from './ids.js';

describe('newId', () => {
  it('mints prj_ slugs of 8 chars (Crockford base32)', () => {
    const id = newId('prj');
    expect(id).toMatch(/^prj_[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it('mints usr_ slugs of 12 chars', () => {
    const id = newId('usr');
    expect(id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{12}$/);
  });

  it('mints not_ / fil_ / vrf_ / wls_ slugs of 10 chars', () => {
    for (const p of ['not', 'fil', 'vrf', 'wls'] as const) {
      expect(newId(p)).toMatch(new RegExp(`^${p}_[0-9a-hjkmnp-tv-z]{10}$`));
    }
  });

  it('never produces I/L/O/U in the body (Crockford)', () => {
    for (let i = 0; i < 200; i++) {
      const id = newId('rpt').split('_')[1]!;
      expect(id).not.toMatch(/[ilou]/i);
    }
  });

  it('no collisions across 1000 mintings of one prefix', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = newId('not');
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});

describe('assertId', () => {
  it('returns the lowercased branded id for valid input', () => {
    const out = assertId('usr', 'USR_abcdefghjkmn');
    expect(out).toBe('usr_abcdefghjkmn');
  });

  it('throws on wrong prefix', () => {
    expect(() => assertId('usr', 'prj_abcdefghjkmn')).toThrow();
  });

  it('throws on bad charset', () => {
    expect(() => assertId('usr', 'usr_abcdefIhjkmn')).toThrow(); // contains I
  });

  it('throws on length outside [minLen,maxLen]', () => {
    expect(() => assertId('usr', 'usr_abc')).toThrow(); // 3 < 8
    expect(() => assertId('usr', 'usr_' + 'a'.repeat(20))).toThrow(); // 20 > 16
  });

  it('throws on non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(() => assertId('usr', 42)).toThrow();
  });
});

describe('insertWithGeneratedId', () => {
  it('returns the closure result on first success', async () => {
    const result = await insertWithGeneratedId('prj', async (id) => `inserted:${id}`);
    expect(result).toMatch(/^inserted:prj_[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it('retries on 23505 and succeeds on the third attempt', async () => {
    let calls = 0;
    const result = await insertWithGeneratedId('rpt', async (id) => {
      calls += 1;
      if (calls < 3) {
        const err: Error & { code?: string } = new Error('dup');
        err.code = '23505';
        throw err;
      }
      return id;
    });
    expect(calls).toBe(3);
    expect(result).toMatch(/^rpt_[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it('rethrows after 3 attempts of 23505', async () => {
    await expect(
      insertWithGeneratedId('rpt', async () => {
        const err: Error & { code?: string } = new Error('dup');
        err.code = '23505';
        throw err;
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('does not retry on non-23505 errors', async () => {
    let calls = 0;
    await expect(
      insertWithGeneratedId('rpt', async () => {
        calls += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow(/boom/);
    expect(calls).toBe(1);
  });
});
