import { operations } from '@harpa/api-contract';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getAdminPool, resetAdminPool } from '../db/admin-client.js';
import { getPool, resetPool } from '../db/client.js';
import { resetAdminRateLimiter, setAdminRateLimiter } from '../lib/adminRateLimiter.js';
import {
  resetRateLimiter,
  setRateLimiter,
  type RateLimiter,
  type RateLimiterResult,
} from '../lib/rateLimiter.js';
import { setAdminPassword } from '../services/admin-auth.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'storage-lifecycle-operations@harpapro.com';
const ADMIN_PASSWORD = 'storage lifecycle operations admin password deliberately long';
const ADMIN_CLIENT_IP = '203.0.113.84';
const FIRST_USER_ID = 'usr_01234567';
const SECOND_USER_ID = 'usr_01234568';
const ARMED_AT = '2026-08-08T07:40:00.000Z';
const ENFORCE_AFTER = '2026-08-08T07:45:00.000Z';
const UPDATED_AT = '2026-08-08T07:50:00.000Z';
const OLDEST_DUE_AT = '2000-01-01T00:00:00.000Z';
const NEXT_RUN_AFTER = '2099-01-01T00:00:00.000Z';
const PAYLOAD_USER_SECRET = 'usr_payload_secret';
const EXACT_KEY_SECRET = 'users/private/exact-object.jpg';
const SWEEP_PREFIX_SECRET = 'users/private/sweep/';
const RETRY_ERROR_SECRET = 'provider rejected secret object key';
const EXPECTED_CAVEATS = [
  'db_state_not_worker_liveness',
  'queue_counts_not_provider_health',
  'empty_queue_not_execution_proof',
] as const;

let appFx: PgFixture;
let adminFx: AdminPgFixture;
let adminCookie: string;
let adminRateLimiter: RecordingRateLimiter;
let providerFetch: ReturnType<typeof vi.fn<typeof fetch>>;

class RecordingRateLimiter implements RateLimiter {
  readonly calls: Array<{ key: string; limit: number; windowMs: number }> = [];

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    this.calls.push({ key, limit, windowMs });
    return { success: true, limit, remaining: limit - 1, reset: Date.now() + windowMs };
  }
}

class FailingAppRateLimiter implements RateLimiter {
  async consume(): Promise<RateLimiterResult> {
    throw new Error('application rate limiter must not run for dedicated admin operations');
  }
}

function limiterName(key: string): string {
  const separator = key.indexOf(':fn:');
  return separator === -1 ? key : key.slice(0, separator);
}

function adminRequest(cookie = adminCookie): RequestInit {
  return {
    headers: {
      cookie,
      origin: ADMIN_ORIGIN,
      'fly-client-ip': ADMIN_CLIENT_IP,
    },
  };
}

async function resetLifecycleState(): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM app.storage_delete_jobs');
  await pool.query(
    `INSERT INTO app.storage_lifecycle_rollout (
       singleton, enforce_after, account_delete_enabled, armed_at, updated_at
     ) VALUES (true, $1, true, $2, $3)
     ON CONFLICT (singleton) DO UPDATE
       SET enforce_after = EXCLUDED.enforce_after,
           account_delete_enabled = EXCLUDED.account_delete_enabled,
           armed_at = EXCLUDED.armed_at,
           updated_at = EXCLUDED.updated_at`,
    [ENFORCE_AFTER, ARMED_AT, UPDATED_AT],
  );
}

