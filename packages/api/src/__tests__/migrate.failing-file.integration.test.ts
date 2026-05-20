/**
 * Pitfall 13: prove that a syntax-error in one migration file:
 *   1) aborts the loop on that file (doesn't silently continue),
 *   2) leaves rows for the earlier good files committed,
 *   3) leaves NO row for the failing file (per-file BEGIN/COMMIT).
 *
 * Uses a tmp fixture dir of three SQL files so the real
 * packages/api/migrations/ stays untouched.
 *
 * Companion: docs/v4/arch-cicd-and-migrations.md §Failure & rollback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrate } from '../db/migrate.js';
import { resetPool } from '../db/client.js';

let container: StartedPostgreSqlContainer;
let url: string;
let fixtureDir: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  url = container.getConnectionUri();

  fixtureDir = mkdtempSync(join(tmpdir(), 'migrate-fail-'));
  writeFileSync(join(fixtureDir, '0001_ok.sql'), 'CREATE TABLE t1 (id int);\n');
  writeFileSync(join(fixtureDir, '0002_ok.sql'), 'CREATE TABLE t2 (id int);\n');
  writeFileSync(join(fixtureDir, '0003_bad.sql'), 'CREATE TABL nope_syntax_error;\n');
  writeFileSync(join(fixtureDir, '0004_never_run.sql'), 'CREATE TABLE t4 (id int);\n');
}, 120_000);

afterAll(async () => {
  await resetPool();
  await container?.stop();
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

describe('migrate() — failing file', () => {
  it('rolls back the failing file and stops the loop', async () => {
    await expect(migrate(url, { dir: fixtureDir })).rejects.toThrow();

    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const rows = await client.query<{ name: string }>(
        `SELECT name FROM app._migrations ORDER BY name`,
      );
      expect(rows.rows.map((r) => r.name)).toEqual(['0001_ok.sql', '0002_ok.sql']);

      // t1/t2 exist; t4 must NOT (loop stopped before it).
      const t1 = await client.query(`SELECT to_regclass('public.t1') AS r`);
      expect(t1.rows[0].r).toBe('t1');
      const t4 = await client.query(`SELECT to_regclass('public.t4') AS r`);
      expect(t4.rows[0].r).toBeNull();
    } finally {
      await client.end();
    }
  });
});
