/**
 * Testcontainers helper that boots a real Postgres, runs migrations,
 * and exposes a connection string for integration tests. The `app_authenticated`
 * role is created by the init migration, so per-request scope tests work
 * end-to-end against actual RLS policies.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
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
