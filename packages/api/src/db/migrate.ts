/**
 * Apply every SQL file in migrations/ in lexical order.
 * Idempotent: tracks applied files in app._migrations.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseConnection } from './connection.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../../migrations');

export async function migrate(connectionString: string): Promise<{ applied: string[] }> {
  const client = new pg.Client(parseConnection(connectionString));
  await client.connect();
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
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const newly: string[] = [];
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
      await client.query(sql);
      await client.query(`INSERT INTO app._migrations(name) VALUES ($1)`, [f]);
      newly.push(f);
    }
    return { applied: newly };
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
