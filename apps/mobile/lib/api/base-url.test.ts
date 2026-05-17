/**
 * Tests for the API base URL resolver + override storage.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const asyncStorageMem = new Map<string, string>();

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

const ORIGINAL_ENV = process.env;

describe('lib/api/base-url', () => {
  beforeEach(() => {
    asyncStorageMem.clear();
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_APP_VARIANT;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns inlined env URL when no override is set', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
    process.env.EXPO_PUBLIC_APP_VARIANT = 'preview';
    const { getApiBaseUrl } = await import('./base-url');
    await expect(getApiBaseUrl()).resolves.toBe('https://api.example.com');
  });

  it('strips trailing slashes', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com/';
    process.env.EXPO_PUBLIC_APP_VARIANT = 'preview';
    const { getApiBaseUrl, setApiBaseUrlOverride } = await import('./base-url');
    await setApiBaseUrlOverride('https://override.example.com//');
    await expect(getApiBaseUrl()).resolves.toBe('https://override.example.com');
  });

  it('prefers override over env in non-production builds', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://env.example.com';
    process.env.EXPO_PUBLIC_APP_VARIANT = 'preview';
    const { getApiBaseUrl, setApiBaseUrlOverride } = await import('./base-url');
    await setApiBaseUrlOverride('https://override.example.com');
    await expect(getApiBaseUrl()).resolves.toBe('https://override.example.com');
  });

  it('ignores override in production builds', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
    process.env.EXPO_PUBLIC_APP_VARIANT = 'production';
    // Pre-seed an override directly; production reads should ignore it.
    asyncStorageMem.set('harpa.apiBaseUrl.override.v1', 'https://override.example.com');
    const { getApiBaseUrl, isApiOverrideEnabled, setApiBaseUrlOverride } = await import(
      './base-url'
    );
    expect(isApiOverrideEnabled()).toBe(false);
    await expect(getApiBaseUrl()).resolves.toBe('https://api.example.com');
    await expect(setApiBaseUrlOverride('https://x.com')).rejects.toThrow(/disabled/);
  });

  it('rejects non-http URLs', async () => {
    process.env.EXPO_PUBLIC_APP_VARIANT = 'preview';
    const { setApiBaseUrlOverride } = await import('./base-url');
    await expect(setApiBaseUrlOverride('ftp://x')).rejects.toThrow(/http/);
  });

  it('clears override with null', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
    process.env.EXPO_PUBLIC_APP_VARIANT = 'preview';
    const { getApiBaseUrl, setApiBaseUrlOverride } = await import('./base-url');
    await setApiBaseUrlOverride('https://override.example.com');
    await setApiBaseUrlOverride(null);
    await expect(getApiBaseUrl()).resolves.toBe('https://api.example.com');
  });
});
