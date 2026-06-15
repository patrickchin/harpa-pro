/**
 * Testcontainers helper that boots a real Postgres, runs migrations,
 * and exposes a connection string for integration tests. The `app_authenticated`
 * role is created by the init migration, so per-request scope tests work
 * end-to-end against actual RLS policies.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrate } from '../db/migrate.js';
import { resetPool } from '../db/client.js';

export interface PgFixture {
  url: string;
  stop: () => Promise<void>;
}

export async function startPg(): Promise<PgFixture> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();
  await migrate(url);

  return {
    url,
    stop: async () => {
      await resetPool();
      await container.stop();
    },
  };
}

/**
 * Seed one or more better-auth users into `public."user"`. Mirrors
 * what the legacy tests did with `INSERT INTO auth.users(id, phone, …)`.
 *
 * Sessions are NOT seeded here — call `signTestToken(userId, sessionId)`
 * from the test; that helper inserts a `public."session"` row with a
 * random bearer token and returns the token.
 */
export interface SeedUserInput {
  id: string;
  email?: string;
  displayName?: string | null;
  isAdmin?: boolean;
  plan?: string;
}

export async function seedAuthUsers(url: string, users: SeedUserInput[]): Promise<void> {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    for (const u of users) {
      const email = u.email ?? `${u.id}@test.local`;
      const name = u.displayName ?? u.id;
      await admin.query(
        `INSERT INTO public."user"
           (id, email, email_verified, name, display_name, is_admin, plan, created_at, updated_at)
         VALUES ($1, $2, true, $3, $4, $5, $6, now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [u.id, email, name, u.displayName ?? null, u.isAdmin ?? false, u.plan ?? 'free'],
      );
    }
  } finally {
    await admin.end();
  }
}
