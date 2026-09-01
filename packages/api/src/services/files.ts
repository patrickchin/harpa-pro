/**
 * Files service — minting upload presigns, registering uploaded files,
 * and looking them up for signed-GET URLs.
 *
 * The storage layer (services/storage.ts) handles signed URLs (R2 in
 * prod, FixtureStorage in tests + `:mock`). All DB access here uses a
 * scoped drizzle handle, so RLS in `app.files` (`files_member_read` /
 * `files_owner_insert` / `files_member_write` / `files_member_delete`
 * — migration 0011) governs who can read or mutate each row.
 *
 * Server constructs every object key (see `services/storage.ts`
 * `buildKey()`). The client never specifies a key — see
 * docs/v4/arch-storage.md §Security.
 */
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type { FileKind } from './storage.js';

type Db = NodePgDatabase<typeof schema>;

export interface FileRow {
  id: string;
  ownerId: string;
  kind: FileKind;
  fileKey: string;
  sizeBytes: number;
  contentType: string;
  projectId: string | null;
  reportId: string | null;
  createdAt: string;
}

interface RawFile {
  [key: string]: unknown;
  id: string;
  owner_id: string;
  kind: FileKind;
  file_key: string;
  size_bytes: string | number;
  content_type: string;
  project_id: string | null;
  report_id: string | null;
  created_at: Date;
}

