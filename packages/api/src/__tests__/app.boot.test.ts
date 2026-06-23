/**
 * App boot regression for Fly-shaped envs plus the retired dev OTP route.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEYS = [
  'NODE_ENV',
  'HARPAPRO_PR_BUILD',
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
  it('imports app.ts under dev-fly env (NODE_ENV=production, no PR_BUILD) without throwing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '0';
    process.env.EMAIL_OTP_LIVE = '1';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';

    vi.resetModules();
    const mod = await import('../app.js');
    expect(typeof mod.createApp).toBe('function');
  }, 30_000);

  it('imports app.ts under PR-preview env without requiring live OTP email transport', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';

    vi.resetModules();
    const mod = await import('../app.js');
    expect(typeof mod.createApp).toBe('function');
  }, 30_000);

  it('does not mount the retired dev OTP route', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';

    vi.resetModules();
    const { createApp } = await import('../app.js');
    const res = await createApp().request('/api/dev/last-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@harpapro.com' }),
    });
    expect(res.status).toBe(404);
  }, 30_000);
});
