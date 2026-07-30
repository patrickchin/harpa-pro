import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { getAdminPool } from '../db/admin-client.js';
import { env } from '../env.js';
import {
  AdminPostgresRateLimiter,
  getAdminRateLimiter,
  resetAdminRateLimiter,
  setAdminRateLimiter,
} from '../lib/adminRateLimiter.js';
import {
  MemoryRateLimiter,
  resetRateLimiter,
  setRateLimiter,
  type RateLimiter,
  type RateLimiterResult,
} from '../lib/rateLimiter.js';
import { resetAdminReadyzCache } from '../routes/admin-readyz.js';
import { setAdminPassword } from '../services/admin-auth.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3002';
const ADMIN_EMAIL = 'rate-limit-admin@harpapro.com';
const ADMIN_PASSWORD = 'a deliberately long admin rate limit password';
const MINUTE_MS = 60_000;

const runtimeEnv = env as typeof env & {
  RATE_LIMIT_BACKEND: 'memory' | 'postgres';
};

type ConsumeCall = {
  key: string;
  limit: number;
  windowMs: number;
};

class RecordingRateLimiter implements RateLimiter {
  readonly calls: ConsumeCall[] = [];

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    this.calls.push({ key, limit, windowMs });
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - 1),
      reset: Date.now() + windowMs,
    };
  }
}

class FailingAppRateLimiter implements RateLimiter {
  calls = 0;

  async consume(): Promise<RateLimiterResult> {
    this.calls += 1;
    throw new Error('application database limiter must not run');
  }
}

class ForcedTargetRateLimiter extends MemoryRateLimiter {
  constructor(private readonly targetPrefix: string) {
    super();
  }

  override consume(key: string, limit: number, windowMs: number) {
    return super.consume(key, key.startsWith(this.targetPrefix) ? 1 : limit, windowMs);
  }
}

let adminFx: AdminPgFixture;
let originalBackend: 'memory' | 'postgres';

beforeAll(async () => {
  adminFx = await startAdminPg();
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  getAdminPool(adminFx.url);
  await setAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  originalBackend = runtimeEnv.RATE_LIMIT_BACKEND;
}, 120_000);

afterAll(async () => {
  resetAdminRateLimiter();
  runtimeEnv.RATE_LIMIT_BACKEND = originalBackend;
  delete process.env.ADMIN_DATABASE_URL;
  await adminFx?.stop();
}, 60_000);

beforeEach(async () => {
  runtimeEnv.RATE_LIMIT_BACKEND = 'memory';
  resetAdminRateLimiter();
  resetRateLimiter();
  resetAdminReadyzCache();
  await getAdminPool().query('TRUNCATE admin.rate_limit_buckets');
});

async function login(
  ip: string,
  options: { cfIp?: string; password?: string } = {},
): Promise<Response> {
  return createApp().request('/admin/auth/login', {
    method: 'POST',
    headers: {
      'fly-client-ip': ip,
      ...(options.cfIp ? { 'cf-connecting-ip': options.cfIp } : {}),
      'content-type': 'application/json',
      origin: ADMIN_ORIGIN,
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: options.password ?? ADMIN_PASSWORD,
    }),
  });
}

