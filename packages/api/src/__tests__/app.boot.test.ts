/**
 * App boot regression for Fly-shaped envs plus the retired dev OTP route.
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
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'TURNSTILE_LIVE',
  'TURNSTILE_SECRET_KEY',
  'RESEND_LIVE',
  'RESEND_API_KEY',
  'RATE_LIMIT_BACKEND',
  'DASHBOARD_CORS_ORIGINS',
] as const;

let snapshot: Record<string, string | undefined>;
// Cold-importing the full route/auth graph can exceed 30s under the parallel
// root pre-push suite on Windows, even when the import has no live side effects.
const BOOT_IMPORT_TIMEOUT_MS = 90_000;

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

function setLiveDeploymentEnv(): void {
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

describe('app boot: no module-load side effects', () => {
  it('imports app.ts under dev-fly env (NODE_ENV=production, no PR_BUILD) without throwing', async () => {
    setLiveDeploymentEnv();

    vi.resetModules();
    const mod = await import('../app.js');
    expect(typeof mod.createApp).toBe('function');
  }, BOOT_IMPORT_TIMEOUT_MS);

  it('imports app.ts under PR-preview env without requiring live OTP email transport', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';
    process.env.BETTER_AUTH_SECRET = 'test-only-preview-auth-secret-over-32-chars';

    vi.resetModules();
    const mod = await import('../app.js');
    expect(typeof mod.createApp).toBe('function');
  }, BOOT_IMPORT_TIMEOUT_MS);

  it('does not mount the retired dev OTP route', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HARPAPRO_PR_BUILD = '1';
    process.env.EMAIL_OTP_LIVE = '0';
    process.env.MIGRATIONS_REQUIRED_HEAD = '0000_test.sql';
    process.env.BETTER_AUTH_SECRET = 'test-only-preview-auth-secret-over-32-chars';

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
