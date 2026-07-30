import { afterEach, describe, expect, it } from 'vitest';
import { migrateAdmin } from '../db/admin-migrate.js';
import { runAdminProvisioningCli } from './run-admin-provisioning-cli.js';
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  }
});

describe('admin database isolation outside app boot', () => {
  it('refuses an admin migration before connecting to the app endpoint', async () => {
    process.env.DATABASE_URL = 'postgres://app:test@127.0.0.1:1/harpa';

    await expect(migrateAdmin('postgres://admin:test@127.0.0.1:1/harpa_admin')).rejects.toThrow(
      /refusing admin migration.*same Postgres endpoint/,
    );
  });

  it('refuses provisioning through the real CLI before loading the admin service', async () => {
    const databaseUrl = 'postgres://app:test@127.0.0.1:1/harpa';
    const result = await runAdminProvisioningCli({
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: databaseUrl,
      ADMIN_DATABASE_URL: 'postgres://admin:test@127.0.0.1:1/harpa_admin',
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(
      /provisioning failed: refusing administrator provisioning.*same Postgres endpoint/,
    );
    expect(result.stderr).not.toMatch(/ECONNREFUSED|connect ECONNREFUSED/);
  });
});