describe('dedicated admin rate limiter', () => {
  it('migration creates the isolated bucket table and records its head', async () => {
    const result = await getAdminPool().query<{
      table_name: string;
      row_security: boolean;
    }>(
      `SELECT c.relname AS table_name, c.relrowsecurity AS row_security
       FROM pg_class AS c
       JOIN pg_namespace AS n ON n.oid = c.relnamespace
       WHERE n.nspname = 'admin'
         AND c.relname = 'rate_limit_buckets'`,
    );
    const head = await getAdminPool().query<{ name: string }>(
      `SELECT name FROM admin._migrations ORDER BY name DESC LIMIT 1`,
    );
    const countCheck = await getAdminPool().query<{ name: string }>(
      `SELECT conname AS name
       FROM pg_constraint
       WHERE conrelid = 'admin.rate_limit_buckets'::regclass
         AND contype = 'c'`,
    );

    expect(result.rows).toEqual([{ table_name: 'rate_limit_buckets', row_security: true }]);
    expect(head.rows).toEqual([{ name: '0002_admin_rate_limit_buckets.sql' }]);
    expect(countCheck.rows).toEqual([{ name: 'admin_rate_limit_buckets_count_check' }]);
  });

  it('atomically enforces one budget across independent Postgres limiter instances', async () => {
    const firstMachine = new AdminPostgresRateLimiter(getAdminPool());
    const secondMachine = new AdminPostgresRateLimiter(getAdminPool());

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 === 0 ? firstMachine : secondMachine).consume(
          'admin-login:shared',
          10,
          MINUTE_MS,
        ),
      ),
    );
    const persisted = await getAdminPool().query<{ count: number }>(
      `SELECT count
       FROM admin.rate_limit_buckets
       WHERE bucket_key LIKE 'admin-login:shared|%'`,
    );

    expect(results.filter((result) => result.success)).toHaveLength(10);
    expect(results.filter((result) => !result.success)).toHaveLength(10);
    expect(persisted.rows).toEqual([{ count: 20 }]);
  });

  it('selects the admin Postgres backend when deployed rate limiting is enabled', async () => {
    runtimeEnv.RATE_LIMIT_BACKEND = 'postgres';
    resetAdminRateLimiter();

    const limiter = getAdminRateLimiter();
    expect(limiter).toBeInstanceOf(AdminPostgresRateLimiter);
    await limiter.consume('admin-default-wiring', 2, MINUTE_MS);

    const persisted = await getAdminPool().query<{ count: number }>(
      `SELECT count
       FROM admin.rate_limit_buckets
       WHERE bucket_key LIKE 'admin-default-wiring|%'`,
    );
    expect(persisted.rows).toEqual([{ count: 1 }]);
  });

  it('uses the admin limiter for all login budgets and bypasses the app limiter', async () => {
    const appLimiter = new FailingAppRateLimiter();
    const adminLimiter = new RecordingRateLimiter();
    setRateLimiter(appLimiter);
    setAdminRateLimiter(adminLimiter);

    const login = await createApp().request('/admin/auth/login', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '203.0.113.25',
        'content-type': 'application/json',
        origin: ADMIN_ORIGIN,
      },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    });

    expect(login.status).toBe(200);
    expect(appLimiter.calls).toBe(0);
    expect(adminLimiter.calls).toEqual([
      {
        key: 'admin.auth.ip.1m:fn:203.0.113.25',
        limit: 120,
        windowMs: MINUTE_MS,
      },
      {
        key: 'admin.auth.login.ip.1m:fn:203.0.113.25',
        limit: 3,
        windowMs: MINUTE_MS,
      },
      {
        key: 'admin.auth.login.ip.15m:fn:203.0.113.25',
        limit: 20,
        windowMs: 15 * MINUTE_MS,
      },
      {
        key:
          'admin.auth.login.email.15m:fn:' + createHash('sha256').update(ADMIN_EMAIL).digest('hex'),
        limit: 5,
        windowMs: 15 * MINUTE_MS,
      },
    ]);

    const ready = await createApp().request('/admin/readyz');
    expect(ready.status).toBe(200);
    expect(appLimiter.calls).toBe(0);
  });

  it('keeps one admin IP bucket when an attacker varies CF-Connecting-IP', async () => {
    const appLimiter = new FailingAppRateLimiter();
    const adminLimiter = new RecordingRateLimiter();
    setRateLimiter(appLimiter);
    setAdminRateLimiter(adminLimiter);

    const first = await login('203.0.113.51', {
      cfIp: '198.51.100.11',
    });
    const second = await login('203.0.113.51', {
      cfIp: '198.51.100.12',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const ipWindowKeys = adminLimiter.calls
      .filter((call) => call.key.startsWith('admin.auth.login.ip.15m:'))
      .map((call) => call.key);
    expect(ipWindowKeys).toEqual([
      'admin.auth.login.ip.15m:fn:203.0.113.51',
      'admin.auth.login.ip.15m:fn:203.0.113.51',
    ]);
    expect(appLimiter.calls).toBe(0);
  });

  it('returns 429 when the admin per-IP login bucket is exhausted', async () => {
    const appLimiter = new FailingAppRateLimiter();
    setRateLimiter(appLimiter);
    setAdminRateLimiter(new ForcedTargetRateLimiter('admin.auth.login.ip.15m:'));

    const first = await login('203.0.113.31');
    const limited = await login('203.0.113.31');

    expect(first.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('x-ratelimit-limit')).toBe('1');
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: 'rate_limited' },
    });
    expect(appLimiter.calls).toBe(0);
  });

  it('rate-limits session lookup and logout through the admin backend', async () => {
    const appLimiter = new FailingAppRateLimiter();
    const invalidCookie = `harpa_admin_session=${'A'.repeat(43)}`;
    setRateLimiter(appLimiter);
    setAdminRateLimiter(new ForcedTargetRateLimiter('admin.auth.ip.1m:'));

    const firstSession = await createApp().request('/admin/auth/session', {
      headers: {
        cookie: invalidCookie,
        'fly-client-ip': '203.0.113.61',
      },
    });
    const limitedSession = await createApp().request('/admin/auth/session', {
      headers: {
        cookie: invalidCookie,
        'fly-client-ip': '203.0.113.61',
      },
    });

    expect(firstSession.status).toBe(401);
    expect(limitedSession.status).toBe(429);

    setAdminRateLimiter(new ForcedTargetRateLimiter('admin.auth.ip.1m:'));
    const firstLogout = await createApp().request('/admin/auth/logout', {
      method: 'POST',
      headers: {
        cookie: invalidCookie,
        'fly-client-ip': '203.0.113.62',
        origin: ADMIN_ORIGIN,
      },
    });
    const limitedLogout = await createApp().request('/admin/auth/logout', {
      method: 'POST',
      headers: {
        cookie: invalidCookie,
        'fly-client-ip': '203.0.113.62',
        origin: ADMIN_ORIGIN,
      },
    });

    expect(firstLogout.status).toBe(401);
    expect(limitedLogout.status).toBe(429);
    expect(appLimiter.calls).toBe(0);
  });

  it('returns 429 when the admin per-email login bucket is exhausted', async () => {
    const appLimiter = new FailingAppRateLimiter();
    setRateLimiter(appLimiter);
    setAdminRateLimiter(new ForcedTargetRateLimiter('admin.auth.login.email.15m:'));

    const first = await login('203.0.113.41');
    const limited = await login('203.0.113.42', {
      password: 'wrong password deliberately long enough',
    });

    expect(first.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('x-ratelimit-limit')).toBe('1');
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: 'rate_limited' },
    });
    expect(appLimiter.calls).toBe(0);
  });

  it('does not let five wrong attempts block a later correct password', async () => {
    const appLimiter = new FailingAppRateLimiter();
    setRateLimiter(appLimiter);

    const wrongAttempts: Response[] = [];
    for (let index = 0; index < 5; index += 1) {
      wrongAttempts.push(
        await login(`203.0.113.${70 + index}`, {
          password: 'wrong password deliberately long enough',
        }),
      );
    }
    const correct = await login('203.0.113.75');

    expect(wrongAttempts.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    expect(correct.status).toBe(200);
    expect(correct.headers.get('x-ratelimit-limit')).toBe('5');
    expect(correct.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(appLimiter.calls).toBe(0);
  });
});
