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
  'BETTER_AUTH_SECRET',
  'AI_FIXTURE_MODE',
  'AI_LIVE',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'R2_FIXTURE_MODE',
  'R2_ACCOUNT_ID',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'TURNSTILE_LIVE',
  'TURNSTILE_SECRET_KEY',
  'RESEND_LIVE',
  'RESEND_API_KEY',
  'RATE_LIMIT_BACKEND',
  'TEST_ACCOUNT_EMAILS',
  'TEST_ACCOUNT_PASSWORD',
  'DEMO_ACCOUNT_EMAILS',
  'DEMO_ACCOUNT_PASSWORD',
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

function setValidProductionEnv(): void {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    HARPAPRO_PR_BUILD: '0',
    EMAIL_OTP_LIVE: '1',
    MIGRATIONS_REQUIRED_HEAD: '0000_test.sql',
    BETTER_AUTH_SECRET: 'test-only-production-auth-secret-over-32-chars',
    AI_FIXTURE_MODE: 'live',
    AI_LIVE: '1',
    OPENAI_API_KEY: 'test-openai-key',
    GROQ_API_KEY: 'test-groq-key',
    R2_FIXTURE_MODE: 'live',
    R2_ACCOUNT_ID: 'test-r2-account',
    R2_ACCESS_KEY_ID: 'test-r2-access-key',
    R2_SECRET_ACCESS_KEY: 'test-r2-secret-key',
    TURNSTILE_LIVE: '1',
    TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
    RESEND_LIVE: '1',
    RESEND_API_KEY: 'test-resend-key',
    RATE_LIMIT_BACKEND: 'postgres',
  });
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
    process.env.BETTER_AUTH_SECRET = 'test-only-preview-auth-secret-over-32-chars';

    const mod = await freshImportEnv();
    expect(mod.env.EMAIL_OTP_LIVE).toBe('0');
  });
});

describe('env: production services fail closed', () => {
  it('accepts a fully configured production environment', async () => {
    setValidProductionEnv();

    const mod = await freshImportEnv();

    expect(mod.env.RATE_LIMIT_BACKEND).toBe('postgres');
  });

  it('rejects the development Better Auth secret in production', async () => {
    setValidProductionEnv();
    delete process.env.BETTER_AUTH_SECRET;

    await expect(freshImportEnv()).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  it('rejects a short Better Auth secret in production', async () => {
    setValidProductionEnv();
    process.env.BETTER_AUTH_SECRET = 'test-secret-24-characters';

    await expect(freshImportEnv()).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  it.each([
    ['AI_FIXTURE_MODE', 'replay'],
    ['AI_LIVE', '0'],
    ['R2_FIXTURE_MODE', 'replay'],
    ['TURNSTILE_LIVE', '0'],
    ['RESEND_LIVE', '0'],
    ['RATE_LIMIT_BACKEND', 'memory'],
  ] as const)('rejects %s=%s in production', async (key, value) => {
    setValidProductionEnv();
    process.env[key] = value;

    await expect(freshImportEnv()).rejects.toThrow(new RegExp(key));
  });

  it.each([
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ] as const)('rejects live R2 without %s', async (key) => {
    setValidProductionEnv();
    delete process.env[key];

    await expect(freshImportEnv()).rejects.toThrow(new RegExp(key));
  });

  it('accepts an explicit R2 endpoint instead of an account ID', async () => {
    setValidProductionEnv();
    delete process.env.R2_ACCOUNT_ID;
    process.env.R2_ENDPOINT = 'http://localhost:9000';

    const mod = await freshImportEnv();

    expect(mod.env.R2_ENDPOINT).toBe('http://localhost:9000');
  });

  it('rejects live Turnstile without its secret', async () => {
    setValidProductionEnv();
    delete process.env.TURNSTILE_SECRET_KEY;

    await expect(freshImportEnv()).rejects.toThrow(/TURNSTILE_SECRET_KEY/);
  });

  it('rejects live Resend without its API key', async () => {
    setValidProductionEnv();
    delete process.env.RESEND_API_KEY;

    await expect(freshImportEnv()).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('allows fixture-backed services on PR previews', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      HARPAPRO_PR_BUILD: '1',
      EMAIL_OTP_LIVE: '0',
      MIGRATIONS_REQUIRED_HEAD: '0000_test.sql',
      BETTER_AUTH_SECRET: 'test-only-preview-auth-secret-over-32-chars',
      AI_FIXTURE_MODE: 'replay',
      AI_LIVE: '0',
      R2_FIXTURE_MODE: 'replay',
      TURNSTILE_LIVE: '0',
      RESEND_LIVE: '0',
      RATE_LIMIT_BACKEND: 'memory',
    });

    const mod = await freshImportEnv();

    expect(mod.env.HARPAPRO_PR_BUILD).toBe('1');
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
