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
import { sql } from 'drizzle-orm';
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
  const r = await db.execute<RawFile>(sql`
    INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id)
    VALUES (
      ${input.id},
      ${ownerId},
      ${input.kind}::app.file_kind,
      ${input.fileKey},
      ${input.sizeBytes}::bigint,
      ${input.contentType},
      ${input.projectId ?? null},
      ${input.reportId ?? null}
    )
    RETURNING id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id, created_at
  `);
  const row = r.rows[0];
  return row ? mapFile(row) : null;
}

export async function getFileById(db: Db, fileId: string): Promise<FileRow | null> {
  const r = await db.execute<RawFile>(sql`
    SELECT id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id, created_at
    FROM app.files WHERE id = ${fileId} LIMIT 1
  `);
  const row = r.rows[0];
  return row ? mapFile(row) : null;
}
