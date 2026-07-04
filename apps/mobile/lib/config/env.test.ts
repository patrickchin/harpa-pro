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
    delete process.env.EXPO_PUBLIC_LAYOUT_PROBE;
    delete process.env.EXPO_PUBLIC_SCREENSHOT_MODE;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_BILLING_ENABLED;
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('applies defaults when nothing is set', async () => {
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_API_URL).toBe('http://localhost:8787');
    expect(env.EXPO_PUBLIC_USE_FIXTURES).toBe(false);
    expect(env.EXPO_PUBLIC_APP_VARIANT).toBe('development');
    expect(env.EXPO_PUBLIC_LAYOUT_PROBE).toBe(false);
    expect(env.EXPO_PUBLIC_SCREENSHOT_MODE).toBe(false);
    expect(env.EXPO_PUBLIC_SENTRY_DSN).toBeUndefined();
    expect(env.EXPO_PUBLIC_BILLING_ENABLED).toBe(false);
  });

  it('parses LAYOUT_PROBE as boolean', async () => {
    process.env.EXPO_PUBLIC_LAYOUT_PROBE = 'true';
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_LAYOUT_PROBE).toBe(true);
  });

  it('parses SCREENSHOT_MODE as boolean', async () => {
    process.env.EXPO_PUBLIC_SCREENSHOT_MODE = 'true';
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_SCREENSHOT_MODE).toBe(true);
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

  it('accepts a Sentry DSN when configured', async () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_SENTRY_DSN).toBe('https://public@example.ingest.sentry.io/1');
  });

  it('requires the current platform RevenueCat key when billing is enabled', async () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
    process.env.EXPO_PUBLIC_BILLING_ENABLED = 'true';

    await expect(import('./env.js')).rejects.toThrow(/REVENUECAT_IOS_API_KEY/);
  });

  it('accepts billing with the current platform public key', async () => {
    process.env.EXPO_PUBLIC_USE_FIXTURES = 'false';
    process.env.EXPO_PUBLIC_BILLING_ENABLED = 'true';
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_public_test_key';

    const { env } = await import('./env.js');
    expect(env.EXPO_PUBLIC_BILLING_ENABLED).toBe(true);
    expect(env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY).toBe('appl_public_test_key');
  });
});
