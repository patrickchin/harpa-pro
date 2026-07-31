/**
 * Explicitly provision or rotate one dedicated administrator credential.
 *
 * The password is accepted only through stdin so it cannot appear in shell
 * history or the process list.
 *
 * Example:
 *   printf '%s' "$ADMIN_PASSWORD" |
 *     pnpm --filter @harpa/api admin:set-password \
 *       --email person@harpapro.com --password-stdin
 */
import { readFileSync } from 'node:fs';
import { configureAdminCliNetwork } from './admin-cli-network.js';
import {
  assertAdminDatabaseIsolated,
  assertNoApplicationMigrationLedger,
} from '../src/db/admin-isolation.js';

function usage(): string {
  return [
    'Usage: pnpm --filter @harpa/api admin:set-password --email <email> --password-stdin',
    '',
    'ADMIN_DATABASE_URL must point at the separate migrated admin database.',
  ].join('\n');
}

function parseEmail(argv: string[]): string {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }

  const emailIndex = argv.indexOf('--email');
  const email = emailIndex >= 0 ? argv[emailIndex + 1] : undefined;

  if (
    argv.length !== 3 ||
    new Set(argv).size !== 3 ||
    !email ||
    email.startsWith('--') ||
    !argv.includes('--password-stdin') ||
    argv.some(
      (argument) => argument !== '--email' && argument !== email && argument !== '--password-stdin',
    )
  ) {
    throw new Error(usage());
  }
  return email;
}

function readPassword(): string {
  if (process.stdin.isTTY) {
    throw new Error(
      'Refusing to read an administrator password from an interactive terminal; pipe it through stdin.',
    );
  }

  const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  if (password.includes('\n') || password.includes('\r')) {
    throw new Error('Administrator passwords must be provided as one line.');
  }
  return password;
}

async function main(): Promise<void> {
  const email = parseEmail(process.argv.slice(2));
  const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL;
  if (!adminDatabaseUrl) {
    throw new Error('ADMIN_DATABASE_URL must point at the separate admin database.');
  }

  assertAdminDatabaseIsolated(
    adminDatabaseUrl,
    process.env.DATABASE_URL,
    'administrator provisioning',
  );
  configureAdminCliNetwork();

  // Load env-dependent database modules only after the CLI-specific isolation
  // guard has run, so this protection does not depend on application boot.
  const { getAdminPool, resetAdminPool } = await import('../src/db/admin-client.js');
  try {
    await assertNoApplicationMigrationLedger(
      (sql) => getAdminPool().query<{ application_migration_ledger: string | null }>(sql),
      'administrator provisioning',
    );
    const { setAdminPassword } = await import('../src/services/admin-auth.js');
    const identity = await setAdminPassword(email, readPassword());
    console.log(
      `[admin-auth] provisioned ${identity.email} (${identity.id}); existing sessions revoked`,
    );
  } finally {
    await resetAdminPool();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[admin-auth] provisioning failed: ${message}`);
  process.exitCode = 1;
});
