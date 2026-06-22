/**
 * Env parse-time refines for DEV_OTP_TOKEN.
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
  'HARPA_DEV_OTP_DISABLED',
  'DEV_OTP_TOKEN',
  'EMAIL_OTP_LIVE',
  'MIGRATIONS_REQUIRED_HEAD',
  'TEST_ACCOUNT_EMAILS',
  'TEST_ACCOUNT_PASSWORD',
  'APP_REVIEW_EMAILS',
  'APP_REVIEW_PASSWORD',
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

describe('env: DEV_OTP_TOKEN', () => {
  it('rejects DEV_OTP_TOKEN shorter than 32 chars in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.HARPAPRO_PR_BUILD = '0';
    process.env.DEV_OTP_TOKEN = 'too-short';
    delete process.env.HARPA_DEV_OTP_DISABLED;
    await expect(freshImportEnv()).rejects.toThrow(/DEV_OTP_TOKEN|at least 32/);
  });

  it('rejects DEV_OTP_TOKEN set on real production (HARPAPRO_PR_BUILD!=1)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '0';
    process.env.EMAIL_OTP_LIVE = '1';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';
    process.env.DEV_OTP_TOKEN = 'a'.repeat(40);
    delete process.env.HARPA_DEV_OTP_DISABLED;
    await expect(freshImportEnv()).rejects.toThrow(/DEV_OTP_TOKEN/);
  });

  it('accepts DEV_OTP_TOKEN unset in development when HARPA_DEV_OTP_DISABLED=1', async () => {
    process.env.NODE_ENV = 'development';
    process.env.HARPAPRO_PR_BUILD = '0';
    delete process.env.DEV_OTP_TOKEN;
    process.env.HARPA_DEV_OTP_DISABLED = '1';
    const mod = await freshImportEnv();
    expect(mod.env.DEV_OTP_TOKEN).toBeUndefined();
  });

  it('accepts DEV_OTP_TOKEN set in PR preview (production + HARPAPRO_PR_BUILD=1)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';
    process.env.DEV_OTP_TOKEN = 'a'.repeat(40);
    delete process.env.HARPA_DEV_OTP_DISABLED;
    const mod = await freshImportEnv();
    expect(mod.env.DEV_OTP_TOKEN).toBe('a'.repeat(40));
  });
});

describe('env: App Review access', () => {
  it('rejects APP_REVIEW_EMAILS without APP_REVIEW_PASSWORD', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_OTP_TOKEN = 'a'.repeat(40);
    process.env.APP_REVIEW_EMAILS = 'app-review@harpapro.com';
    delete process.env.APP_REVIEW_PASSWORD;

    await expect(freshImportEnv()).rejects.toThrow(/APP_REVIEW_PASSWORD/);
  });

  it('accepts App Review emails plus password', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_OTP_TOKEN = 'a'.repeat(40);
    process.env.APP_REVIEW_EMAILS =
      'app-review@harpapro.com';
    process.env.APP_REVIEW_PASSWORD = 'review-password-12345';

    const mod = await freshImportEnv();
    expect(mod.env.APP_REVIEW_EMAILS).toBe('app-review@harpapro.com');
    expect(mod.env.APP_REVIEW_PASSWORD).toBe('review-password-12345');
  });

  it('rejects App Review passwords shorter than 16 chars', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_OTP_TOKEN = 'a'.repeat(40);
    process.env.APP_REVIEW_EMAILS = 'app-review@harpapro.com';
    process.env.APP_REVIEW_PASSWORD = 'short';

    await expect(freshImportEnv()).rejects.toThrow(/APP_REVIEW_PASSWORD|at least 16/);
  });

  it('rejects App Review emails with a hash suffix', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_OTP_TOKEN = 'a'.repeat(40);
    process.env.APP_REVIEW_EMAILS = 'app-review+abcdef12@harpapro.com';
    process.env.APP_REVIEW_PASSWORD = 'review-password-12345';

    await expect(freshImportEnv()).rejects.toThrow(/app-review/);
  });
});
