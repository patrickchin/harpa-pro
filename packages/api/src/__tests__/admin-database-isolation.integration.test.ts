import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrateAdmin } from '../db/admin-migrate.js';
import { runAdminProvisioningCli } from './run-admin-provisioning-cli.js';
import { startPg, type PgFixture } from './setup-pg.js';

let appFx: PgFixture;

beforeAll(async () => {
  appFx = await startPg();
}, 120_000);

afterAll(async () => {
  await appFx?.stop();
}, 60_000);

async function expectNoAdminSchema(): Promise<void> {
  const client = new pg.Client({ connectionString: appFx.url });
  await client.connect();
  try {
    const result = await client.query<{ admin_schema: string | null }>(
      `SELECT to_regnamespace('admin')::text AS admin_schema`,
    );
    expect(result.rows).toEqual([{ admin_schema: null }]);
  } finally {
    await client.end();
  }
}

describe('admin database application-ledger sentinel', () => {
  it('refuses to migrate a real application database when DATABASE_URL is absent', async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(migrateAdmin(appFx.url)).rejects.toThrow(
        /refusing admin migration.*application migration ledger/,
      );
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }

    await expectNoAdminSchema();
  });

  it('refuses real CLI provisioning when DATABASE_URL uses a different alias', async () => {
    const cliEnv = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://app:test@application-alias.invalid:5432/harpa',
      ADMIN_DATABASE_URL: appFx.url,
    };
    const result = await runAdminProvisioningCli(cliEnv, {
      assertNetworkPolicyBeforeConnect: true,
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain('[admin-cli-network-test]');
    expect(result.stderr).toMatch(
      /provisioning failed: refusing administrator provisioning.*application migration ledger/,
    );
    await expectNoAdminSchema();
  });
});