function mapFile(r: RawFile): FileRow {
  return {
    id: r.id,
    ownerId: r.owner_id,
    kind: r.kind,
    fileKey: r.file_key,
    sizeBytes: Number(r.size_bytes),
    contentType: r.content_type,
    projectId: r.project_id ?? null,
    reportId: r.report_id ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function registerFile(
  db: Db,
  ownerId: string,
  input: {
    /** Pre-minted `fil_…` id from presign — key + DB row share identity. */
    id: string;
    kind: FileKind;
    fileKey: string;
    sizeBytes: number;
    contentType: string;
    projectId?: string | null;
    reportId?: string | null;
  },
): Promise<FileRow | null> {
  const rows = await db
    .insert(schema.files)
    .values({
      id: input.id,
      ownerId,
      kind: input.kind,
      fileKey: input.fileKey,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType,
      projectId: input.projectId ?? null,
      reportId: input.reportId ?? null,
    })
    .returning({
      id: schema.files.id,
      owner_id: schema.files.ownerId,
      kind: schema.files.kind,
      file_key: schema.files.fileKey,
      size_bytes: schema.files.sizeBytes,
      content_type: schema.files.contentType,
      project_id: schema.files.projectId,
      report_id: schema.files.reportId,
      created_at: schema.files.createdAt,
    });
  const row = rows[0];
  return row ? mapFile(row) : null;
}

export interface FileUploadLeaseInput {
  fileId: string;
  fileKey: string;
  scope: 'project' | 'avatar' | 'scratch';
  projectId?: string | null;
  reportId?: string | null;
  contentType: string;
  sizeBytes: number;
  presignExpiresAt: string;
}

/**
 * Serialize client upload issuance/registration with account deletion.
 *
 * `FOR KEY SHARE` allows concurrent upload requests for the same user while
 * conflicting with the deleting transaction's `FOR UPDATE` user-row lock.
 */
export async function lockFileUploadOwner(db: Db, ownerId: string): Promise<boolean> {
  const r = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM public."user"
    WHERE id = ${ownerId}
    FOR KEY SHARE
  `);
  return r.rows.length > 0;
}

/** Persist the exact client-issued PUT capability before returning it. */
export async function createFileUploadLease(
  db: Db,
  ownerId: string,
  input: FileUploadLeaseInput,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO app.file_upload_leases(
      file_id,
      owner_id,
      file_key,
      scope,
      project_id,
      report_id,
      content_type,
      size_bytes,
      presign_expires_at
    )
    VALUES (
      ${input.fileId},
      ${ownerId},
      ${input.fileKey},
      ${input.scope},
      ${input.projectId ?? null},
      ${input.reportId ?? null},
      ${input.contentType},
      ${input.sizeBytes}::bigint,
      ${input.presignExpiresAt}::timestamptz
    )
  `);
}

export async function fileUploadLeasesEnforced(db: Db): Promise<boolean> {
  const result = await db.execute<{ enforced: boolean }>(sql`
    SELECT app.file_upload_leases_enforced() AS enforced
  `);
  return result.rows[0]?.enforced === true;
}

export async function hasFileUploadLease(
  db: Db,
  ownerId: string,
  fileId: string,
  fileKey: string,
): Promise<boolean> {
  const result = await db.execute<{ present: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM app.file_upload_leases
      WHERE file_id = ${fileId}
        AND owner_id = ${ownerId}
        AND file_key = ${fileKey}
    ) AS present
  `);
  return result.rows[0]?.present === true;
}

/**
 * Hold a specific unconsumed upload intent across a server-side object write.
 *
 * This prevents expired-lease pruning from deleting the reservation while the
 * API is putting bytes to R2. Client uploads do not need this helper because
 * their side effect happens before the registration request starts.
 */
export async function lockFileUploadLease(
  db: Db,
  ownerId: string,
  fileId: string,
  fileKey: string,
): Promise<boolean> {
  const result = await db.execute<{ file_id: string }>(sql`
    SELECT file_id
    FROM app.file_upload_leases
    WHERE file_id = ${fileId}
      AND owner_id = ${ownerId}
      AND file_key = ${fileKey}
      AND consumed_at IS NULL
    FOR UPDATE
  `);
  return result.rows.length > 0;
}

/**
 * Consume the exact unconsumed presign lease and register its file in one SQL
 * statement. A missing, already-consumed, or metadata-mismatched lease yields
 * `null`; no lease mutation survives when the INSERT fails.
 */
export async function registerFileFromUploadLease(
  db: Db,
  ownerId: string,
  input: {
    id: string;
    kind: FileKind;
    fileKey: string;
    scope: 'project' | 'avatar' | 'scratch';
    sizeBytes: number;
    contentType: string;
    projectId?: string | null;
    reportId?: string | null;
  },
): Promise<FileRow | null> {
  const r = await db.execute<RawFile>(sql`
    WITH consumed_lease AS (
      UPDATE app.file_upload_leases
      SET consumed_at = now()
      WHERE file_id = ${input.id}
        AND owner_id = ${ownerId}
        AND file_key = ${input.fileKey}
        AND scope = ${input.scope}
        AND project_id IS NOT DISTINCT FROM ${input.projectId ?? null}::app.prj_id
        AND report_id IS NOT DISTINCT FROM ${input.reportId ?? null}::app.rpt_id
        AND content_type = ${input.contentType}
        AND size_bytes = ${input.sizeBytes}::bigint
        AND consumed_at IS NULL
      RETURNING
        file_id,
        owner_id,
        file_key,
        size_bytes,
        content_type,
        project_id,
        report_id
    )
    INSERT INTO app.files(
      id,
      owner_id,
      kind,
      file_key,
      size_bytes,
      content_type,
      project_id,
      report_id
    )
    SELECT
      file_id,
      owner_id,
      ${input.kind}::app.file_kind,
      file_key,
      size_bytes,
      content_type,
      project_id,
      report_id
    FROM consumed_lease
    RETURNING
      id,
      owner_id,
      kind,
      file_key,
      size_bytes,
      content_type,
      project_id,
      report_id,
      created_at
  `);
  const row = r.rows[0];
  return row ? mapFile(row) : null;
}

export async function getFileById(db: Db, fileId: string): Promise<FileRow | null> {
  const rows = await db
    .select({
      id: schema.files.id,
      owner_id: schema.files.ownerId,
      kind: schema.files.kind,
      file_key: schema.files.fileKey,
      size_bytes: schema.files.sizeBytes,
      content_type: schema.files.contentType,
      project_id: schema.files.projectId,
      report_id: schema.files.reportId,
      created_at: schema.files.createdAt,
    })
    .from(schema.files)
    .where(eq(schema.files.id, fileId))
    .limit(1);
  const row = rows[0];
  return row ? mapFile(row) : null;
}
