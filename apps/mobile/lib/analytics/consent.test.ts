import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    getItemAsync: vi.fn(async (k: string) => mem.get(k) ?? null),
    setItemAsync: vi.fn(async (k: string, v: string) => {
      mem.set(k, v);
    }),
    deleteItemAsync: vi.fn(async (k: string) => {
      mem.delete(k);
    }),
  };
});

import {
  getConsent,
  setConsent,
  subscribeToConsent,
  __resetConsentForTests,
} from './consent';

describe('analytics consent', () => {
  beforeEach(async () => {
    await __resetConsentForTests();
  });

  it('defaults to ON when nothing is stored', async () => {
    expect(await getConsent()).toBe(true);
  });

  it('persists set value and re-reads it from cache', async () => {
    await setConsent(false);
    expect(await getConsent()).toBe(false);
  });

  it('notifies subscribers on change', async () => {
    const seen: boolean[] = [];
    const unsub = subscribeToConsent((v) => seen.push(v));
    await setConsent(false);
    await setConsent(true);
    expect(seen).toEqual([false, true]);
    unsub();
    await setConsent(false);
    expect(seen).toEqual([false, true]); // no new notifications after unsub
  });
});
