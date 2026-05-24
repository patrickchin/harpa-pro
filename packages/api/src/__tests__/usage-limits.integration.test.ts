/**
 * Integration tests for per-account usage limits.
 *
 * - `/me/limits` returns plan + buckets with live counts
 * - `/me/usage` extension surfaces `limits`
 * - Default wiring (Pitfall 13): when `llm_usage_events` shows the
 *   user at the plan cap, `runGenerate` is gated — no stubs.
 * - Cross-actor isolation: alice's overrides don't leak to bob.
 * - Admin path: PATCH plan + PUT/DELETE overrides hit the DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { newId } from '../lib/ids.js';
import { makeUserId, makeSessionId } from './factories/index.js';
import { withScopedConnection } from '../db/scope.js';
import { enforceTokenLimits, UsageLimitExceededError, attachUsageWarning } from '../services/usage-limits.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let adminUser: string;
let aliceSid: string;
let bobSid: string;
let adminSid: string;

async function seedUsageEvents(
  admin: pg.Client,
  userId: string,
  count: number,
  operation: 'generate_report' | 'transcribe' | 'chat',
  tokens?: { input: number; output: number },
) {
  const input = tokens?.input ?? 100;
  const output = tokens?.output ?? 50;
  for (let i = 0; i < count; i++) {
    await admin.query(
      `INSERT INTO app.llm_usage_events
         (id, user_id, vendor, model, operation, input_tokens, output_tokens, cached_tokens, latency_ms, fixture_mode, status)
       VALUES ($1, $2, 'fixture', 'fixture-model', $3::app.llm_operation, $4, $5, 0, 10, 'replay', 'ok')`,
      [newId('lue'), userId, operation, input, output],
    );
  }
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  adminUser = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  adminSid = makeSessionId();

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone, plan, is_admin) VALUES
       ($1, $2, 'free', false),
       ($3, $4, 'free', false),
       ($5, $6, 'pro', true)`,
    [alice, '+15550700001', bob, '+15550700002', adminUser, '+15550700003'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES
       ($1, $2, now() + interval '7 days'),
       ($3, $4, now() + interval '7 days'),
       ($5, $6, now() + interval '7 days')`,
    [aliceSid, alice, bobSid, bob, adminSid, adminUser],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('GET /me/limits', () => {
  it('returns plan defaults when no override and no usage', async () => {
    const app = createApp();
    const token = await signTestToken(bob, bobSid);
    const res = await app.request('/me/limits', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plan: string;
      buckets: Array<{ kind: string; limit: number | null; used: number; remaining: number | null; plan: string; overridden: boolean }>;
    };
    expect(body.plan).toBe('free');
    const reportBucket = body.buckets.find((b) => b.kind === 'report_generate');
    expect(reportBucket).toBeTruthy();
    expect(reportBucket!.limit).toBe(1_000);
    expect(reportBucket!.used).toBe(0);
    expect(reportBucket!.remaining).toBe(1_000);
    expect(reportBucket!.overridden).toBe(false);
  });

  it('reflects live counts from app.llm_usage_events', async () => {
    const client = new pg.Client({ connectionString: fx.url });
    await client.connect();
    await seedUsageEvents(client, alice, 3, 'generate_report');
    await client.end();

    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/limits', { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { buckets: Array<{ kind: string; used: number; remaining: number | null }> };
    const bucket = body.buckets.find((b) => b.kind === 'report_generate')!;
    expect(bucket.used).toBe(3);
    expect(bucket.remaining).toBe(997);
  });

  it('cross-actor isolation: bob still sees zero usage even after alice racks up rows', async () => {
    const app = createApp();
    const token = await signTestToken(bob, bobSid);
    const res = await app.request('/me/limits', { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { buckets: Array<{ kind: string; used: number }> };
    const bucket = body.buckets.find((b) => b.kind === 'report_generate')!;
    expect(bucket.used).toBe(0);
  });

  it('rejects anonymous (401)', async () => {
    const app = createApp();
    const res = await app.request('/me/limits');
    expect(res.status).toBe(401);
  });
});

describe('admin overrides', () => {
  it('PUT /admin/users/:id/limit-overrides bumps the cap', async () => {
    const app = createApp();
    const adminToken = await signTestToken(adminUser, adminSid);
    // Bump alice's report_generate to 50.
    const put = await app.request(`/admin/users/${alice}/limit-overrides`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ report_generate: 50, reason: 'test bump' }),
    });
    expect(put.status).toBe(200);

    // Alice should now see limit=50, overridden=true.
    const aliceToken = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/limits', { headers: { authorization: `Bearer ${aliceToken}` } });
    const body = (await res.json()) as { buckets: Array<{ kind: string; limit: number | null; overridden: boolean }> };
    const bucket = body.buckets.find((b) => b.kind === 'report_generate')!;
    expect(bucket.limit).toBe(50);
    expect(bucket.overridden).toBe(true);
  });

  it('DELETE /admin/users/:id/limit-overrides reverts to plan default', async () => {
    const app = createApp();
    const adminToken = await signTestToken(adminUser, adminSid);
    const del = await app.request(`/admin/users/${alice}/limit-overrides`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(del.status).toBe(200);

    const aliceToken = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/limits', { headers: { authorization: `Bearer ${aliceToken}` } });
    const body = (await res.json()) as { buckets: Array<{ kind: string; limit: number | null; overridden: boolean }> };
    const bucket = body.buckets.find((b) => b.kind === 'report_generate')!;
    expect(bucket.limit).toBe(1_000);
    expect(bucket.overridden).toBe(false);
  });

  it('non-admin caller gets 403 on admin routes', async () => {
    const app = createApp();
    const aliceToken = await signTestToken(alice, aliceSid);
    const res = await app.request(`/admin/users/${bob}/limit-overrides`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${aliceToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ report_generate: 99, reason: 'try' }),
    });
    expect(res.status).toBe(403);
  });

  it('PATCH /admin/users/:id/plan updates the plan column', async () => {
    const app = createApp();
    const adminToken = await signTestToken(adminUser, adminSid);
    const res = await app.request(`/admin/users/${bob}/plan`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'enterprise' }),
    });
    expect(res.status).toBe(200);

    const bobToken = await signTestToken(bob, bobSid);
    const limits = await app.request('/me/limits', { headers: { authorization: `Bearer ${bobToken}` } });
    const body = (await limits.json()) as { plan: string; buckets: Array<{ kind: string; limit: number | null }> };
    expect(body.plan).toBe('enterprise');
    // enterprise = unbounded = null on wire
    expect(body.buckets.find((b) => b.kind === 'report_generate')!.limit).toBe(null);
  });
});

describe('Phase 2 — token bucket post-hoc enforcement', () => {
  let charlie: string;
  let charlieSid: string;

  beforeAll(async () => {
    charlie = makeUserId();
    charlieSid = makeSessionId();
    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    await admin.query(
      `INSERT INTO auth.users(id, phone, plan, is_admin) VALUES ($1, $2, 'free', false)`,
      [charlie, '+15550700004'],
    );
    await admin.query(
      `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
      [charlieSid, charlie],
    );
    await admin.end();
  });

  it('enforceTokenLimits throws once seeded usage pushes input tokens at/past the free cap', async () => {
    // Free plan: ai_input_tokens = 200_000_000. Seed 2 rows ×
    // 110_000_000 = 220_000_000.
    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    await seedUsageEvents(admin, charlie, 2, 'chat', { input: 110_000_000, output: 1_000 });
    await admin.end();

    await expect(
      withScopedConnection({ sub: charlie, sid: charlieSid }, (d) =>
        enforceTokenLimits(d, charlie),
      ),
    ).rejects.toBeInstanceOf(UsageLimitExceededError);
  });

  it('enforceTokenLimits succeeds when usage is below the cap', async () => {
    const fresh = makeUserId();
    const freshSid = makeSessionId();
    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    await admin.query(
      `INSERT INTO auth.users(id, phone, plan, is_admin) VALUES ($1, $2, 'free', false)`,
      [fresh, '+15550700005'],
    );
    await admin.query(
      `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
      [freshSid, fresh],
    );
    await seedUsageEvents(admin, fresh, 1, 'chat', { input: 1_000, output: 500 });
    await admin.end();

    const result = await withScopedConnection({ sub: fresh, sid: freshSid }, (d) =>
      enforceTokenLimits(d, fresh),
    );
    expect(result.inputState.used).toBe(1_000);
    expect(result.outputState.used).toBe(500);
  });

  it('attachUsageWarning sets the X-Usage-Warning header when a bucket is ≥80% used', async () => {
    // Seed a fresh user with a low admin override (report_generate=5)
    // to 4/5 (80%) — same flow as the mobile near-limit toast in
    // design-maestro-full-regression.md. Using an override keeps the
    // test cheap; the production free-plan cap is 1_000 reports so
    // hitting 80% with real seed rows would mean inserting 800+ rows.
    const u = makeUserId();
    const sid = makeSessionId();
    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    await admin.query(
      `INSERT INTO auth.users(id, phone, plan, is_admin) VALUES ($1, $2, 'free', false)`,
      [u, '+15550700006'],
    );
    await admin.query(
      `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
      [sid, u],
    );
    await admin.query(
      `INSERT INTO app.user_limit_overrides
         (user_id, report_generate, reason, granted_by)
       VALUES ($1, 5, 'near-limit test', $1)`,
      [u],
    );
    await seedUsageEvents(admin, u, 4, 'generate_report');
    await admin.end();

    const captured: Record<string, string> = {};
    await withScopedConnection({ sub: u, sid }, (d) =>
      attachUsageWarning(d, u, (k, v) => {
        captured[k] = v;
      }),
    );
    expect(captured['X-Usage-Warning']).toBe('near-limit; bucket=report_generate; pct=80');
  });

  it('attachUsageWarning sets no header when no bucket is near-limit', async () => {
    const u = makeUserId();
    const sid = makeSessionId();
    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    await admin.query(
      `INSERT INTO auth.users(id, phone, plan, is_admin) VALUES ($1, $2, 'free', false)`,
      [u, '+15550700007'],
    );
    await admin.query(
      `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
      [sid, u],
    );
    await admin.end();
    const captured: Record<string, string> = {};
    await withScopedConnection({ sub: u, sid }, (d) =>
      attachUsageWarning(d, u, (k, v) => {
        captured[k] = v;
      }),
    );
    expect(captured['X-Usage-Warning']).toBeUndefined();
  });
});
