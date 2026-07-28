/**
 * Repair explicitly identified signup events after a logged Better Auth hook
 * failure. This command never scans or backfills all historical users.
 *
 * Usage:
 *   pnpm --filter @harpa/api activity:reconcile-signups -- \
 *     --user-id usr_01234567
 *
 *   pnpm --filter @harpa/api activity:reconcile-signups -- \
 *     --apply --user-id usr_01234567 --user-id usr_89abcdef
 */
import { rawDb, resetPool } from '../src/db/client.js';
import { reconcileSignupActivity } from '../src/services/activity-events.js';

interface Flags {
  apply: boolean;
  userIds: string[];
}

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = { apply: false, userIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      flags.apply = true;
      continue;
    }
    if (arg === '--user-id') {
      const userId = argv[index + 1];
      if (!userId || userId.startsWith('--')) {
        throw new Error('--user-id requires a value');
      }
      flags.userIds.push(userId);
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: reconcile-signup-activity [--apply] --user-id <usr_id> ' +
          '[--user-id <usr_id> ...]',
      );
      process.exit(0);
    }
    throw new Error(`Unknown flag: ${arg}`);
  }

  if (flags.userIds.length === 0) {
    throw new Error('At least one --user-id is required');
  }
  return flags;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`[signup-activity] mode=${flags.apply ? 'APPLY' : 'DRY-RUN'}`);

  for (const userId of new Set(flags.userIds)) {
    const result = await reconcileSignupActivity(rawDb(), userId, flags.apply);
    console.log(JSON.stringify(result));
  }
}

main()
  .catch((error) => {
    console.error('[signup-activity] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await resetPool();
  });
