import pg from 'pg';
import { parseConnection } from '../src/db/connection.js';

export async function armStorageLifecycleRollout(input: {
  databaseUrl: string;
  graceSeconds: number;
  accountDeleteEnabled: boolean;
}): Promise<Date> {
  if (
    !Number.isInteger(input.graceSeconds) ||
    input.graceSeconds < 0 ||
    input.graceSeconds > 3_600
  ) {
    throw new Error('graceSeconds must be an integer from 0 to 3600');
  }

  const client = new pg.Client(parseConnection(input.databaseUrl));
  await client.connect();
  try {
    const armed = await client.query<{ enforce_after: Date }>(
      `UPDATE app.storage_lifecycle_rollout
       SET armed_at = COALESCE(armed_at, now()),
           enforce_after = COALESCE(
             enforce_after,
             now() + make_interval(secs => $1::int)
           ),
           account_delete_enabled =
             account_delete_enabled OR $2::boolean,
           updated_at = now()
       WHERE singleton
       RETURNING enforce_after`,
      [input.graceSeconds, input.accountDeleteEnabled],
    );
    const enforceAfter = armed.rows[0]?.enforce_after;
    if (!enforceAfter) {
      throw new Error('storage lifecycle rollout singleton is missing');
    }
    return enforceAfter;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const graceSeconds = Number.parseInt(
    process.env.STORAGE_LEASE_ROLLOUT_GRACE_SEC ?? '330',
    10,
  );
  const accountDeleteEnabled =
    process.env.STORAGE_ACCOUNT_DELETE_ENABLED !== 'false';
  const enforceAfter = await armStorageLifecycleRollout({
    databaseUrl,
    graceSeconds,
    accountDeleteEnabled,
  });
  console.log(
    `[storage-lifecycle] lease enforcement armed for ${enforceAfter.toISOString()}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
