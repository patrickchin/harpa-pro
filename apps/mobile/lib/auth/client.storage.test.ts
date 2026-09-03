import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const secureStore = {
    getItem: vi.fn<(key: string) => string | null>(() => null),
    getItemAsync: vi.fn<(key: string) => Promise<string | null>>(async () => null),
    setItem: vi.fn<(key: string, value: string) => void>(),
    setItemAsync: vi.fn<(key: string, value: string) => Promise<void>>(async () => undefined),
  };
  return {
    secureStore,
    expoOptions: [] as Array<{ storage: typeof secureStore }>,
  };
});

vi.mock('expo-secure-store', () => mocks.secureStore);

vi.mock('@better-auth/expo/client', () => ({
  expoClient: (options: { storage: typeof mocks.secureStore }) => {
    mocks.expoOptions.push(options);
    return {
      id: 'expo',
      fetchPlugins: [],
      getActions: () => ({ getCookie: async () => '' }),
    };
  },
}));

vi.mock('better-auth/react', () => ({
  createAuthClient: () => ({}),
}));

vi.mock('better-auth/client/plugins', () => ({
  emailOTPClient: () => ({ id: 'email-otp' }),
}));

vi.mock('@/lib/config/env', () => ({
  env: { EXPO_PUBLIC_API_URL: 'http://localhost:8787' },
}));

import { createAuthStorage } from './client';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.secureStore.getItem.mockReturnValue(null);
  mocks.secureStore.getItemAsync.mockResolvedValue(null);
  mocks.secureStore.setItem.mockImplementation(() => undefined);
  mocks.secureStore.setItemAsync.mockResolvedValue(undefined);
});

describe('Better Auth Expo storage', () => {
  it('passes all four SecureStore operations to the Expo plugin', () => {
    expect(mocks.expoOptions).toHaveLength(1);
    expect(mocks.expoOptions[0]?.storage).toMatchObject({
      getItem: mocks.secureStore.getItem,
      getItemAsync: mocks.secureStore.getItemAsync,
      setItem: mocks.secureStore.setItem,
      setItemAsync: mocks.secureStore.setItemAsync,
    });
  });

  it('uses raw SecureStore in production so storage errors surface', () => {
    const storage = createAuthStorage(false);

    mocks.secureStore.getItem.mockImplementationOnce(() => {
      throw new Error('production read failed');
    });
    expect(() => storage.getItem('production-key')).toThrow('production read failed');
  });

  it('delegates development sync and async operations to SecureStore', async () => {
    const storage = createAuthStorage(true);
    mocks.secureStore.getItem.mockReturnValueOnce('sync-value');
    mocks.secureStore.getItemAsync.mockResolvedValueOnce('async-value');

    expect(storage.getItem('sync-key')).toBe('sync-value');
    await expect(storage.getItemAsync('async-key')).resolves.toBe('async-value');
    storage.setItem('sync-key', 'next-sync');
    await storage.setItemAsync('async-key', 'next-async');

    expect(mocks.secureStore.setItem).toHaveBeenCalledWith('sync-key', 'next-sync', undefined);
    expect(mocks.secureStore.setItemAsync).toHaveBeenCalledWith(
      'async-key',
      'next-async',
      undefined,
    );
  });

  it('shares the development fallback cache across sync and async failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createAuthStorage(true);

    mocks.secureStore.setItem.mockImplementationOnce(() => {
      throw new Error('sync write failed');
    });
    storage.setItem('sync-key', 'from-sync');
    mocks.secureStore.getItemAsync.mockRejectedValueOnce(new Error('async read failed'));
    await expect(storage.getItemAsync('sync-key')).resolves.toBe('from-sync');

    mocks.secureStore.setItemAsync.mockRejectedValueOnce(new Error('async write failed'));
    await storage.setItemAsync('async-key', 'from-async');
    mocks.secureStore.getItem.mockImplementationOnce(() => {
      throw new Error('sync read failed');
    });
    expect(storage.getItem('async-key')).toBe('from-async');

    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });

  it('replaces a failed-write fallback after SecureStore recovers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createAuthStorage(true);

    mocks.secureStore.setItemAsync.mockRejectedValueOnce(new Error('write failed'));
    await storage.setItemAsync('session-key', 'stale-session');
    await storage.setItemAsync('session-key', '{}');

    mocks.secureStore.getItemAsync.mockRejectedValueOnce(new Error('read failed'));
    await expect(storage.getItemAsync('session-key')).resolves.toBe('{}');

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('refreshes and clears the fallback after successful SecureStore reads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createAuthStorage(true);

    mocks.secureStore.setItemAsync.mockRejectedValueOnce(new Error('write failed'));
    await storage.setItemAsync('read-through-key', 'stale-session');

    mocks.secureStore.getItemAsync.mockResolvedValueOnce('stored-session');
    await expect(storage.getItemAsync('read-through-key')).resolves.toBe('stored-session');
    mocks.secureStore.getItemAsync.mockRejectedValueOnce(new Error('read failed'));
    await expect(storage.getItemAsync('read-through-key')).resolves.toBe('stored-session');

    mocks.secureStore.getItemAsync.mockResolvedValueOnce(null);
    await expect(storage.getItemAsync('read-through-key')).resolves.toBeNull();
    mocks.secureStore.getItemAsync.mockRejectedValueOnce(new Error('read failed'));
    await expect(storage.getItemAsync('read-through-key')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
