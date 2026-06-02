/**
 * Race-safety contract for `setReportBody(snapshotTs)`.
 *
 * The auto-regenerator captures `notes_changed_at` BEFORE the AI call and
 * passes it as `snapshotTs` when persisting the body. `generated_at` must
 * become that snapshot value (NOT `now()`) so any concurrent note bump
 * that landed during the multi-second AI call keeps
 * `notes_changed_at > generated_at` and the queue-of-one fires another
 * regen. See spec §80-100 + plan Task 3.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { startPg, type PgFixture } from './setup-pg.js';
import * as schema from '../db/schema.js';
import { setReportBody } from '../services/reports.js';
import { makeUserId, makeProjectId, makeReportId } from './factories/index.js';

let fx: PgFixture;
let pool: pg.Pool;
let userId: string;
let projectId: string;
let reportId: string;

beforeAll(async () => {
  fx = await startPg();
  pool = new pg.Pool({ connectionString: fx.url });
  userId = makeUserId();
  projectId = makeProjectId();
  reportId = makeReportId();
  // Bypass per-request RLS by using the admin role directly — this file
  // tests the SQL semantic of one helper, not the auth surface.
  await pool.query(`INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES ($1, 'Alice', 'alice@example.com', true, now(), now())`, [userId]);
  await pool.query(`INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'snap', $2)`, [projectId, userId]);
  await pool.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [projectId, userId],
  );
  await pool.query(
    `INSERT INTO app.reports(id, project_id, author_id, number, status) VALUES ($1, $2, $3, 1, 'draft')`,
    [reportId, projectId, userId],
  );
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await fx?.stop();
}, 60_000);

const body = { sections: [], notes: [] } as never;

describe('setReportBody snapshot semantic', () => {
  it('sets generated_at = snapshotTs when provided (NOT now())', async () => {
    // Pin the report's notes_changed_at to a known past value, then capture
    // it as the snapshot before persisting body.
    const past = new Date(Date.now() - 60_000).toISOString();
    await pool.query(`UPDATE app.reports SET notes_changed_at = $1 WHERE id = $2`, [past, reportId]);

    const db = drizzle(pool, { schema });
    const updated = await setReportBody(db, reportId, body, undefined, past);
    expect(updated).not.toBeNull();
    expect(updated!.generatedAt).not.toBeNull();
    // generated_at must equal the snapshot, not now()
    const diff = Math.abs(
      new Date(updated!.generatedAt!).getTime() - new Date(past).getTime(),
    );
    expect(diff).toBeLessThan(1_000);
  });

  it('preserves dirty bit when a note bump lands during the AI call (race scenario)', async () => {
    // T0: capture snapshot
    await pool.query(
      `UPDATE app.reports SET notes_changed_at = now() - interval '5 seconds', generated_at = NULL WHERE id = $1`,
      [reportId],
    );
    const snap = await pool.query<{ notes_changed_at: Date }>(
      `SELECT notes_changed_at FROM app.reports WHERE id = $1`,
      [reportId],
    );
    const snapshotTs = snap.rows[0]!.notes_changed_at.toISOString();

    // T0.5: simulate concurrent note add bumping notes_changed_at while
    // the AI call is in flight.
    await pool.query(
      `UPDATE app.reports SET notes_changed_at = now() WHERE id = $1`,
      [reportId],
    );

    // T1: AI returns, persist body with the snapshot we captured at T0.
    const db = drizzle(pool, { schema });
    const updated = await setReportBody(db, reportId, body, undefined, snapshotTs);
    expect(updated).not.toBeNull();

    // Auto-regen check: notes_changed_at must still be > generated_at so
    // the dirty bit survives the in-flight write.
    expect(updated!.notesChangedAt).not.toBeNull();
    expect(new Date(updated!.notesChangedAt!).getTime()).toBeGreaterThan(
      new Date(updated!.generatedAt!).getTime(),
    );
  });

  it('falls back to now() when snapshotTs is omitted (first-time generate / manual edit)', async () => {
    await pool.query(`UPDATE app.reports SET generated_at = NULL WHERE id = $1`, [reportId]);
    const db = drizzle(pool, { schema });
    const t0 = Date.now();
    const updated = await setReportBody(db, reportId, body);
    const t1 = Date.now();
    expect(updated!.generatedAt).not.toBeNull();
    const gen = new Date(updated!.generatedAt!).getTime();
    // Within the wall-clock window of the call.
    expect(gen).toBeGreaterThanOrEqual(t0 - 1_000);
    expect(gen).toBeLessThanOrEqual(t1 + 1_000);
  });

  it('still resets notes_since_last_generation counter during expand window', async () => {
    await pool.query(
      `UPDATE app.reports SET notes_since_last_generation = 7 WHERE id = $1`,
      [reportId],
    );
    const db = drizzle(pool, { schema });
    await setReportBody(db, reportId, body, undefined, new Date().toISOString());
    const after = await pool.query<{ n: number }>(
      `SELECT notes_since_last_generation AS n FROM app.reports WHERE id = $1`,
      [reportId],
    );
    expect(after.rows[0]!.n).toBe(0);
  });
});

// silence unused-import linter without restructuring
void sql;
