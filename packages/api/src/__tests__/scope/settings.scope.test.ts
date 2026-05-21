/**
 * Scope test for /settings/ai — paired self-only + negative-control.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { startPg, type PgFixture } from '../setup-pg.js';
import { createApp } from '../../app.js';
import { withScopedConnection } from '../../db/scope.js';
import { signTestToken } from '../../middleware/auth.js';
import { resetPool, getPool } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { makeUserId, makeSessionId } from '../factories/index.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let aliceSid: string;
let bobSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone) VALUES ($1, $2), ($3, $4)`,
    [alice, '+15551100001', bob, '+15551100002'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days'), ($3, $4, now() + interval '7 days')`,
    [aliceSid, alice, bobSid, bob],
  );
  // Seed bob with a row to differentiate from the absent-row default path.
  await admin.query(
    `INSERT INTO app.user_settings(user_id, ai_vendor, ai_model) VALUES ($1, 'kimi', 'kimi-bob-model')`,
    [bob],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: /settings/ai', () => {
  it('alice GET sees defaults (her row absent), not bob row', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    const body = (await res.json()) as { vendor: string; model: string };
    expect(body.vendor).toBe('openai');
    expect(body.model).not.toBe('kimi-bob-model');
  });

  it('bob GET sees his own row', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    const body = (await res.json()) as { vendor: string; model: string };
    expect(body.vendor).toBe('kimi');
    expect(body.model).toBe('kimi-bob-model');
  });

  it('paired — alice PATCH does not mutate bob row', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    await app.request('/settings/ai', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vendor: 'openai', model: 'gpt-4o' }),
    });
    const conn = await getPool().connect();
    try {
      const r = await conn.query<{ ai_vendor: string }>(
        `SELECT ai_vendor FROM app.user_settings WHERE user_id = $1`,
        [bob],
      );
      expect(r.rows[0]?.ai_vendor).toBe('kimi');
    } finally {
      conn.release();
    }
  });

  it('scope wrapper — direct SELECT under alice scope returns only alice row', async () => {
    const ids = await withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
      const r = await db.execute<{ user_id: string }>(sql`SELECT user_id FROM app.user_settings`);
      return r.rows.map((row) => row.user_id);
    });
    expect(ids).toContain(alice);
    expect(ids).not.toContain(bob);
  });

  it('negative control — same SELECT WITHOUT scope sees BOTH rows', async () => {
    const conn = await getPool().connect();
    try {
      const r = await drizzle(conn, { schema }).execute(
        sql`SELECT count(*)::int AS count FROM app.user_settings WHERE user_id IN (${sql.raw(`'${alice}', '${bob}'`)})`,
      );
      const count = Number((r.rows[0] as { count: number }).count);
      expect(count).toBe(2);
    } finally {
      conn.release();
    }
  });
});
