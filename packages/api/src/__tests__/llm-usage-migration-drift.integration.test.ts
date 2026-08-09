import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listMigrationFiles, migrate } from '../db/migrate.js';

const BASE_HEAD = '0029_llm_usage_events_created_at.notx.sql';
const SCHEMA_REPAIR = '0030_reconcile_llm_usage_events_schema.sql';
const LEDGER_REPAIR = '0031_remove_retired_llm_usage_ledger.sql';
const RETIRED_MIGRATION = '0003_llm_usage_events.sql';
const CURRENT_0003 = '0003_report_last_generation.sql';
const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

let container: StartedPostgreSqlContainer;
let connectionString: string;
let baseMigrationsDir: string;

async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function resetDatabase(): Promise<void> {
  await withClient(async (client) => {
    await client.query('DROP SCHEMA IF EXISTS app CASCADE');
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  });
}

function stageBaseMigrations(): void {
  const files = listMigrationFiles(MIGRATIONS_DIR);
  const baseIndex = files.indexOf(BASE_HEAD);
  if (baseIndex === -1) throw new Error(`Base migration fixture not found: ${BASE_HEAD}`);

  for (const file of files.slice(0, baseIndex + 1)) {
    copyFileSync(join(MIGRATIONS_DIR, file), join(baseMigrationsDir, file));
  }
}

async function applyBaseMigrations(): Promise<void> {
  await resetDatabase();
  const result = await migrate(connectionString, { dir: baseMigrationsDir });
  expect(result.applied.at(-1)).toBe(BASE_HEAD);
}

async function recreateObservedDevDrift(client: pg.Client): Promise<void> {
  await client.query(`
    DROP INDEX app.llm_usage_events_user_status_created_idx;

    ALTER TABLE app.llm_usage_events
      ALTER COLUMN fixture_mode TYPE varchar(16) USING fixture_mode::text,
      ALTER COLUMN status TYPE varchar(16) USING status::text,
      ALTER COLUMN status SET DEFAULT 'ok',
      ALTER COLUMN model TYPE varchar(64),
      ALTER COLUMN latency_ms DROP NOT NULL,
      ALTER COLUMN latency_ms DROP DEFAULT,
      DROP CONSTRAINT llm_usage_events_latency_ms_check,
      ADD CONSTRAINT llm_usage_events_latency_ms_check
        CHECK (latency_ms IS NULL OR latency_ms >= 0),
      ADD COLUMN total_tokens integer
        GENERATED ALWAYS AS (input_tokens + output_tokens) STORED;

    CREATE INDEX llm_usage_events_user_status_created_idx
      ON app.llm_usage_events (user_id, created_at)
      WHERE status = 'ok';

    CREATE INDEX llm_usage_events_user_vendor_model_idx
      ON app.llm_usage_events (user_id, vendor, model);

    CREATE POLICY llm_usage_events_self_read ON app.llm_usage_events
      FOR SELECT TO app_authenticated
      USING (user_id = current_setting('app.user_id')::app.usr_id);

    INSERT INTO app._migrations(name) VALUES ('${RETIRED_MIGRATION}');

    INSERT INTO app.llm_usage_events (
      id, user_id, vendor, model, operation, input_tokens, output_tokens,
      cached_tokens, latency_ms, fixture_mode, status
    ) VALUES (
      'lue_00000001', 'usr_00000001', 'openai', 'gpt-test', 'chat', 7, 5,
      2, 11, 'replay', 'ok'
    );
  `);
}

