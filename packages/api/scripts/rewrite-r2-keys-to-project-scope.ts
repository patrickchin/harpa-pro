/**
 * rewrite-r2-keys-to-project-scope.ts
 *
 * DEV ONLY — pre-launch one-shot.
 *
 * Run AFTER migration `0011_files_project_scope.sql` lands. Rewrites
 * every R2 object key in `app.files` from the legacy owner-keyed
 * layout
 *
 *     users/<ownerId>/<kind>/<uuid>.<ext>
 *
 * to the new three-scope layout (see `docs/v4/arch-storage.md`):
 *
 *     project:  projects/<projectId>/reports/<reportId>/<fileId>.<ext>
 *     scratch:  users/<ownerId>/scratch/<fileId>.<ext>
 *
 * Rows with `project_id IS NOT NULL` (populated by 0011's backfill)
 * go to the `project/` layout. Rows with `project_id IS NULL` are
 * treated as scratch by default — there is no reliable marker that
 * distinguishes pre-launch avatar uploads from orphan/debug uploads,
 * so they all land under `users/<owner>/scratch/`. Use the
 * `--move-to-avatar <fileId>...` flag to promote specific rows
 * afterwards (the script just rewrites those rows under
 * `users/<owner>/avatar/` instead).
 *
 * For each row the script:
 *   1. Parses the extension off the legacy key.
 *   2. Builds the new key as above (the literal `<fileId>` segment
 *      is the row PK; storage key + DB id share identity now).
 *   3. R2 `CopyObject` old → new, then `DeleteObject` on the old key.
 *   4. UPDATE `app.files.file_key` to the new key.
 *
 * Idempotent: rows whose `file_key` already starts with one of the
 * new prefixes (`projects/`, `users/<u>/scratch/`,
 * `users/<u>/avatar/`) are skipped.
 *
 * SAFETY: this script has **no production safeguards** — no
 * concurrency control, no rollback on partial failure, no audit row.
 * It assumes pre-launch dev data only (no live users, no real
 * uploads). DO NOT run against production.
 *
 * Connects via `getPool()` (raw, no per-request scope) and runs as
 * the admin/owner DB role, bypassing RLS. R2 credentials come from
 * the standard `R2_*` env vars (see `packages/api/src/env.ts`); the
 * script will refuse to start in fixture mode.
 *
 * Usage:
 *     # dry-run (default) — prints planned operations, mutates nothing
 *     pnpm --filter @harpa/api r2:rewrite
 *
 *     # apply
 *     pnpm --filter @harpa/api r2:rewrite -- --apply
 *
 *     # promote two rows from scratch → avatar
 *     pnpm --filter @harpa/api r2:rewrite -- --apply \
 *       --move-to-avatar fil_abc123 fil_def456
 */
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
} from '@aws-sdk/client-s3';
import { env } from '../src/env.js';
import { getPool, resetPool } from '../src/db/client.js';

