/**
 * Default-wiring proof for the pool-level statement_timeout (P4.2).
 * Pitfall 13: don't stub the pool — run a real query against a real
 * Postgres and assert the server-side cap fires.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, resetPool } from '../../db/client.js';
import { startPg, type PgFixture } from '../setup-pg.js';

describe('pool statement_timeout', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    process.env.DATABASE_URL = pg.url;
    await resetPool();
  }, 120_000);

  afterAll(async () => {
    await pg.stop();
    delete process.env.DATABASE_URL;
  });

  it('caps in-session queries at 5s (pg_sleep(10) errors out)', async () => {
    const pool = getPool(pg.url);
    await expect(pool.query('SELECT pg_sleep(10)')).rejects.toMatchObject({
      // Postgres SQLSTATE for `query_canceled` triggered by statement_timeout.
      code: '57014',
    });
  });

  it('reports the configured timeout via SHOW statement_timeout', async () => {
    const pool = getPool(pg.url);
    const res = await pool.query<{ statement_timeout: string }>(
      'SHOW statement_timeout',
    );
    // pg renders 5000ms as "5s".
    expect(res.rows[0]?.statement_timeout).toBe('5s');
  });
});
