/**
 * Apply every SQL file in migrations/ in lexical order.
 *
 * Idempotent: tracks applied files in app._migrations.
 *
 * Safety properties (added 2026-05 — see docs/v4/arch-cicd-and-migrations.md):
 *   - Single-writer via pg_advisory_lock(MIGRATION_LOCK_KEY) so two
 *     concurrent Fly release machines (or a deploy + a human running
 *     `pnpm db:migrate`) cannot race the apply loop. The second waits
 *     for the first, then no-ops.
 *   - Each *.sql file runs inside its own BEGIN/COMMIT. Failure aborts
 *     the file's transaction and exits non-zero with the filename in
 *     stderr; no half-applied file is recorded in app._migrations.
 *   - Files whose statements cannot run in a transaction (e.g.
 *     `CREATE INDEX CONCURRENTLY`) must be named `<head>.notx.sql`. The
 *     loader runs them WITHOUT a wrapping transaction; the author is
 *     responsible for the cleanup story documented in the file's header.
 *   - Logs `applying <file>` BEFORE every query so a hang/crash names
 *     the offender.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseConnection } from './connection.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../../migrations');

/**
 * Fixed bigint key for pg_advisory_lock. Chosen as `0x4861727061504d31`
 * (the ASCII for "HarpaPM1"). Stable across processes; never re-use for
 * a different lock. Decimal form is inlined into the SQL so pg's bigint
 * parameter binding is not involved.
 */
const MIGRATION_LOCK_KEY = '5215575670466301233'; // 0x4861727061504d31

/** Read + sort migration filenames. Exposed so /readyz tests can re-use. */
export function listMigrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function migrate(
  connectionString: string,
  options: { dir?: string } = {},
): Promise<{ applied: string[] }> {
  const dir = options.dir ?? MIGRATIONS_DIR;
  const client = new pg.Client(parseConnection(connectionString));
  await client.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`);
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS app`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS app._migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      const applied = new Set(
        (await client.query<{ name: string }>(`SELECT name FROM app._migrations`)).rows.map(
          (r) => r.name,
        ),
      );
      const files = listMigrationFiles(dir);
      const newly: string[] = [];
      for (const f of files) {
        if (applied.has(f)) continue;
        const sql = readFileSync(join(dir, f), 'utf8');
        const startedAt = Date.now();
        // eslint-disable-next-line no-console
        console.log(`[migrate] applying ${f}`);
        const transactional = !f.endsWith('.notx.sql');
        try {
          if (transactional) {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query(`INSERT INTO app._migrations(name) VALUES ($1)`, [f]);
            await client.query('COMMIT');
          } else {
            await client.query(sql);
            await client.query(`INSERT INTO app._migrations(name) VALUES ($1)`, [f]);
          }
        } catch (err) {
          if (transactional) {
            try {
              await client.query('ROLLBACK');
            } catch {
              // Connection may already be poisoned; surfacing the original
              // error matters more than a clean rollback.
            }
          }
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(`[migrate] FAILED ${f}: ${msg}`);
          throw err;
        }
        const ms = Date.now() - startedAt;
        // eslint-disable-next-line no-console
        console.log(`[migrate] applied  ${f} in ${ms}ms`);
        newly.push(f);
      }
      return { applied: newly };
    } finally {
      await client.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`);
    }
  } finally {
    await client.end();
  }
}

// CLI entry: `pnpm db:migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  migrate(url)
    .then(({ applied }) => {
      console.log(applied.length === 0 ? 'no migrations to apply' : `applied: ${applied.join(', ')}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