interface CliFlags {
  apply: boolean;
  moveToAvatar: Set<string>;
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { apply: false, moveToAvatar: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      flags.apply = true;
    } else if (arg === '--move-to-avatar') {
      while (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
        flags.moveToAvatar.add(argv[++i]!);
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: tsx scripts/rewrite-r2-keys-to-project-scope.ts ' +
          '[--apply] [--move-to-avatar <fileId>...]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return flags;
}

interface FileRow {
  id: string;
  ownerId: string;
  projectId: string | null;
  reportId: string | null;
  fileKey: string;
}

function extOf(legacyKey: string): string {
  const dot = legacyKey.lastIndexOf('.');
  if (dot === -1 || dot === legacyKey.length - 1) return 'bin';
  return legacyKey.slice(dot + 1).toLowerCase();
}

function alreadyMigrated(
  key: string,
  ownerId: string,
): boolean {
  return (
    key.startsWith('projects/') ||
    key.startsWith(`users/${ownerId}/scratch/`) ||
    key.startsWith(`users/${ownerId}/avatar/`)
  );
}

function planNewKey(row: FileRow, promoteToAvatar: boolean): string | null {
  if (alreadyMigrated(row.fileKey, row.ownerId)) return null;
  const ext = extOf(row.fileKey);
  if (row.projectId !== null) {
    if (row.reportId === null) {
      throw new Error(
        `[r2-rewrite] ${row.id} has project_id but report_id IS NULL — ` +
          `expected 0011 backfill to populate both. Refusing to guess a key.`,
      );
    }
    return `projects/${row.projectId}/reports/${row.reportId}/${row.id}.${ext}`;
  }
  const personalScope = promoteToAvatar ? 'avatar' : 'scratch';
  return `users/${row.ownerId}/${personalScope}/${row.id}.${ext}`;
}

function buildR2(): { client: S3Client; bucket: string } {
  if (env.R2_FIXTURE_MODE !== 'live') {
    throw new Error(
      '[r2-rewrite] R2_FIXTURE_MODE != live — refusing to run; ' +
        'this script mutates real R2 objects.',
    );
  }
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey || (!env.R2_ACCOUNT_ID && !env.R2_ENDPOINT)) {
    throw new Error(
      '[r2-rewrite] R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / ' +
        '(R2_ACCOUNT_ID or R2_ENDPOINT) are required.',
    );
  }
  const endpoint =
    env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return { client, bucket: env.R2_BUCKET };
}

async function copyAndDelete(
  client: S3Client,
  bucket: string,
  oldKey: string,
  newKey: string,
): Promise<{ skipped: boolean }> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: oldKey }));
  } catch (err) {
    if (err instanceof NoSuchKey || (err as { name?: string }).name === 'NotFound') {
      console.warn(
        `[r2-rewrite]   ! source missing in R2 (${oldKey}); ` +
          `will rewrite DB key only.`,
      );
      return { skipped: true };
    }
    throw err;
  }
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${encodeURIComponent(oldKey).replace(/%2F/g, '/')}`,
      Key: newKey,
    }),
  );
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
  return { skipped: false };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const mode = flags.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`[r2-rewrite] mode=${mode}`);
  if (flags.moveToAvatar.size > 0) {
    console.log(
      `[r2-rewrite] promote-to-avatar=${[...flags.moveToAvatar].join(',')}`,
    );
  }

  const pool = getPool();
  const { rows } = await pool.query<FileRow>(
    `SELECT id, owner_id AS "ownerId",
            project_id AS "projectId", report_id AS "reportId",
            file_key AS "fileKey"
     FROM app.files
     ORDER BY created_at ASC`,
  );
  console.log(`[r2-rewrite] scanned ${rows.length} app.files row(s)`);

  let r2: { client: S3Client; bucket: string } | null = null;
  if (flags.apply) r2 = buildR2();

  let migrated = 0;
  let skipped = 0;
  let copyMissing = 0;

  for (const row of rows) {
    const promoteToAvatar = flags.moveToAvatar.has(row.id);
    let newKey: string | null;
    try {
      newKey = planNewKey(row, promoteToAvatar);
    } catch (err) {
      console.error(`[r2-rewrite] FAIL ${row.id}: ${(err as Error).message}`);
      continue;
    }
    if (newKey === null) {
      skipped += 1;
      continue;
    }
    if (newKey === row.fileKey) {
      skipped += 1;
      continue;
    }
    console.log(`[r2-rewrite] ${row.id}: ${row.fileKey}  ->  ${newKey}`);
    if (!flags.apply) {
      migrated += 1;
      continue;
    }
    const { skipped: srcMissing } = await copyAndDelete(
      r2!.client,
      r2!.bucket,
      row.fileKey,
      newKey,
    );
    if (srcMissing) copyMissing += 1;
    await pool.query(`UPDATE app.files SET file_key = $1 WHERE id = $2`, [
      newKey,
      row.id,
    ]);
    migrated += 1;
  }

  console.log(
    `[r2-rewrite] done: migrated=${migrated} skipped=${skipped} ` +
      `source-missing=${copyMissing} mode=${mode}`,
  );
  if (!flags.apply) {
    console.log('[r2-rewrite] dry-run only — pass --apply to mutate R2 + DB.');
  }
  await resetPool();
}

main().catch(async (err) => {
  console.error('[r2-rewrite] fatal:', err);
  await resetPool().catch(() => {});
  process.exitCode = 1;
});
