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
] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])) as Record<
    string,
    string | undefined
  >;
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
