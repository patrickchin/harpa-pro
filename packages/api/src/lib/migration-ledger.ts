type Queryable = {
  query<T extends Record<string, unknown>>(
    text: string,
  ): Promise<{ rows: T[] }>;
};

type MigrationSchema = 'app' | 'admin';

type MigrationLedgerReady = {
  ok: true;
  head: string | null;
};

type MigrationLedgerMissing = {
  ok: false;
  db: 'schema-missing';
};

export type MigrationLedgerProbeResult = MigrationLedgerReady | MigrationLedgerMissing;

export async function probeMigrationLedger({
  pool,
  schema,
}: {
  pool: Queryable;
  schema: MigrationSchema;
}): Promise<MigrationLedgerProbeResult> {
  await pool.query('SELECT 1');

  const schemaCheck = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('${schema}._migrations') IS NOT NULL AS exists`,
  );
  if (!schemaCheck.rows[0]?.exists) {
    return { ok: false, db: 'schema-missing' };
  }

  const headRow = await pool.query<{ name: string }>(
    `SELECT name FROM ${schema}._migrations ORDER BY name DESC LIMIT 1`,
  );
  return { ok: true, head: headRow.rows[0]?.name ?? null };
}
