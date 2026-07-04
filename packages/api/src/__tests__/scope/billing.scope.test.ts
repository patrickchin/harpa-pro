import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { sql } from 'drizzle-orm';

import { getPool, resetPool } from '../../db/client.js';
import { withScopedConnection } from '../../db/scope.js';
import { makeSessionId, makeUserId } from '../factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from '../setup-pg.js';

let fx: PgFixture;
let admin: pg.Client;
let alice: string;
let bob: string;
let aliceSid: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  await seedAuthUsers(fx.url, [{ id: alice }, { id: bob }]);

  admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.billing_entitlements
       (user_id, provider, entitlement_id, product_id, store, active, expires_at)
     VALUES
       ($1, 'revenuecat', 'pro', 'harpa_pro_monthly', 'app_store', true, '2026-08-01T00:00:00Z'),
       ($2, 'revenuecat', 'pro', 'harpa_pro_annual', 'play_store', true, '2027-07-01T00:00:00Z')`,
    [alice, bob],
  );
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await fx?.stop();
}, 60_000);

describe('scope: billing entitlements', () => {
  it('lets Alice select only her own entitlement', async () => {
    const rows = await withScopedConnection(
      { sub: alice, sid: aliceSid },
      async (db) => {
        const result = await db.execute<{ user_id: string; product_id: string }>(sql`
          SELECT user_id, product_id
          FROM app.billing_entitlements
          ORDER BY user_id
        `);
        return result.rows;
      },
    );

    expect(rows).toEqual([
      { user_id: alice, product_id: 'harpa_pro_monthly' },
    ]);
  });

  it('does not grant scoped users insert access', async () => {
    await expect(
      withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
        await db.execute(sql`
          INSERT INTO app.billing_entitlements
            (user_id, provider, entitlement_id, active)
          VALUES (${alice}, 'revenuecat', 'pro', true)
        `);
      }),
    ).rejects.toThrow();
  });

  it('does not grant scoped users update access', async () => {
    await expect(
      withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
        await db.execute(sql`
          UPDATE app.billing_entitlements SET active = false WHERE user_id = ${alice}
        `);
      }),
    ).rejects.toThrow();
  });

  it('does not grant scoped users delete access', async () => {
    await expect(
      withScopedConnection({ sub: alice, sid: aliceSid }, async (db) => {
        await db.execute(sql`
          DELETE FROM app.billing_entitlements WHERE user_id = ${alice}
        `);
      }),
    ).rejects.toThrow();
  });

  it('unscoped negative control sees both rows', async () => {
    const result = await admin.query<{ user_id: string }>(
      `SELECT user_id FROM app.billing_entitlements ORDER BY user_id`,
    );

    expect(result.rows.map((row) => row.user_id)).toEqual([alice, bob].sort());
  });
});
