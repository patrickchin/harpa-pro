/**
 * Pitfall 13: prove the advisory lock actually serialises concurrent
 * migrate() calls, including a non-transactional concurrent-index file.
 * Contenders must not hold a blocking lock-wait statement that the index
 * build then waits on. Two parallel runs against the same fresh Postgres
 * must produce exactly one set of `app._migrations` rows with no deadlock
 * or duplicate-key error, and the union of their `.applied` arrays must
 * be exactly the file set.
 *
 * Companion: docs/v4/arch-cicd-and-migrations.md §Tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrate, listMigrationFiles } from '../db/migrate.js';
import { resetPool } from '../db/client.js';

let container: StartedPostgreSqlContainer;
let url: string;
let concurrentIndexFixtureDir: string;

interface MigratorActivity {
  query: string;
  state: string;
}

async function waitForMigratorActivity(
  observer: pg.Client,
  predicate: (rows: MigratorActivity[]) => boolean,
): Promise<MigratorActivity[]> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const result = await observer.query<MigratorActivity>(
      `SELECT state, query
         FROM pg_stat_activity
        WHERE application_name = 'harpa-migration-lock-regression'
        ORDER BY pid`,
    );
    if (predicate(result.rows)) return result.rows;
    if (Date.now() >= deadline) {
      throw new Error('[test] timed out waiting for concurrent migrator activity');
    }
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  url = container.getConnectionUri();

  concurrentIndexFixtureDir = mkdtempSync(join(tmpdir(), 'migrate-concurrent-index-'));
  writeFileSync(
    join(concurrentIndexFixtureDir, '9000_lock_poll_probe.notx.sql'),
    'CREATE INDEX CONCURRENTLY migration_lock_poll_value_idx ON app.migration_lock_poll_probe(value);\n',
  );
}, 120_000);

afterAll(async () => {
  await resetPool();
  await container?.stop();
  if (concurrentIndexFixtureDir) {
    rmSync(concurrentIndexFixtureDir, { recursive: true, force: true });
  }
});

describe('migrate() — advisory lock', () => {
  it('two concurrent runs do not race', async () => {
    // Both promises kicked off at the same tick. Without the advisory
    // lock this races on the INSERT INTO app._migrations and one side
    // gets a duplicate-key error (or worse, double-applies DDL).
    const [a, b] = await Promise.all([migrate(url), migrate(url)]);

    const all = [...a.applied, ...b.applied].sort();
    const expectedFiles = listMigrationFiles();

    expect(expectedFiles.some((file) => file.endsWith('.notx.sql'))).toBe(true);

    // Each file is applied exactly once across both runs.
    expect(all).toEqual(expectedFiles);

    // Sanity: the table holds exactly the file set, no duplicates.
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const r = await client.query<{ name: string }>(
        `SELECT name FROM app._migrations ORDER BY name`,
      );
      expect(r.rows.map((x) => x.name)).toEqual(expectedFiles);
    } finally {
      await client.end();
    }
  });

  it('polls without a blocking advisory waiter while a concurrent index is active', async () => {
    const blocker = new pg.Client({ connectionString: url });
    const observer = new pg.Client({ connectionString: url });
    await blocker.connect();
    await observer.connect();

    const migrationUrl = new URL(url);
    migrationUrl.searchParams.set('application_name', 'harpa-migration-lock-regression');
    let blockerOpen = false;
    let firstMigration: Promise<{ applied: string[] }> | undefined;
    let secondMigration: Promise<{ applied: string[] }> | undefined;

    try {
      await blocker.query('CREATE SCHEMA IF NOT EXISTS app');
      await blocker.query(`
        CREATE TABLE app.migration_lock_poll_probe (
          id integer PRIMARY KEY,
          value text NOT NULL
        )
      `);
      await blocker.query(
        `INSERT INTO app.migration_lock_poll_probe (id, value) VALUES (1, 'before')`,
      );
      await blocker.query('BEGIN');
      blockerOpen = true;
      await blocker.query(
        `UPDATE app.migration_lock_poll_probe SET value = 'blocked' WHERE id = 1`,
      );

      firstMigration = migrate(migrationUrl.toString(), { dir: concurrentIndexFixtureDir });
      await waitForMigratorActivity(observer, (rows) =>
        rows.some((row) => row.query.includes('CREATE INDEX CONCURRENTLY')),
      );

      secondMigration = migrate(migrationUrl.toString(), { dir: concurrentIndexFixtureDir });
      const activity = await waitForMigratorActivity(
        observer,
        (rows) =>
          rows.length === 2 &&
          rows.some((row) => row.query.includes('CREATE INDEX CONCURRENTLY')) &&
          rows.some((row) => row.query.includes('pg_try_advisory_lock')),
      );

      expect(activity).toHaveLength(2);
      const locks = await observer.query<{ granted: number; waiting: number }>(`
        SELECT count(*) FILTER (WHERE granted)::int AS granted,
               count(*) FILTER (WHERE NOT granted)::int AS waiting
          FROM pg_locks
         WHERE locktype = 'advisory'
      `);
      expect(locks.rows[0]).toEqual({ granted: 1, waiting: 0 });

      await blocker.query('COMMIT');
      blockerOpen = false;
      const [first, second] = await Promise.all([firstMigration, secondMigration]);
      expect([...first.applied, ...second.applied]).toEqual(['9000_lock_poll_probe.notx.sql']);
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      await Promise.allSettled(
        [firstMigration, secondMigration].filter(
          (migration): migration is Promise<{ applied: string[] }> => migration !== undefined,
        ),
      );
      await observer.query('DROP TABLE IF EXISTS app.migration_lock_poll_probe CASCADE');
      await observer.end();
      await blocker.end();
    }
  });

  it('a third run is a clean no-op', async () => {
    const r = await migrate(url);
    expect(r.applied).toEqual([]);
  });
});