async function schemaSnapshot(client: pg.Client): Promise<unknown> {
  const [columns, constraints, indexes, policies] = await Promise.all([
    client.query(`
      SELECT column_name, data_type, udt_schema, udt_name,
             character_maximum_length, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'llm_usage_events'
      ORDER BY ordinal_position
    `),
    client.query(`
      SELECT constraint_name, pg_get_constraintdef(pg_constraint.oid) AS definition
      FROM information_schema.table_constraints
      JOIN pg_constraint ON pg_constraint.conname = constraint_name
      JOIN pg_namespace ON pg_namespace.oid = pg_constraint.connamespace
                           AND pg_namespace.nspname = 'app'
      WHERE table_schema = 'app' AND table_name = 'llm_usage_events'
      ORDER BY constraint_name
    `),
    client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'app' AND tablename = 'llm_usage_events'
      ORDER BY indexname
    `),
    client.query(`
      SELECT policyname, cmd, roles, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'app' AND tablename = 'llm_usage_events'
      ORDER BY policyname
    `),
  ]);

  return {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    policies: policies.rows,
  };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  connectionString = container.getConnectionUri();
  baseMigrationsDir = mkdtempSync(join(tmpdir(), 'llm-usage-base-migrations-'));
  stageBaseMigrations();
}, 120_000);

afterAll(async () => {
  await container?.stop();
  if (baseMigrationsDir) rmSync(baseMigrationsDir, { recursive: true, force: true });
});

describe('LLM usage migration drift reconciliation', () => {
  it('repairs the observed dev schema and removes only the retired ledger row', async () => {
    await applyBaseMigrations();
    await withClient(recreateObservedDevDrift);

    const result = await migrate(connectionString);
    expect(result.applied.slice(-2)).toEqual([SCHEMA_REPAIR, LEDGER_REPAIR]);

    await withClient(async (client) => {
      const columns = await client.query<{
        column_name: string;
        data_type: string;
        udt_schema: string;
        udt_name: string;
        character_maximum_length: number | null;
        is_nullable: 'YES' | 'NO';
        column_default: string | null;
      }>(`
        SELECT column_name, data_type, udt_schema, udt_name,
               character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'llm_usage_events'
          AND column_name IN ('model', 'latency_ms', 'fixture_mode', 'status', 'total_tokens')
        ORDER BY column_name
      `);
      expect(columns.rows).toEqual([
        {
          column_name: 'fixture_mode',
          data_type: 'USER-DEFINED',
          udt_schema: 'app',
          udt_name: 'llm_fixture_mode',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
        },
        {
          column_name: 'latency_ms',
          data_type: 'integer',
          udt_schema: 'pg_catalog',
          udt_name: 'int4',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: '0',
        },
        {
          column_name: 'model',
          data_type: 'character varying',
          udt_schema: 'pg_catalog',
          udt_name: 'varchar',
          character_maximum_length: 128,
          is_nullable: 'NO',
          column_default: null,
        },
        {
          column_name: 'status',
          data_type: 'USER-DEFINED',
          udt_schema: 'app',
          udt_name: 'llm_usage_status',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
        },
      ]);

      const cleanup = await client.query<{
        retired_ledger_present: boolean;
        current_ledger_present: boolean;
        old_index_present: boolean;
        current_index_present: boolean;
        old_policy_present: boolean;
        current_policy_present: boolean;
        row_preserved: boolean;
      }>(`
        SELECT
          EXISTS (SELECT 1 FROM app._migrations WHERE name = '${RETIRED_MIGRATION}')
            AS retired_ledger_present,
          EXISTS (SELECT 1 FROM app._migrations WHERE name = '${CURRENT_0003}')
            AS current_ledger_present,
          to_regclass('app.llm_usage_events_user_vendor_model_idx') IS NOT NULL
            AS old_index_present,
          to_regclass('app.llm_usage_events_user_model_idx') IS NOT NULL
            AS current_index_present,
          EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'app' AND tablename = 'llm_usage_events'
              AND policyname = 'llm_usage_events_self_read'
          ) AS old_policy_present,
          EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'app' AND tablename = 'llm_usage_events'
              AND policyname = 'llm_usage_events_self_select'
          ) AS current_policy_present,
          EXISTS (
            SELECT 1 FROM app.llm_usage_events
            WHERE id = 'lue_00000001' AND fixture_mode = 'replay'
              AND status = 'ok' AND latency_ms = 11
          ) AS row_preserved
      `);
      expect(cleanup.rows).toEqual([
        {
          retired_ledger_present: false,
          current_ledger_present: true,
          old_index_present: false,
          current_index_present: true,
          old_policy_present: false,
          current_policy_present: true,
          row_preserved: true,
        },
      ]);

      const latencyCheck = await client.query<{ definition: string }>(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE connamespace = 'app'::regnamespace
          AND conrelid = 'app.llm_usage_events'::regclass
          AND conname = 'llm_usage_events_latency_ms_check'
      `);
      expect(latencyCheck.rows).toEqual([{ definition: 'CHECK ((latency_ms >= 0))' }]);
    });
  }, 120_000);

  it('leaves an already-current schema unchanged', async () => {
    await applyBaseMigrations();

    const before = await withClient(schemaSnapshot);
    const result = await migrate(connectionString);
    expect(result.applied.slice(-2)).toEqual([SCHEMA_REPAIR, LEDGER_REPAIR]);
    const after = await withClient(schemaSnapshot);

    expect(after).toEqual(before);
    await expect(migrate(connectionString)).resolves.toEqual({ applied: [] });
  }, 120_000);

  it('fails closed before changing a drifted schema with null latency data', async () => {
    await applyBaseMigrations();
    await withClient(async (client) => {
      await recreateObservedDevDrift(client);
      await client.query(`UPDATE app.llm_usage_events SET latency_ms = NULL`);
    });

    await expect(migrate(connectionString)).rejects.toThrow(/null latency_ms/i);

    await withClient(async (client) => {
      const state = await client.query<{
        fixture_type: string;
        total_tokens_present: boolean;
        schema_repair_recorded: boolean;
        ledger_repair_recorded: boolean;
        retired_ledger_present: boolean;
      }>(`
        SELECT
          (
            SELECT udt_name FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'llm_usage_events'
              AND column_name = 'fixture_mode'
          ) AS fixture_type,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'llm_usage_events'
              AND column_name = 'total_tokens'
          ) AS total_tokens_present,
          EXISTS (SELECT 1 FROM app._migrations WHERE name = '${SCHEMA_REPAIR}')
            AS schema_repair_recorded,
          EXISTS (SELECT 1 FROM app._migrations WHERE name = '${LEDGER_REPAIR}')
            AS ledger_repair_recorded,
          EXISTS (SELECT 1 FROM app._migrations WHERE name = '${RETIRED_MIGRATION}')
            AS retired_ledger_present
      `);
      expect(state.rows).toEqual([
        {
          fixture_type: 'varchar',
          total_tokens_present: true,
          schema_repair_recorded: false,
          ledger_repair_recorded: false,
          retired_ledger_present: true,
        },
      ]);
    });
  }, 120_000);
});
