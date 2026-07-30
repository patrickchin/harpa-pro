const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/** True only for a URL that node-postgres can interpret as a Postgres URI. */
export function isPostgresConnectionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      POSTGRES_PROTOCOLS.has(url.protocol) && url.hostname.length > 0 && url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

/**
 * Compare the network endpoint without leaking or depending on credentials,
 * database names, or query parameters. Neon direct and pooled hostnames are
 * treated as the same endpoint because they reach the same project/branch.
 */
export function postgresEndpointIdentity(value: string | undefined): string | null {
  if (!value || !isPostgresConnectionUrl(value)) return null;
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/-pooler(?=\.)/, '');
  return `${hostname}:${url.port || '5432'}`;
}

export function isSamePostgresEndpoint(
  adminDatabaseUrl: string | undefined,
  applicationDatabaseUrl: string | undefined,
): boolean {
  const adminEndpoint = postgresEndpointIdentity(adminDatabaseUrl);
  const applicationEndpoint = postgresEndpointIdentity(applicationDatabaseUrl);
  return (
    adminEndpoint !== null && applicationEndpoint !== null && adminEndpoint === applicationEndpoint
  );
}

/**
 * Operation-level guard for entrypoints that may execute before env.ts is
 * loaded, including release migrations and administrator provisioning.
 */
export function assertAdminDatabaseIsolated(
  adminDatabaseUrl: string | undefined,
  applicationDatabaseUrl: string | undefined,
  operation: string,
): void {
  if (isSamePostgresEndpoint(adminDatabaseUrl, applicationDatabaseUrl)) {
    throw new Error(
      `refusing ${operation}: ADMIN_DATABASE_URL and DATABASE_URL identify the same Postgres endpoint`,
    );
  }
}

type ApplicationLedgerQuery = (
  sql: string,
) => Promise<{ rows: Array<{ application_migration_ledger: string | null }> }>;

/**
 * Database-native backstop for aliases or an unavailable DATABASE_URL.
 * This read must run immediately after connecting and before admin DDL or
 * credential mutations.
 */
export async function assertNoApplicationMigrationLedger(
  query: ApplicationLedgerQuery,
  operation: string,
): Promise<void> {
  const result = await query(
    `SELECT to_regclass('app._migrations')::text AS application_migration_ledger`,
  );
  if (result.rows[0]?.application_migration_ledger) {
    throw new Error(
      `refusing ${operation}: target database contains the application migration ledger app._migrations`,
    );
  }
}
