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
  it("returns test's OTP, never test2's, even when test2's identifier contains test's email as a substring", async () => {
    const testEmail = 'test@harpapro.com';
    // test2's identifier is contrived to contain test's email as a substring,
    // exactly the sort of payload that `LIKE %email%` would return for test.
    await seed(`sign-in-otp-test2+${testEmail}@harpapro.com`, '999999');
    await seed(`sign-in-otp-${testEmail}`, '111111');

    const got = await readLatestOtp(testEmail);
    expect(got).toBe('111111');
  });

  it('rejects (throws) when no row matches exactly — wildcard input does not slip through', async () => {
    await seed('sign-in-otp-test@harpapro.com', '111111');
    // `%@harpapro.com` would match test with LIKE; with `=` it
    // doesn't match anything and the helper raises.
    await expect(readLatestOtp('%@harpapro.com')).rejects.toThrow(
      /no verification row/,
    );
  });
});
