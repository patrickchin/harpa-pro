/**
 * Apply the isolated admin database's SQL migrations in lexical order.
 *
 * The migration ledger and advisory lock live in the admin database, so
 * application migrations and admin migrations cannot affect one another.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  assertAdminDatabaseIsolated,
  assertNoApplicationMigrationLedger,
} from './admin-isolation.js';
import { parseConnection } from './connection.js';

const here = dirname(fileURLToPath(import.meta.url));
const ADMIN_MIGRATIONS_DIR = resolve(here, '../../admin-migrations');

/**
 * Stable bigint advisory-lock key: 0x4861727061414d31 ("HarpaAM1").
 * It intentionally differs from the application migration lock.
 */
const ADMIN_MIGRATION_LOCK_KEY = '5215575670465318193';

export function listAdminMigrationFiles(dir: string = ADMIN_MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

export async function migrateAdmin(
  connectionString: string,
  options: { dir?: string } = {},
): Promise<{ applied: string[] }> {
  assertAdminDatabaseIsolated(connectionString, process.env.DATABASE_URL, 'admin migration');
  const dir = options.dir ?? ADMIN_MIGRATIONS_DIR;
  const client = new pg.Client(parseConnection(connectionString));
  await client.connect();
  try {
    await assertNoApplicationMigrationLedger(
      (sql) => client.query<{ application_migration_ledger: string | null }>(sql),
      'admin migration',
    );
    await client.query(`SELECT pg_advisory_lock(${ADMIN_MIGRATION_LOCK_KEY}::bigint)`);
    try {
      await client.query('CREATE SCHEMA IF NOT EXISTS admin');
      await client.query('REVOKE ALL ON SCHEMA admin FROM PUBLIC');
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin._migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query('REVOKE ALL ON admin._migrations FROM PUBLIC');

      const applied = new Set(
        (await client.query<{ name: string }>('SELECT name FROM admin._migrations')).rows.map(
          (row) => row.name,
        ),
      );
      const newlyApplied: string[] = [];

      for (const file of listAdminMigrationFiles(dir)) {
        if (applied.has(file)) continue;
        const migrationSql = readFileSync(join(dir, file), 'utf8');
        const startedAt = Date.now();
        // eslint-disable-next-line no-console
        console.log(`[admin-migrate] applying ${file}`);
        try {
          await client.query('BEGIN');
          await client.query(migrationSql);
          await client.query('INSERT INTO admin._migrations(name) VALUES ($1)', [file]);
          await client.query('COMMIT');
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Preserve the migration error if the connection is unusable.
          }
          const message = error instanceof Error ? error.message : String(error);
          // eslint-disable-next-line no-console
          console.error(`[admin-migrate] FAILED ${file}: ${message}`);
          throw error;
        }
        // eslint-disable-next-line no-console
        console.log(`[admin-migrate] applied  ${file} in ${Date.now() - startedAt}ms`);
        newlyApplied.push(file);
      }

      return { applied: newlyApplied };
    } finally {
      await client.query(`SELECT pg_advisory_unlock(${ADMIN_MIGRATION_LOCK_KEY}::bigint)`);
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('ADMIN_DATABASE_URL is required');
    process.exit(1);
  }
  migrateAdmin(url)
    .then(({ applied }) => {
      // eslint-disable-next-line no-console
      console.log(
        applied.length === 0 ? 'no admin migrations to apply' : `applied: ${applied.join(', ')}`,
      );
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
