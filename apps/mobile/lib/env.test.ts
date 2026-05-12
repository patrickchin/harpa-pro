/**
 * Smoke test: env.ts parses default values and surfaces errors loudly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = process.env;

describe('lib/env', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_USE_FIXTURES;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('applies defaults when nothing is set', async () => {
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_API_URL).toBe('http://localhost:8787');
    expect(env.EXPO_PUBLIC_USE_FIXTURES).toBe(false);
  });

  it('parses USE_FIXTURES as boolean', async () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_USE_FIXTURES).toBe(true);
  });

  it('throws on invalid URL', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'not-a-url';
    await expect(import('./env.js')).rejects.toThrow(/invalid environment/);
  });
});