async function seedQueueSnapshot(): Promise<void> {
  const payload = JSON.stringify({
    userId: PAYLOAD_USER_SECRET,
    exactKeys: [EXACT_KEY_SECRET],
    sweepPrefixes: [SWEEP_PREFIX_SECRET],
  });
  await getPool().query(
    `INSERT INTO app.storage_delete_jobs (
       user_id, job_kind, run_after, payload, attempt_count, locked_at, last_error
     ) VALUES
       ($1, 'account_delete_initial', $3, $7::jsonb, 3, NULL, $8),
       ($1, 'account_delete_final', $4, $7::jsonb, 1, clock_timestamp(), NULL),
       ($2, 'account_delete_initial', $5, $7::jsonb, 7, '2000-01-01T00:00:00Z', $8),
       ($2, 'account_delete_final', $6, $7::jsonb, 0, NULL, NULL)`,
    [
      FIRST_USER_ID,
      SECOND_USER_ID,
      OLDEST_DUE_AT,
      '2000-01-02T00:00:00.000Z',
      '2000-01-03T00:00:00.000Z',
      NEXT_RUN_AFTER,
      payload,
      RETRY_ERROR_SECRET,
    ],
  );
}

beforeAll(async () => {
  [appFx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = appFx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  await resetAdminPool();
  getPool(appFx.url);
  getAdminPool(adminFx.url);

  await seedAuthUsers(appFx.url, [
    {
      id: FIRST_USER_ID,
      email: 'storage-lifecycle-one@example.com',
      displayName: 'Storage lifecycle one',
    },
    {
      id: SECOND_USER_ID,
      email: 'storage-lifecycle-two@example.com',
      displayName: 'Storage lifecycle two',
    },
  ]);

  await setAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  const login = await createApp().request('/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ADMIN_ORIGIN,
      'fly-client-ip': ADMIN_CLIENT_IP,
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (login.status !== 200) throw new Error(`dedicated admin login failed with ${login.status}`);
  const setCookie = login.headers.get('set-cookie');
  if (!setCookie) throw new Error('dedicated admin login did not set a cookie');
  adminCookie = setCookie.split(';')[0]!;
}, 120_000);

beforeEach(async () => {
  resetRateLimiter();
  setRateLimiter(new FailingAppRateLimiter());
  adminRateLimiter = new RecordingRateLimiter();
  setAdminRateLimiter(adminRateLimiter);
  providerFetch = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', providerFetch);
  await resetLifecycleState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  resetRateLimiter();
  resetAdminRateLimiter();
  await Promise.all([resetPool(), resetAdminPool()]);
  await Promise.all([appFx?.stop(), adminFx?.stop()]);
}, 60_000);

describe('GET /admin/operations/storage-lifecycle', () => {
  it('uses one real app-DB statement and returns only the reviewed aggregate snapshot', async () => {
    await seedQueueSnapshot();
    const applicationQuery = vi.spyOn(getPool(), 'query');

    const response = await createApp().request(
      '/admin/operations/storage-lifecycle',
      adminRequest(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = operations.storageLifecycleObservation.parse(await response.json());
    expect(body).toEqual({
      observedAt: expect.any(String),
      status: 'available',
      rollout: {
        armedAt: ARMED_AT,
        enforceAfter: ENFORCE_AFTER,
        accountDeleteEnabled: true,
        leaseEnforcementActive: true,
        accountDeletionAvailable: true,
        updatedAt: UPDATED_AT,
      },
      jobs: {
        total: 4,
        initial: 2,
        final: 2,
        dueNow: 3,
        scheduled: 1,
        activeClaims: 1,
        staleClaims: 1,
        retrying: 2,
        maxAttemptCount: 7,
        oldestDueAt: OLDEST_DUE_AT,
        nextRunAfter: NEXT_RUN_AFTER,
      },
      caveats: EXPECTED_CAVEATS,
    });

    expect(applicationQuery).toHaveBeenCalledOnce();
    const [rawSql, values] = applicationQuery.mock.calls[0] ?? [];
    const sql = String(rawSql).replace(/\s+/g, ' ').trim().toLowerCase();
    expect(values).toEqual([]);
    expect(sql).toContain('clock_timestamp()');
    expect(sql).toContain('from app.storage_lifecycle_rollout');
    expect(sql).toContain('from app.storage_delete_jobs');
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).not.toMatch(/\buser_id\b|\bpayload\b/);
    expect(sql).not.toContain('last_error as');
    expect(sql).not.toContain('locked_at as');
    expect(providerFetch).not.toHaveBeenCalled();

    const serialized = JSON.stringify(body);
    for (const secret of [
      FIRST_USER_ID,
      SECOND_USER_ID,
      PAYLOAD_USER_SECRET,
      EXACT_KEY_SECRET,
      SWEEP_PREFIX_SECRET,
      RETRY_ERROR_SECRET,
      'last_error',
      'locked_at',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(adminRateLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.storage-lifecycle.read.1m',
    ]);
    expect(adminRateLimiter.calls[0]).toEqual({
      key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
      limit: 120,
      windowMs: 60_000,
    });
    expect(adminRateLimiter.calls[1]).toMatchObject({ limit: 12, windowMs: 60_000 });
  });

  it('fails closed when the rollout singleton is missing without a second query', async () => {
    await getPool().query('DELETE FROM app.storage_lifecycle_rollout');
    const applicationQuery = vi.spyOn(getPool(), 'query');

    const response = await createApp().request(
      '/admin/operations/storage-lifecycle',
      adminRequest(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      observedAt: expect.any(String),
      status: 'unknown',
      reason: 'rollout_state_missing',
    });
    expect(applicationQuery).toHaveBeenCalledOnce();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('runs no-store and the trusted IP window before rejecting an absent admin cookie', async () => {
    const applicationQuery = vi.spyOn(getPool(), 'query');

    const response = await createApp().request('/admin/operations/storage-lifecycle', {
      headers: { 'fly-client-ip': ADMIN_CLIENT_IP },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(applicationQuery).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
    expect(adminRateLimiter.calls).toEqual([
      {
        key: `admin.auth.ip.1m:fn:${ADMIN_CLIENT_IP}`,
        limit: 120,
        windowMs: 60_000,
      },
    ]);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-an-ip'],
  ] as const)(
    'uses the shared unknown IP bucket for %s Fly metadata without skipping the authenticated read',
    async (_label, flyClientIp) => {
      const applicationQuery = vi.spyOn(getPool(), 'query');
      const headers: Record<string, string> = {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
      };
      if (flyClientIp !== undefined) headers['fly-client-ip'] = flyClientIp;

      const response = await createApp().request('/admin/operations/storage-lifecycle', {
        headers,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      await expect(response.json()).resolves.toMatchObject({ status: 'available' });
      expect(applicationQuery).toHaveBeenCalledOnce();
      expect(providerFetch).not.toHaveBeenCalled();
      expect(adminRateLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
        'admin.auth.ip.1m',
        'admin.operations.storage-lifecycle.read.1m',
      ]);
      expect(adminRateLimiter.calls[0]).toEqual({
        key: 'admin.auth.ip.1m:fn:unknown',
        limit: 120,
        windowMs: 60_000,
      });
      expect(adminRateLimiter.calls[1]).toMatchObject({ limit: 12, windowMs: 60_000 });
    },
  );

  it('keeps no-store and rejects on its isolated 12/min session budget before the app DB', async () => {
    class RejectingStorageLifecycleLimiter extends RecordingRateLimiter {
      override async consume(
        key: string,
        limit: number,
        windowMs: number,
      ): Promise<RateLimiterResult> {
        const result = await super.consume(key, limit, windowMs);
        return key.startsWith('admin.operations.storage-lifecycle.read.1m:')
          ? { ...result, success: false, remaining: 0 }
          : result;
      }
    }
    const rejectingLimiter = new RejectingStorageLifecycleLimiter();
    setAdminRateLimiter(rejectingLimiter);
    const applicationQuery = vi.spyOn(getPool(), 'query');

    const response = await createApp().request(
      '/admin/operations/storage-lifecycle',
      adminRequest(),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(applicationQuery).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
    expect(rejectingLimiter.calls.map(({ key }) => limiterName(key))).toEqual([
      'admin.auth.ip.1m',
      'admin.operations.storage-lifecycle.read.1m',
    ]);
    expect(rejectingLimiter.calls[1]).toMatchObject({ limit: 12, windowMs: 60_000 });
  });
});
