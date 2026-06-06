/**
 * App boot regression: ensure `app.ts` (which statically imports
 * `routes/dev.js`) does NOT throw at module-load when NODE_ENV is
 * production and HARPAPRO_PR_BUILD is unset — i.e. the env shape of
 * `harpa-pro-api-dev` on Fly.
 *
 * Bug history: docs/bugs/2026-06-06-routes-dev-boot-crash.md.
 * `routes/dev.ts` had a top-level `throw` guarded on
 * `NODE_ENV === 'production' && HARPAPRO_PR_BUILD !== '1'`. ESM
 * evaluates statically-imported modules unconditionally, so the throw
 * fired on every dev boot, before the conditional mount in app.ts had
 * a chance to skip the route. The mount gate + env.ts refines already
 * cover the misconfig case, so the module-level throw was redundant
 * and removed. This test prevents a future top-level side-effect
 * from re-introducing the crash.
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
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k] as string;
  }
  vi.resetModules();
});

describe('app boot: no module-load side effects', () => {
  it('imports app.ts under dev-fly env (NODE_ENV=production, no PR_BUILD, no DEV_OTP_TOKEN) without throwing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '0';
    process.env.EMAIL_OTP_LIVE = '1';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';
    delete process.env.DEV_OTP_TOKEN;
    process.env.HARPA_DEV_OTP_DISABLED = '1';

    vi.resetModules();
    const mod = await import('../app.js');
    expect(typeof mod.createApp).toBe('function');
  }, 30_000);

  it('imports app.ts under PR-preview env (NODE_ENV=production, PR_BUILD=1, DEV_OTP_TOKEN set) without throwing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';
    process.env.DEV_OTP_TOKEN = 'a'.repeat(40);
    delete process.env.HARPA_DEV_OTP_DISABLED;

    vi.resetModules();
    const mod = await import('../app.js');
    expect(typeof mod.createApp).toBe('function');
  }, 30_000);

  it('imports routes/dev.ts directly under dev-fly env without throwing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '0';
    process.env.EMAIL_OTP_LIVE = '1';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';
    delete process.env.DEV_OTP_TOKEN;
    process.env.HARPA_DEV_OTP_DISABLED = '1';

    vi.resetModules();
    const mod = await import('../routes/dev.js');
    expect(mod.devRoutes).toBeDefined();
  }, 30_000);
});
