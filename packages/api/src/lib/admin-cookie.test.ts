import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app.js';

const originalEnv = { ...process.env };
const SAME_SITE_ORIGIN = 'https://admin.harpapro.com';
const PARTITIONED_ORIGIN = 'https://dev.harpa-pro.pages.dev';

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'production',
    HARPAPRO_PR_BUILD: '0',
    EMAIL_OTP_LIVE: '1',
    MIGRATIONS_REQUIRED_HEAD: '0000_test.sql',
    ADMIN_MIGRATIONS_REQUIRED_HEAD: '0002_admin_rate_limit_buckets.sql',
    DATABASE_URL: 'postgres://app:test@localhost:5432/harpa',
    ADMIN_DATABASE_URL: 'postgres://admin:test@localhost:5433/harpa_admin',
    BETTER_AUTH_SECRET: 'test-only-production-auth-secret-over-32-chars',
    BETTER_AUTH_URL: 'https://harpa-pro-api-dev.fly.dev',
    ADMIN_CORS_ORIGINS: `${SAME_SITE_ORIGIN},${PARTITIONED_ORIGIN}`,
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
  };
  delete process.env.TEST_ACCOUNT_EMAILS;
  delete process.env.TEST_ACCOUNT_PASSWORD;
  delete process.env.DEMO_ACCOUNT_EMAILS;
  delete process.env.DEMO_ACCOUNT_PASSWORD;
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

async function cookieHeader(origin: string, action: 'clear' | 'set'): Promise<string> {
  const { clearAdminSessionCookie, setAdminSessionCookie } = await import('./admin-cookie.js');
  const app = new Hono<AppEnv>();
  app.get('/', (c) => {
    if (action === 'set') setAdminSessionCookie(c, 'opaque-test-token');
    else clearAdminSessionCookie(c);
    return c.body(null, 204);
  });

  const response = await app.request('/', { headers: { origin } });
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('expected an admin session Set-Cookie header');
  return header;
}

function expectSharedDeployedAttributes(header: string): void {
  expect(header).toMatch(/^__Host-harpa_admin_session=/);
  expect(header).toContain('Path=/');
  expect(header).toContain('Secure');
  expect(header).toContain('HttpOnly');
  expect(header).toContain('Priority=High');
}

describe('deployed admin session cookie policy', () => {
  it('uses a host-prefixed strict cookie for the same-site admin origin', async () => {
    const setHeader = await cookieHeader(SAME_SITE_ORIGIN, 'set');
    const clearHeader = await cookieHeader(SAME_SITE_ORIGIN, 'clear');

    expectSharedDeployedAttributes(setHeader);
    expect(setHeader).toContain('SameSite=Strict');
    expect(setHeader).not.toContain('Partitioned');

    expectSharedDeployedAttributes(clearHeader);
    expect(clearHeader).toContain('Max-Age=0');
    expect(clearHeader).toContain('SameSite=Strict');
    expect(clearHeader).not.toContain('Partitioned');
  });

  it('uses a partitioned cross-site cookie for the stable development Pages origin', async () => {
    const setHeader = await cookieHeader(PARTITIONED_ORIGIN, 'set');
    const clearHeader = await cookieHeader(PARTITIONED_ORIGIN, 'clear');

    expectSharedDeployedAttributes(setHeader);
    expect(setHeader).toContain('SameSite=None');
    expect(setHeader).toContain('Partitioned');

    expectSharedDeployedAttributes(clearHeader);
    expect(clearHeader).toContain('Max-Age=0');
    expect(clearHeader).toContain('SameSite=None');
    expect(clearHeader).toContain('Partitioned');
  });
});
