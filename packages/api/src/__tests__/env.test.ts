/**
 * Env parse-time refines.
 *
 * env.ts calls `Env.parse(process.env)` at module load (single eager
 * parse), so each case mutates `process.env`, calls `vi.resetModules()`
 * to drop the cached module graph, and dynamic-imports the module to
 * re-trigger the parse.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEYS = [
  'NODE_ENV',
  'HARPAPRO_PR_BUILD',
  'EMAIL_OTP_LIVE',
  'MIGRATIONS_REQUIRED_HEAD',
  'TEST_ACCOUNT_EMAILS',
  'TEST_ACCOUNT_PASSWORD',
  'DEMO_ACCOUNT_EMAILS',
  'DEMO_ACCOUNT_PASSWORD',
  'REVENUECAT_LIVE',
  'REVENUECAT_SECRET_API_KEY',
  'REVENUECAT_WEBHOOK_AUTH',
  'REVENUECAT_BASE_URL',
] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])) as Record<
    string,
    string | undefined
  >;
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k] as string;
  }
  vi.resetModules();
});

async function freshImportEnv(): Promise<typeof import('../env.js')> {
  vi.resetModules();
  return await import('../env.js');
}

describe('env: email OTP transport', () => {
  it('rejects fake OTP transport on real production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '0';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';

    await expect(freshImportEnv()).rejects.toThrow(/EMAIL_OTP_LIVE/);
  });

  it('accepts fake OTP transport on PR previews', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';

    const mod = await freshImportEnv();
    expect(mod.env.EMAIL_OTP_LIVE).toBe('0');
  });
});

describe('env: test account access', () => {
  it('rejects TEST_ACCOUNT_EMAILS without TEST_ACCOUNT_PASSWORD', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TEST_ACCOUNT_EMAILS = 'test@harpapro.com';
    delete process.env.TEST_ACCOUNT_PASSWORD;

    await expect(freshImportEnv()).rejects.toThrow(/TEST_ACCOUNT_PASSWORD/);
  });

  it('accepts stable test emails plus password', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TEST_ACCOUNT_EMAILS =
      'test@harpapro.com, test2@harpapro.com, test3@harpapro.com';
    process.env.TEST_ACCOUNT_PASSWORD = 'test-password-12345';

    const mod = await freshImportEnv();
    expect(mod.env.TEST_ACCOUNT_EMAILS).toBe(
      'test@harpapro.com, test2@harpapro.com, test3@harpapro.com',
    );
    expect(mod.env.TEST_ACCOUNT_PASSWORD).toBe('test-password-12345');
  });

  it('rejects test passwords shorter than 16 chars', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TEST_ACCOUNT_EMAILS = 'test@harpapro.com';
    process.env.TEST_ACCOUNT_PASSWORD = 'short';

    await expect(freshImportEnv()).rejects.toThrow(/TEST_ACCOUNT_PASSWORD|at least 16/);
  });
});

describe('env: demo account access', () => {
  it('rejects DEMO_ACCOUNT_EMAILS without DEMO_ACCOUNT_PASSWORD', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_ACCOUNT_EMAILS = 'demo@harpapro.com';
    delete process.env.DEMO_ACCOUNT_PASSWORD;

    await expect(freshImportEnv()).rejects.toThrow(/DEMO_ACCOUNT_PASSWORD/);
  });

  it('accepts configured demo emails plus password', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_ACCOUNT_EMAILS =
      'demo@harpapro.com, demo2@harpapro.com, demo3@harpapro.com';
    process.env.DEMO_ACCOUNT_PASSWORD = 'demo-password-12345';

    const mod = await freshImportEnv();
    expect(mod.env.DEMO_ACCOUNT_EMAILS).toBe(
      'demo@harpapro.com, demo2@harpapro.com, demo3@harpapro.com',
    );
    expect(mod.env.DEMO_ACCOUNT_PASSWORD).toBe('demo-password-12345');
  });

  it('rejects demo passwords shorter than 16 chars', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_ACCOUNT_EMAILS = 'demo@harpapro.com';
    process.env.DEMO_ACCOUNT_PASSWORD = 'short';

    await expect(freshImportEnv()).rejects.toThrow(/DEMO_ACCOUNT_PASSWORD|at least 16/);
  });

  it('rejects unsupported demo emails', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEMO_ACCOUNT_EMAILS = 'demo4@harpapro.com';
    process.env.DEMO_ACCOUNT_PASSWORD = 'demo-password-12345';

    await expect(freshImportEnv()).rejects.toThrow(/demo/);
  });
});

describe('env: RevenueCat', () => {
  it('defaults to disabled with the public REST base URL', async () => {
    const mod = await freshImportEnv();

    expect(mod.env.REVENUECAT_LIVE).toBe('0');
    expect(mod.env.REVENUECAT_BASE_URL).toBe('https://api.revenuecat.com/v1');
  });

  it('requires the secret API key when live', async () => {
    process.env.REVENUECAT_LIVE = '1';
    process.env.REVENUECAT_WEBHOOK_AUTH = 'Bearer webhook-secret-value';

    await expect(freshImportEnv()).rejects.toThrow(/REVENUECAT_SECRET_API_KEY/);
  });

  it('requires webhook authorization when live', async () => {
    process.env.REVENUECAT_LIVE = '1';
    process.env.REVENUECAT_SECRET_API_KEY = 'sk_live_secret';

    await expect(freshImportEnv()).rejects.toThrow(/REVENUECAT_WEBHOOK_AUTH/);
  });

  it('accepts live billing with both server secrets', async () => {
    process.env.REVENUECAT_LIVE = '1';
    process.env.REVENUECAT_SECRET_API_KEY = 'sk_live_secret';
    process.env.REVENUECAT_WEBHOOK_AUTH = 'Bearer webhook-secret-value';

    const mod = await freshImportEnv();
    expect(mod.env.REVENUECAT_LIVE).toBe('1');
  });
});
