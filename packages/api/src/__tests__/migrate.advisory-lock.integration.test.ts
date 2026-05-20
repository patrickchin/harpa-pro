/**
 * Pitfall 13: prove the advisory lock actually serialises concurrent
 * migrate() calls. Two parallel runs against the same fresh Postgres
 * must produce exactly one set of `app._migrations` rows with no
 * duplicate-key error, and the union of their `.applied` arrays must
 * be exactly the file set.
 *
 * Companion: docs/v4/arch-cicd-and-migrations.md §Tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrate, listMigrationFiles } from '../db/migrate.js';
import { resetPool } from '../db/client.js';

let container: StartedPostgreSqlContainer;
let url: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  url = container.getConnectionUri();
}, 120_000);

afterAll(async () => {
  await resetPool();
  await container?.stop();
});

describe('migrate() — advisory lock', () => {
  it('two concurrent runs do not race', async () => {
    // Both promises kicked off at the same tick. Without the advisory
    // lock this races on the INSERT INTO app._migrations and one side
    // gets a duplicate-key error (or worse, double-applies DDL).
    const [a, b] = await Promise.all([migrate(url), migrate(url)]);

    const all = [...a.applied, ...b.applied].sort();
    const expectedFiles = listMigrationFiles();

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

  it('a third run is a clean no-op', async () => {
    const r = await migrate(url);
    expect(r.applied).toEqual([]);
  });
});
