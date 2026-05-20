/**
 * Scope test for /files/* — owner-only via app.files.files_owner_all RLS.
 * Paired (own/cross) + negative-control proving the scope wrapper is the
 * thing protecting the table (not RLS-by-luck).
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
import { makeUserId, makeSessionId, makeFileId } from '../factories/index.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let aliceSid: string;
let bobSid: string;
let aliceFile: string;
let bobFile: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  aliceFile = makeFileId();
  bobFile = makeFileId();

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone) VALUES ($1, $2), ($3, $4)`,
    [alice, '+15551300001', bob, '+15551300002'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days'), ($3, $4, now() + interval '7 days')`,
    [aliceSid, alice, bobSid, bob],
  );
  // Seed a file for each user.
  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, $2, 'voice', $3, 100, 'audio/m4a')`,
    [aliceFile, alice, `users/${alice}/voice/seed-alice.m4a`],
  );
  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, $2, 'voice', $3, 100, 'audio/m4a')`,
    [bobFile, bob, `users/${bob}/voice/seed-bob.m4a`],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: /files/*', () => {
  it('alice GET /files/:id/url for her own file → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/files/${aliceFile}/url`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
  });

  it('paired — alice cannot GET bob file URL (RLS hides → 404)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/files/${bobFile}/url`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('paired — bob cannot GET alice file URL (cross-owner)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/files/${aliceFile}/url`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('register cannot impersonate another user via prefix-spoof (400)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/files', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'voice',
        fileKey: `users/${bob}/voice/spoof.m4a`,
        sizeBytes: 1,
        contentType: 'audio/m4a',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('scope wrapper — direct SELECT under alice scope sees only her file', async () => {
    const ids = await withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
      const r = await db.execute<{ id: string }>(sql`SELECT id FROM app.files`);
      return r.rows.map((row) => row.id);
    });
    expect(ids).toContain(aliceFile);
    expect(ids).not.toContain(bobFile);
  });

  it('negative control — same SELECT WITHOUT scope sees BOTH files', async () => {
    const conn = await getPool().connect();
    try {
      const r = await drizzle(conn, { schema }).execute(
        sql`SELECT count(*)::int AS count FROM app.files WHERE id IN (${sql.raw(`'${aliceFile}', '${bobFile}'`)})`,
      );
      const count = Number((r.rows[0] as { count: number }).count);
      expect(count).toBe(2);
    } finally {
      conn.release();
    }
  });
});
