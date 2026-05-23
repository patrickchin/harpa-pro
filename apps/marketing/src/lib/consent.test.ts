import { describe, it, expect, beforeEach } from 'vitest';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: new MemoryStorage(),
  };
});

const { getConsent, hasConsent, setConsent, subscribeToConsent, __resetConsentForTests } =
  await import('./consent');

describe('marketing consent', () => {
  beforeEach(() => __resetConsentForTests());

  it('defaults to unknown when storage is empty', () => {
    expect(getConsent()).toBe('unknown');
    expect(hasConsent()).toBe(false);
  });

  it('persists granted + declined', () => {
    setConsent('granted');
    expect(getConsent()).toBe('granted');
    expect(hasConsent()).toBe(true);
    setConsent('declined');
    expect(getConsent()).toBe('declined');
    expect(hasConsent()).toBe(false);
  });

  it('notifies subscribers', () => {
    const seen: string[] = [];
    const unsub = subscribeToConsent((s) => seen.push(s));
    setConsent('granted');
    setConsent('declined');
    unsub();
    setConsent('granted');
    expect(seen).toEqual(['granted', 'declined']);
  });
});

const { aliasKeyForEmail } = await import('./posthog');

describe('aliasKeyForEmail', () => {
  it('is deterministic and case/whitespace insensitive', async () => {
    const a = await aliasKeyForEmail('Foo@Bar.COM');
    const b = await aliasKeyForEmail('  foo@bar.com  ');
    expect(a).toBe(b);
    expect(a).toMatch(/^wl_/);
  });
});
