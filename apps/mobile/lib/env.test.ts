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
    delete process.env.EXPO_PUBLIC_APP_VARIANT;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('applies defaults when nothing is set', async () => {
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_API_URL).toBe('http://localhost:8787');
    expect(env.EXPO_PUBLIC_USE_FIXTURES).toBe(false);
    expect(env.EXPO_PUBLIC_APP_VARIANT).toBe('development');
  });

  it('parses USE_FIXTURES as boolean', async () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_USE_FIXTURES).toBe(true);
  });

  it('accepts known APP_VARIANT values', async () => {
    process.env.EXPO_PUBLIC_APP_VARIANT = 'preview';
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_APP_VARIANT).toBe('preview');
  });

  it('rejects unknown APP_VARIANT values', async () => {
    process.env.EXPO_PUBLIC_APP_VARIANT = 'staging';
    await expect(import('./env.js')).rejects.toThrow(/invalid environment/);
  });

  it('throws on invalid URL', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'not-a-url';
    await expect(import('./env.js')).rejects.toThrow(/invalid environment/);
  });
});
