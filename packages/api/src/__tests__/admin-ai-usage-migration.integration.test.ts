import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listMigrationFiles, migrate } from '../db/migrate.js';

const MIGRATION = '0029_llm_usage_events_created_at.notx.sql';
const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

let container: StartedPostgreSqlContainer;
let connectionString: string;
let migrationsBeforeIndexDir: string;

function executableSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

function stageMigrationsBeforeIndex(): void {
  const files = listMigrationFiles(MIGRATIONS_DIR);
  const migrationIndex = files.indexOf(MIGRATION);
  if (migrationIndex === -1) {
    throw new Error(`Migration fixture not found: ${MIGRATION}`);
  }

  for (const file of files.slice(0, migrationIndex)) {
    copyFileSync(join(MIGRATIONS_DIR, file), join(migrationsBeforeIndexDir, file));
  }
}

async function resetDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS app CASCADE');
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  connectionString = container.getConnectionUri();
  migrationsBeforeIndexDir = mkdtempSync(join(tmpdir(), 'admin-ai-usage-migrations-'));
}, 120_000);

afterAll(async () => {
  await container?.stop();
  if (migrationsBeforeIndexDir) {
    rmSync(migrationsBeforeIndexDir, { recursive: true, force: true });
  }
});

describe('admin AI usage ledger index migration', () => {
  it('uses one concurrent expand-only index statement', () => {
    const files = listMigrationFiles(MIGRATIONS_DIR);

    expect(files).toContain(MIGRATION);
    const migrationSql = executableSql(readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8'));
    expect(migrationSql).toMatch(
      /^CREATE INDEX CONCURRENTLY llm_usage_events_created_at_idx\s+ON app\.llm_usage_events \(created_at DESC\);$/i,
    );
    expect(migrationSql.match(/\bCREATE\s+INDEX\b/gi)).toHaveLength(1);
    expect(migrationSql).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
    expect(migrationSql).not.toMatch(/\b(ALTER|DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
  });

  it('applies outside a transaction, records its identity, and creates a ready valid index', async () => {
    await resetDatabase();
    const firstRun = await migrate(connectionString);
    expect(firstRun.applied).toContain(MIGRATION);

    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      const ledger = await client.query<{ name: string }>(
        'SELECT name FROM app._migrations WHERE name = $1',
        [MIGRATION],
      );
      expect(ledger.rows).toEqual([{ name: MIGRATION }]);

      const index = await client.query<{
        index_name: string;
        index_definition: string;
        is_ready: boolean;
        is_valid: boolean;
      }>(`
        SELECT
          index_class.relname AS index_name,
          pg_get_indexdef(index_class.oid) AS index_definition,
          pg_index.indisready AS is_ready,
          pg_index.indisvalid AS is_valid
        FROM pg_index
        JOIN pg_class AS index_class ON index_class.oid = pg_index.indexrelid
        JOIN pg_class AS table_class ON table_class.oid = pg_index.indrelid
        JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'app'
          AND table_class.relname = 'llm_usage_events'
          AND index_class.relname = 'llm_usage_events_created_at_idx'
      `);
      expect(index.rows).toEqual([
        {
          index_name: 'llm_usage_events_created_at_idx',
          index_definition:
            'CREATE INDEX llm_usage_events_created_at_idx ON app.llm_usage_events USING btree (created_at DESC)',
          is_ready: true,
          is_valid: true,
        },
      ]);
    } finally {
      await client.end();
    }

    await expect(migrate(connectionString)).resolves.toEqual({ applied: [] });
  }, 120_000);

  it('fails closed on rerun when an interrupted build left an invalid same-name index', async () => {
    await resetDatabase();
    stageMigrationsBeforeIndex();
    const setup = await migrate(connectionString, { dir: migrationsBeforeIndexDir });
    expect(setup.applied).not.toContain(MIGRATION);

    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query(`
        INSERT INTO app.llm_usage_events
          (id, user_id, vendor, model, operation, fixture_mode, status)
        VALUES
          ('lue_00000001', 'usr_00000001', 'openai', 'test-model', 'chat', 'live', 'ok'),
          ('lue_00000002', 'usr_00000001', 'openai', 'test-model', 'chat', 'live', 'ok')
      `);

      await expect(
        client.query(`
          CREATE UNIQUE INDEX CONCURRENTLY llm_usage_events_created_at_idx
            ON app.llm_usage_events (fixture_mode)
        `),
      ).rejects.toMatchObject({ code: '23505' });

      const interrupted = await client.query<{ is_valid: boolean }>(`
        SELECT pg_index.indisvalid AS is_valid
        FROM pg_index
        JOIN pg_class AS index_class ON index_class.oid = pg_index.indexrelid
        JOIN pg_class AS table_class ON table_class.oid = pg_index.indrelid
        JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = 'app'
          AND table_class.relname = 'llm_usage_events'
          AND index_class.relname = 'llm_usage_events_created_at_idx'
      `);
      expect(interrupted.rows).toEqual([{ is_valid: false }]);
    } finally {
      await client.end();
    }

    await expect(migrate(connectionString)).rejects.toMatchObject({ code: '42P07' });

    const verification = new pg.Client({ connectionString });
    await verification.connect();
    try {
      const state = await verification.query<{
        is_valid: boolean;
        migration_recorded: boolean;
      }>(
        `
          SELECT
            pg_index.indisvalid AS is_valid,
            EXISTS (
              SELECT 1
              FROM app._migrations
              WHERE name = $1
            ) AS migration_recorded
          FROM pg_index
          JOIN pg_class AS index_class ON index_class.oid = pg_index.indexrelid
          JOIN pg_class AS table_class ON table_class.oid = pg_index.indrelid
          JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
          WHERE namespace.nspname = 'app'
            AND table_class.relname = 'llm_usage_events'
            AND index_class.relname = 'llm_usage_events_created_at_idx'
        `,
        [MIGRATION],
      );
      expect(state.rows).toEqual([{ is_valid: false, migration_recorded: false }]);
    } finally {
      await verification.end();
    }
  }, 120_000);
});
