/**
 * Regression: historical migration files with their own BEGIN/COMMIT must
 * still keep the migration body and app._migrations ledger write atomic.
 *
 * The fixture uses a historical filename because deployed migrations are
 * immutable. Its body deliberately claims its own ledger row so the runner's
 * subsequent ledger insert fails. A safe compatibility path must keep both
 * writes inside the runner-owned transaction and roll them back together.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrate } from '../db/migrate.js';
import { resetPool } from '../db/client.js';

const legacyMigration = '0014_better_auth_init.sql';
const futureMigration = '9999_future_wrapped.sql';

let container: StartedPostgreSqlContainer;
let url: string;
let legacyFixtureDir: string;
let futureFixtureDir: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  url = container.getConnectionUri();

  legacyFixtureDir = mkdtempSync(join(tmpdir(), 'migrate-legacy-transaction-'));
  writeFileSync(
    join(legacyFixtureDir, legacyMigration),
    [
      'BEGIN;',
      'CREATE TABLE public.legacy_migration_body (id integer PRIMARY KEY);',
      `INSERT INTO app._migrations(name) VALUES ('${legacyMigration}');`,
      'COMMIT;',
      '',
    ].join('\n'),
  );

  futureFixtureDir = mkdtempSync(join(tmpdir(), 'migrate-future-transaction-'));
  writeFileSync(
    join(futureFixtureDir, futureMigration),
    [
      'BEGIN;',
      'CREATE TABLE public.future_migration_body (id integer PRIMARY KEY);',
      'COMMIT;',
      '',
    ].join('\n'),
  );
}, 120_000);

afterAll(async () => {
  await resetPool();
  await container?.stop();
  if (legacyFixtureDir) rmSync(legacyFixtureDir, { recursive: true, force: true });
  if (futureFixtureDir) rmSync(futureFixtureDir, { recursive: true, force: true });
});

describe('migrate() — legacy transaction wrappers', () => {
  it('rolls back the migration body when the runner ledger insert fails', async () => {
    await expect(migrate(url, { dir: legacyFixtureDir })).rejects.toMatchObject({ code: '23505' });

    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const state = await client.query<{
        body_relation: string | null;
        ledger_recorded: boolean;
      }>(
        `
          SELECT
            to_regclass('public.legacy_migration_body')::text AS body_relation,
            EXISTS (
              SELECT 1
              FROM app._migrations
              WHERE name = $1
            ) AS ledger_recorded
        `,
        [legacyMigration],
      );

      expect(state.rows[0]).toEqual({
        body_relation: null,
        ledger_recorded: false,
      });
    } finally {
      await client.end();
    }
  });

  it('rejects transaction control in an unknown normal migration before side effects', async () => {
    const outcome = await migrate(url, { dir: futureFixtureDir }).then(
      () => ({ rejected: false }),
      () => ({ rejected: true }),
    );

    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const state = await client.query<{
        body_relation: string | null;
        ledger_recorded: boolean;
      }>(
        `
          SELECT
            to_regclass('public.future_migration_body')::text AS body_relation,
            EXISTS (
              SELECT 1
              FROM app._migrations
              WHERE name = $1
            ) AS ledger_recorded
        `,
        [futureMigration],
      );

      expect({
        ...outcome,
        ...state.rows[0],
      }).toEqual({
        rejected: true,
        body_relation: null,
        ledger_recorded: false,
      });
    } finally {
      await client.end();
    }
  });
});
