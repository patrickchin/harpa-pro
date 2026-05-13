/**
 * Scope test for app.waitlist_signups — the public waitlist endpoint
 * is unauthenticated, so this test pins a connection to the
 * `app_anonymous` role and proves that:
 *
 *   ✓ anon CAN INSERT a signup
 *   ✗ anon CANNOT SELECT
 *   ✗ anon CANNOT UPDATE
 *   ✗ anon CANNOT DELETE
 *
 * Plus a negative control proving the role wrapper is what isolates
 * the table — without it, a superuser connection sees rows freely.
 *
 * See packages/api/migrations/202605130002_waitlist.sql and
 * docs/marketing/plan-m1-waitlist.md §M1.1.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { startPg, type PgFixture } from '../setup-pg.js';
import { withAnonConnection } from '../../db/scope.js';
import { resetPool, getPool } from '../../db/client.js';

let fx: PgFixture;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  // Seed a confirmed signup as superuser so the SELECT-denied test has
  // something to *not* see (otherwise an empty result looks like success).
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.waitlist_signups(email, confirmed_at) VALUES ($1, now())`,
    ['existing@buildco.com'],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: app.waitlist_signups (anonymous)', () => {
  it('anon CAN INSERT a new signup', async () => {
    await withAnonConnection(async (db) => {
      await db.execute(sql`
        INSERT INTO app.waitlist_signups(email, confirm_token_hash, confirm_token_expires_at)
        VALUES ('new@buildco.com', 'hash-placeholder', now() + interval '7 days')
      `);
    });
    // Verify via privileged path that the row really exists.
    const r = await getPool().query<{ email: string }>(
      `SELECT email::text AS email FROM app.waitlist_signups WHERE email = 'new@buildco.com'`,
    );
    expect(r.rowCount).toBe(1);
  });

  it('anon CANNOT SELECT', async () => {
    await expect(
      withAnonConnection(async (db) => {
        await db.execute(sql`SELECT email FROM app.waitlist_signups`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('anon CANNOT UPDATE', async () => {
    await expect(
      withAnonConnection(async (db) => {
        await db.execute(
          sql`UPDATE app.waitlist_signups SET confirmed_at = now() WHERE email = 'existing@buildco.com'`,
        );
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('anon CANNOT DELETE', async () => {
    await expect(
      withAnonConnection(async (db) => {
        await db.execute(sql`DELETE FROM app.waitlist_signups`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('negative control — superuser CAN SELECT (proves the test is not a false-positive)', async () => {
    const r = await getPool().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM app.waitlist_signups`,
    );
    expect(Number(r.rows[0]!.count)).toBeGreaterThanOrEqual(1);
  });

  it('email uniqueness — duplicate INSERT fails for anon', async () => {
    await expect(
      withAnonConnection(async (db) => {
        await db.execute(sql`
          INSERT INTO app.waitlist_signups(email)
          VALUES ('existing@buildco.com')
        `);
      }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
