import { describe, it, expect } from 'vitest';
import {
  getRememberedPhoneNumber,
  rememberPhoneNumber,
  clearRememberedPhoneNumber,
  REMEMBERED_PHONE_STORAGE_KEY,
} from './remembered-login';

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function createFakeStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
  };
}

describe('remembered-login', () => {
  describe('getRememberedPhoneNumber', () => {
    it('returns null when no phone is stored', async () => {
      const storage = createFakeStorage();
      const result = await getRememberedPhoneNumber(storage);
      expect(result).toBeNull();
    });

    it('returns canonicalized phone when stored', async () => {
      const storage = createFakeStorage();
      await storage.setItem(REMEMBERED_PHONE_STORAGE_KEY, '+15551234567');
      const result = await getRememberedPhoneNumber(storage);
      expect(result).toBe('+15551234567');
    });

    it('returns null when stored value is invalid', async () => {
      const storage = createFakeStorage();
      await storage.setItem(REMEMBERED_PHONE_STORAGE_KEY, 'invalid');
      const result = await getRememberedPhoneNumber(storage);
      expect(result).toBeNull();
    });
  });

  describe('rememberPhoneNumber', () => {
    it('stores valid phone in canonical format', async () => {
      const storage = createFakeStorage();
      const result = await rememberPhoneNumber('+1 555 123 4567', storage);
      expect(result).toBe('+15551234567');
      const stored = await storage.getItem(REMEMBERED_PHONE_STORAGE_KEY);
      expect(stored).toBe('+15551234567');
    });

    it('removes storage when phone is empty or whitespace', async () => {
      const storage = createFakeStorage();
      await storage.setItem(REMEMBERED_PHONE_STORAGE_KEY, '+15551234567');
      const result = await rememberPhoneNumber('   ', storage);
      expect(result).toBeNull();
      const stored = await storage.getItem(REMEMBERED_PHONE_STORAGE_KEY);
      expect(stored).toBeNull();
    });

    it('throws when phone is invalid', async () => {
      const storage = createFakeStorage();
      await expect(rememberPhoneNumber('invalid', storage)).rejects.toThrow(
        'Cannot remember an invalid phone number.'
      );
    });
  });

  describe('clearRememberedPhoneNumber', () => {
    it('removes the stored phone', async () => {
      const storage = createFakeStorage();
      await storage.setItem(REMEMBERED_PHONE_STORAGE_KEY, '+15551234567');
      await clearRememberedPhoneNumber(storage);
      const stored = await storage.getItem(REMEMBERED_PHONE_STORAGE_KEY);
      expect(stored).toBeNull();
    });
  });
});
