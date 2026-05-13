/**
 * Storage round-trip tests. Mocks expo-secure-store + AsyncStorage with
 * in-memory Maps so we can verify the contract without native modules.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const secureStoreMem = new Map<string, string>();
const asyncStorageMem = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStoreMem.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreMem.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreMem.delete(key);
  }),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageMem.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageMem.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageMem.delete(key);
    }),
  },
}));

import {
  readSession,
  writeSession,
  clearSession,
  readLastPhone,
  writeLastPhone,
  clearLastPhone,
  __keys,
  type PersistedSession,
} from './storage';

const SAMPLE: PersistedSession = {
  token: 'jwt.signed.token',
  user: {
    id: '00000000-0000-0000-0000-0000000000aa',
    phone: '+15551234567',
    displayName: 'Alex',
    companyName: 'Acme',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
};

describe('lib/auth/storage', () => {
  beforeEach(() => {
    secureStoreMem.clear();
    asyncStorageMem.clear();
  });

  describe('session', () => {
    it('round-trips a session blob through SecureStore', async () => {
      await writeSession(SAMPLE);
      expect(secureStoreMem.get(__keys.SESSION_KEY)).toBe(JSON.stringify(SAMPLE));
      const read = await readSession();
      expect(read).toEqual(SAMPLE);
    });

    it('returns null when nothing is stored', async () => {
      expect(await readSession()).toBeNull();
    });

    it('clearSession removes the SecureStore entry', async () => {
      await writeSession(SAMPLE);
      await clearSession();
      expect(secureStoreMem.has(__keys.SESSION_KEY)).toBe(false);
      expect(await readSession()).toBeNull();
    });

    it('treats malformed JSON as no session and removes it (force re-login)', async () => {
      secureStoreMem.set(__keys.SESSION_KEY, '{not valid json');
      expect(await readSession()).toBeNull();
      expect(secureStoreMem.has(__keys.SESSION_KEY)).toBe(false);
    });

    it('treats a structurally invalid session as no session and removes it', async () => {
      secureStoreMem.set(
        __keys.SESSION_KEY,
        JSON.stringify({ token: '', user: { id: 'x' } }),
      );
      expect(await readSession()).toBeNull();
      expect(secureStoreMem.has(__keys.SESSION_KEY)).toBe(false);
    });

    it('accepts a user with null displayName / companyName (pre-onboarding)', async () => {
      const partial: PersistedSession = {
        token: 'jwt',
        user: {
          id: 'u',
          phone: '+1',
          displayName: null,
          companyName: null,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      };
      await writeSession(partial);
      expect(await readSession()).toEqual(partial);
    });

    it('uses a versioned key so future schema changes do not collide', () => {
      expect(__keys.SESSION_KEY).toBe('harpa.session.v1');
    });

    it('strips unknown fields on read so a tampered blob cannot inject properties', async () => {
      // Simulate a SecureStore entry that's been edited (e.g. via a
      // jailbroken device) to add fields downstream code might trust.
      secureStoreMem.set(
        __keys.SESSION_KEY,
        JSON.stringify({
          token: SAMPLE.token,
          user: {
            ...SAMPLE.user,
            // Hostile payload — must not survive readSession().
            isAdmin: true,
            apiKey: 'sekret',
          },
          smuggled: 'top-level',
        }),
      );
      const read = await readSession();
      expect(read).toEqual(SAMPLE);
      const u = read?.user as unknown as Record<string, unknown>;
      expect(u.isAdmin).toBeUndefined();
      expect(u.apiKey).toBeUndefined();
      const r = read as unknown as Record<string, unknown>;
      expect(r.smuggled).toBeUndefined();
    });
  });

  describe('last phone', () => {
    it('round-trips through AsyncStorage', async () => {
      await writeLastPhone('+15551234567');
      expect(asyncStorageMem.get(__keys.LAST_PHONE_KEY)).toBe('+15551234567');
      expect(await readLastPhone()).toBe('+15551234567');
    });

    it('returns null when no phone is stored', async () => {
      expect(await readLastPhone()).toBeNull();
    });

    it('clearLastPhone removes the AsyncStorage entry', async () => {
      await writeLastPhone('+15551234567');
      await clearLastPhone();
      expect(asyncStorageMem.has(__keys.LAST_PHONE_KEY)).toBe(false);
    });

    it('uses a versioned key', () => {
      expect(__keys.LAST_PHONE_KEY).toBe('harpa.lastPhone.v1');
    });
  });
});
