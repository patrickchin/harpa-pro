/**
 * Files service — minting upload presigns, registering uploaded files,
 * and looking them up for signed-GET URLs.
 *
 * The storage layer (services/storage.ts) handles signed URLs (R2 in
 * prod, FixtureStorage in tests + `:mock`). All DB access here uses a
 * scoped drizzle handle, so RLS in `app.files` (`files_owner_all`)
 * blocks cross-owner reads/writes.
 *
 * Server constructs every object key (`users/<userId>/<kind>/<uuid>.<ext>`).
 * The client never specifies a key — see docs/v4/arch-storage.md §Security.
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
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function registerFile(
  db: Db,
  ownerId: string,
  input: {
    kind: FileKind;
    fileKey: string;
    sizeBytes: number;
    contentType: string;
  },
): Promise<FileRow | null> {
  const r = await db.execute<RawFile>(sql`
    INSERT INTO app.files(owner_id, kind, file_key, size_bytes, content_type)
    VALUES (
      ${ownerId}::uuid,
      ${input.kind}::app.file_kind,
      ${input.fileKey},
      ${input.sizeBytes}::bigint,
      ${input.contentType}
    )
    RETURNING id, owner_id, kind, file_key, size_bytes, content_type, created_at
  `);
  const row = r.rows[0];
  return row ? mapFile(row) : null;
}

export async function getFileById(db: Db, fileId: string): Promise<FileRow | null> {
  const r = await db.execute<RawFile>(sql`
    SELECT id, owner_id, kind, file_key, size_bytes, content_type, created_at
    FROM app.files WHERE id = ${fileId}::uuid LIMIT 1
  `);
  const row = r.rows[0];
  return row ? mapFile(row) : null;
}
