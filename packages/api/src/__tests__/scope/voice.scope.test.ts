/**
 * Scope test for /voice/* — file-ownership isolation on /voice/transcribe.
 *
 * Mirrors files.scope.test.ts: paired alice/bob over the route + a
 * negative control that proves the SCOPED ACCESSOR (not luck, not RLS-
 * by-coincidence) is what's hiding bob's row from alice.
 *
 * /voice/summarize takes only a free-text transcript — no scoped
 * resource — so it's covered by the integration suite (auth-only).
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
import { getFileById } from '../../services/files.js';
import * as schema from '../../db/schema.js';

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
  delete process.env.AI_LIVE;
  await resetPool();
  getPool(fx.url);
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  const u = await admin.query<{ id: string }>(
    `INSERT INTO auth.users(phone) VALUES ($1), ($2) RETURNING id`,
    ['+15551500001', '+15551500002'],
  );
  alice = u.rows[0]!.id;
  bob = u.rows[1]!.id;
  const s = await admin.query<{ id: string }>(
    `INSERT INTO auth.sessions(user_id, expires_at)
     VALUES ($1, now() + interval '7 days'), ($2, now() + interval '7 days') RETURNING id`,
    [alice, bob],
  );
  aliceSid = s.rows[0]!.id;
  bobSid = s.rows[1]!.id;
  const af = await admin.query<{ id: string }>(
    `INSERT INTO app.files(owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, 'voice', $2, 100, 'audio/m4a') RETURNING id`,
    [alice, `users/${alice}/voice/scope-alice.m4a`],
  );
  aliceFile = af.rows[0]!.id;
  const bf = await admin.query<{ id: string }>(
    `INSERT INTO app.files(owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, 'voice', $2, 100, 'audio/m4a') RETURNING id`,
    [bob, `users/${bob}/voice/scope-bob.m4a`],
  );
  bobFile = bf.rows[0]!.id;
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: /voice/*', () => {
  it('alice POST /voice/transcribe for her own file → 200', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fileId: aliceFile }),
    });
    expect(res.status).toBe(200);
  });

  it("paired — alice POST /voice/transcribe for bob's file → 404 (RLS hides)", async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fileId: bobFile }),
    });
    expect(res.status).toBe(404);
  });

  it("paired — bob POST /voice/transcribe for alice's file → 404 (cross-owner)", async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fileId: aliceFile }),
    });
    expect(res.status).toBe(404);
  });

  it('scope wrapper — getFileById(bob.file) under alice scope returns null', async () => {
    const row = await withScopedConnection({ sub: alice, sid: aliceSid }, (db) =>
      getFileById(db, bobFile),
    );
    expect(row).toBeNull();
  });

  it('negative control — getFileById(bob.file) WITHOUT the scoped wrapper returns the row', async () => {
    // Demonstrates that the per-request scoped accessor is the ONLY thing
    // standing between alice's transcribe handler and bob's audio file.
    // If the route handler ever bypassed `c.get('db')` (e.g., grabbed a
    // raw pool connection), bob's file would be discoverable by id.
    const conn = await getPool().connect();
    try {
      const r = await drizzle(conn, { schema }).execute<{ id: string; owner_id: string }>(
        sql`SELECT id, owner_id FROM app.files WHERE id = ${bobFile}::uuid`,
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]!.owner_id).toBe(bob);
    } finally {
      conn.release();
    }
  });
});
