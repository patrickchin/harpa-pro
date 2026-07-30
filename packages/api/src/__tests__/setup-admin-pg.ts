import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { resetAdminPool } from '../db/admin-client.js';
import { migrateAdmin } from '../db/admin-migrate.js';

export interface AdminPgFixture {
  url: string;
  stop: () => Promise<void>;
}

/** Start and migrate a physically separate Postgres for admin-auth tests. */
export async function startAdminPg(): Promise<AdminPgFixture> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_admin_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();
  await migrateAdmin(url);

  return {
    url,
    stop: async () => {
      await resetAdminPool();
      await container.stop();
    },
  };
}
