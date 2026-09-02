import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMigrationFiles, migrate } from '../db/migrate.js';

const BASE_HEAD = '0031_remove_retired_llm_usage_ledger.sql';
const ISSUER_MIGRATION = '0032_better_auth_account_issuer.sql';
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

async function resetToLegacySchema(): Promise<void> {
  await withClient(async (client) => {
    await client.query('DROP SCHEMA IF EXISTS app CASCADE');
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  });

  const result = await migrate(connectionString, { dir: baseMigrationsDir });
  expect(result.applied.at(-1)).toBe(BASE_HEAD);
}

async function insertUser(client: pg.Client, id: string, email: string): Promise<void> {
  await client.query(
    `INSERT INTO public."user"
       (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, now(), now())`,
    [id, email, email],
  );
}

async function expectMigrationRolledBack(client: pg.Client): Promise<void> {
  const state = await client.query<{
    issuer_present: boolean;
    migration_recorded: boolean;
    index_present: boolean;
  }>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'account'
          AND column_name = 'issuer'
      ) AS issuer_present,
      EXISTS (
        SELECT 1
        FROM app._migrations
        WHERE name = '${ISSUER_MIGRATION}'
      ) AS migration_recorded,
      to_regclass('public."account_issuer_accountId_uidx"') IS NOT NULL
        AS index_present
  `);
  expect(state.rows).toEqual([
    {
      issuer_present: false,
      migration_recorded: false,
      index_present: false,
    },
  ]);
}

async function expectExpandedSchema(client: pg.Client): Promise<void> {
  const column = await client.query<{
    data_type: string;
    is_nullable: 'YES' | 'NO';
    column_default: string | null;
  }>(`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'account'
      AND column_name = 'issuer'
  `);
  expect(column.rows).toEqual([
    {
      data_type: 'text',
      is_nullable: 'NO',
      column_default: "'local:credential'::text",
    },
  ]);

  const index = await client.query<{
    indexdef: string;
    indisunique: boolean;
    indisvalid: boolean;
  }>(`
    SELECT pg_indexes.indexdef, pg_index.indisunique, pg_index.indisvalid
    FROM pg_indexes
    JOIN pg_class index_class
      ON index_class.relname = pg_indexes.indexname
    JOIN pg_namespace index_namespace
      ON index_namespace.oid = index_class.relnamespace
     AND index_namespace.nspname = pg_indexes.schemaname
    JOIN pg_index
      ON pg_index.indexrelid = index_class.oid
    WHERE pg_indexes.schemaname = 'public'
      AND pg_indexes.tablename = 'account'
      AND pg_indexes.indexname = 'account_issuer_accountId_uidx'
  `);
  expect(index.rows).toEqual([
    {
      indexdef:
        'CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON public.account USING btree (issuer, account_id)',
      indisunique: true,
      indisvalid: true,
    },
  ]);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  connectionString = container.getConnectionUri();
  baseMigrationsDir = mkdtempSync(join(tmpdir(), 'better-auth-issuer-base-migrations-'));

  const files = listMigrationFiles(MIGRATIONS_DIR);
  const baseIndex = files.indexOf(BASE_HEAD);
  if (baseIndex === -1) throw new Error(`Base migration fixture not found: ${BASE_HEAD}`);
  for (const file of files.slice(0, baseIndex + 1)) {
    copyFileSync(join(MIGRATIONS_DIR, file), join(baseMigrationsDir, file));
  }
}, 120_000);

afterAll(async () => {
  await container?.stop();
  if (baseMigrationsDir) rmSync(baseMigrationsDir, { recursive: true, force: true });
});

describe('Better Auth account issuer migration', () => {
  it('expands an empty database and keeps old 1.6 inserts compatible', async () => {
    await resetToLegacySchema();

    await expect(migrate(connectionString)).resolves.toEqual({
      applied: [ISSUER_MIGRATION],
    });

    await withClient(async (client) => {
      await expectExpandedSchema(client);
      await insertUser(client, 'usr_issuer0001', 'issuer-one@test.local');

      const inserted = await client.query<{ issuer: string }>(
        `INSERT INTO public."account"
           (id, account_id, provider_id, user_id, password, updated_at)
         VALUES ('idn_issuer0001', 'usr_issuer0001', 'credential',
                 'usr_issuer0001', 'hash-one', now())
         RETURNING issuer`,
      );
      expect(inserted.rows).toEqual([{ issuer: 'local:credential' }]);

      await expect(
        client.query(
          `INSERT INTO public."account"
             (id, account_id, provider_id, user_id, password, updated_at)
           VALUES ('idn_issuer0002', 'usr_issuer0001', 'credential',
                   'usr_issuer0001', 'hash-two', now())`,
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'account_issuer_accountId_uidx',
      });
    });

    await expect(migrate(connectionString)).resolves.toEqual({ applied: [] });
  }, 120_000);

  it('canonicalizes a legacy credential without changing its protected data', async () => {
    await resetToLegacySchema();

    const before = await withClient(async (client) => {
      await insertUser(client, 'usr_issuer0003', 'issuer-three@test.local');
      const inserted = await client.query(
        `INSERT INTO public."account" (
           id, account_id, provider_id, user_id, access_token, refresh_token,
           id_token, access_token_expires_at, refresh_token_expires_at, scope,
           password, created_at, updated_at
         ) VALUES (
           'idn_issuer0003', 'legacy-account-id', 'credential',
           'usr_issuer0003', 'access-secret', 'refresh-secret', 'id-secret',
           '2026-08-01T10:00:00Z', '2026-08-02T10:00:00Z', 'openid email',
           'password-hash', '2026-07-01T10:00:00Z', '2026-07-02T10:00:00Z'
         )
         RETURNING *`,
      );
      return inserted.rows[0];
    });

    await expect(migrate(connectionString)).resolves.toEqual({
      applied: [ISSUER_MIGRATION],
    });

    await withClient(async (client) => {
      await expectExpandedSchema(client);
      const after = await client.query(`SELECT * FROM public."account" WHERE id = $1`, [
        'idn_issuer0003',
      ]);
      expect(after.rows).toEqual([
        {
          ...before,
          issuer: 'local:credential',
          account_id: 'usr_issuer0003',
        },
      ]);
    });
  }, 120_000);

  it('rejects an unknown provider without changing schema or ledger', async () => {
    await resetToLegacySchema();
    await withClient(async (client) => {
      await insertUser(client, 'usr_issuer0004', 'issuer-four@test.local');
      await client.query(
        `INSERT INTO public."account"
           (id, account_id, provider_id, user_id, updated_at)
         VALUES ('idn_issuer0004', 'external-id', 'google',
                 'usr_issuer0004', now())`,
      );
    });

    await expect(migrate(connectionString)).rejects.toThrow(/1 non-credential provider row/i);

    await withClient(async (client) => {
      await expectMigrationRolledBack(client);
      const account = await client.query(
        `SELECT account_id, provider_id, user_id
         FROM public."account"
         WHERE id = 'idn_issuer0004'`,
      );
      expect(account.rows).toEqual([
        {
          account_id: 'external-id',
          provider_id: 'google',
          user_id: 'usr_issuer0004',
        },
      ]);
    });
  }, 120_000);

  it('rejects projected identity collisions without changing schema or rows', async () => {
    await resetToLegacySchema();
    await withClient(async (client) => {
      await insertUser(client, 'usr_issuer0005', 'issuer-five@test.local');
      await client.query(
        `INSERT INTO public."account"
           (id, account_id, provider_id, user_id, password, updated_at)
         VALUES
           ('idn_issuer0005', 'legacy-one', 'credential',
            'usr_issuer0005', 'hash-one', now()),
           ('idn_issuer0006', 'legacy-two', 'credential',
            'usr_issuer0005', 'hash-two', now())`,
      );
    });

    await expect(migrate(connectionString)).rejects.toThrow(
      /1 projected credential identity collision/i,
    );

    await withClient(async (client) => {
      await expectMigrationRolledBack(client);
      const accounts = await client.query(
        `SELECT id, account_id, password
         FROM public."account"
         ORDER BY id`,
      );
      expect(accounts.rows).toEqual([
        {
          id: 'idn_issuer0005',
          account_id: 'legacy-one',
          password: 'hash-one',
        },
        {
          id: 'idn_issuer0006',
          account_id: 'legacy-two',
          password: 'hash-two',
        },
      ]);
    });
  }, 120_000);

  it('rejects a same-name index with the wrong definition', async () => {
    await resetToLegacySchema();
    await withClient(async (client) => {
      await client.query('DROP INDEX public.account_user_id_idx');
      await client.query(
        'CREATE INDEX account_user_id_idx ON public."account" (provider_id)',
      );
    });

    await expect(migrate(connectionString)).rejects.toThrow(
      /unexpected pre-1\.7 public\.account index definitions/i,
    );

    await withClient(async (client) => {
      await expectMigrationRolledBack(client);
      const index = await client.query<{ indexdef: string }>(`
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'account'
          AND indexname = 'account_user_id_idx'
      `);
      expect(index.rows).toEqual([
        {
          indexdef:
            'CREATE INDEX account_user_id_idx ON public.account USING btree (provider_id)',
        },
      ]);
    });
  }, 120_000);

  it('rejects a same-name foreign key with the wrong delete action', async () => {
    await resetToLegacySchema();
    await withClient(async (client) => {
      await client.query(`
        ALTER TABLE public."account"
          DROP CONSTRAINT account_user_id_fkey,
          ADD CONSTRAINT account_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE RESTRICT
      `);
    });

    await expect(migrate(connectionString)).rejects.toThrow(
      /unexpected pre-1\.7 public\.account constraint definitions/i,
    );

    await withClient(async (client) => {
      await expectMigrationRolledBack(client);
      const constraint = await client.query<{ definition: string }>(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'public."account"'::regclass
          AND conname = 'account_user_id_fkey'
      `);
      expect(constraint.rows).toEqual([
        {
          definition: 'FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE RESTRICT',
        },
      ]);
    });
  }, 120_000);
});
