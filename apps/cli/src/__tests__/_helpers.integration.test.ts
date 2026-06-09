/**
 * Regression test for the OTP introspection oracle bug. Earlier the
 * helper used `WHERE identifier LIKE %${email}%`, which let alice's
 * lookup return bob's row whenever bob's identifier happened to
 * contain alice's email as a substring. The fix is exact-match
 * (`identifier = 'sign-in-otp-' || $1`); this test seeds two users
 * with overlapping addresses and proves the helper returns alice's
 * code, not bob's.
 *
 * Boots a real Postgres via testcontainers (same pattern as the
 * other integration tests under `apps/cli`), so the assertion
 * exercises the actual SQL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { readLatestOtp } from './_helpers.js';

let fx: PgFixture;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

beforeEach(async () => {
  const pool = getPool();
  await pool.query(`DELETE FROM "verification"`);
});

async function seed(identifier: string, code: string) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO "verification" (id, identifier, value, expires_at, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, now() + interval '5 minutes', now(), now())`,
    [identifier, `${code}:0`],
  );
}

describe('readLatestOtp — exact identifier match (no LIKE oracle)', () => {
  it("returns alice's OTP, never bob's, even when bob's identifier contains alice's email as a substring", async () => {
    const aliceEmail = 'alice@e2e.harpapro.com';
    // bob's identifier is contrived to contain alice's email as a substring,
    // exactly the sort of payload that `LIKE %email%` would return for alice.
    await seed(`sign-in-otp-bob+${aliceEmail}@e2e.harpapro.com`, '999999');
    await seed(`sign-in-otp-${aliceEmail}`, '111111');

    const got = await readLatestOtp(aliceEmail);
    expect(got).toBe('111111');
  });

  it('rejects (throws) when no row matches exactly — wildcard input does not slip through', async () => {
    await seed('sign-in-otp-alice@e2e.harpapro.com', '111111');
    // `%@e2e.harpapro.com` would match alice with LIKE; with `=` it
    // doesn't match anything and the helper raises.
    await expect(readLatestOtp('%@e2e.harpapro.com')).rejects.toThrow(
      /no verification row/,
    );
  });
});
