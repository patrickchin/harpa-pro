/**
 * Notes CRUD service. RLS in app.notes provides member visibility and
 * author-only UPDATE/DELETE; routes add the owner/editor role decision.
 * No SECURITY DEFINER helpers are needed.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { newId } from '../lib/ids.js';

type Db = NodePgDatabase<typeof schema>;

export type NoteKind = 'text' | 'voice' | 'image' | 'document';
export type NoteSource = 'typed' | 'voice' | 'camera' | 'gallery' | 'upload';

export interface NoteFileRow {
  id: string;
  fileId: string;
  thumbnailFileId: string | null;
  position: number;
  caption: string | null;
}

export interface NoteRow {
  id: string;
  reportId: string;
  authorId: string;
  kind: NoteKind;
  body: string | null;
  fileId: string | null;
  thumbnailFileId: string | null;
  transcript: string | null;
  title: string | null;
  summary: string | null;
  durationSec: number | null;
  language: string | null;
  transcribeProvider: string | null;
  transcribedAt: string | null;
  source: NoteSource | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  files: NoteFileRow[];
}

export interface NoteAccess {
  projectId: string;
  authorId: string;
}

interface RawNote {
  [key: string]: unknown;
  id: string;
  report_id: string;
  author_id: string;
  kind: NoteKind;
  body: string | null;
  file_id: string | null;
  thumbnail_file_id: string | null;
  transcript: string | null;
  title: string | null;
  summary: string | null;
  duration_sec: number | null;
  language: string | null;
  transcribe_provider: string | null;
  transcribed_at: Date | null;
  source: NoteSource | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

function asNoteMeta(value: Record<string, unknown> | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mapNote(r: RawNote, files: NoteFileRow[] = []): NoteRow {
  return {
    id: r.id,
    reportId: r.report_id,
    authorId: r.author_id,
    kind: r.kind,
    body: r.body,
    fileId: r.file_id,
    thumbnailFileId: r.thumbnail_file_id,
    transcript: r.transcript,
    title: r.title,
    summary: r.summary,
    durationSec: r.duration_sec,
    language: r.language,
    transcribeProvider: r.transcribe_provider,
    transcribedAt: r.transcribed_at ? new Date(r.transcribed_at).toISOString() : null,
    source: r.source ?? null,
    meta: asNoteMeta(r.meta),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    files,
  };
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}
function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const [createdAt, id] = raw.split('|');
  if (!createdAt || !id) throw new Error('invalid cursor');
  return { createdAt, id };
}

const NOTE_COLUMNS = sql`id, report_id, author_id, kind, body, file_id,
       thumbnail_file_id, transcript, title, summary, duration_sec, language,
       transcribe_provider, transcribed_at, source, meta, created_at, updated_at`;

export function notesCanonicalOrder(alias?: 'n') {
  return alias === 'n'
    ? sql`n.created_at ASC, n.id ASC`
    : sql`created_at ASC, id ASC`;
}

/**
 * Resolve the project + author for a member-visible note. Routes use this
 * before mutating a note so role checks do not weaken the existing
 * author-only update/delete contract.
 */
export async function getNoteAccess(
  db: Db,
  noteId: string,
): Promise<NoteAccess | null> {
  const result = await db.execute<{
    project_id: string;
    author_id: string;
  }>(sql`
    SELECT r.project_id, n.author_id
      FROM app.notes n
      JOIN app.reports r ON r.id = n.report_id
     WHERE n.id = ${noteId}
     LIMIT 1
  `);
  const row = result.rows[0];
  return row
    ? { projectId: row.project_id, authorId: row.author_id }
    : null;
}

function defaultSourceForKind(kind: NoteKind): NoteSource {
  if (kind === 'text') return 'typed';
  if (kind === 'voice') return 'voice';
  return 'upload';
}

/**
 * Mark a draft report's notes as changed. Called from every note
 * mutation (add / delete / edit). No-op on finalized reports
 * because finalization is an immutable snapshot.
 *
 * TODO: when a caption-update route is added for `note_files`,
 * call this helper from it too.
 */
async function bumpNotesChangedAt(db: Db, reportId: string): Promise<void> {
  await db.execute(sql`
    UPDATE app.reports
       SET notes_changed_at = now(),
           updated_at       = now()
     WHERE id = ${reportId}
       AND status = 'draft'
  `);
}

export async function listNotes(
  db: Db,
  reportId: string,
  input: { cursor?: string; limit: number },
): Promise<{ items: NoteRow[]; nextCursor: string | null }> {
  const { cursor, limit } = input;
  const overFetch = limit + 1;
  // Notes are timeline-ordered ascending (oldest first) but cursor uses
  // (created_at, id) > (cursor) for the next page.
  const result = cursor
    ? await (async () => {
        const { createdAt, id } = decodeCursor(cursor);
        return db.execute<RawNote>(sql`
          SELECT ${NOTE_COLUMNS}
          FROM app.notes
          WHERE report_id = ${reportId}
            AND (created_at, id) > (${createdAt}::timestamptz, ${id})
          ORDER BY ${notesCanonicalOrder()}
          LIMIT ${overFetch}
        `);
      })()
    : await db.execute<RawNote>(sql`
        SELECT ${NOTE_COLUMNS}
        FROM app.notes
        WHERE report_id = ${reportId}
        ORDER BY ${notesCanonicalOrder()}
        LIMIT ${overFetch}
      `);
  const rows = result.rows;
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];

  // Fetch associated note_files for image notes in a single query.
  const imageNoteIds = slice.filter((r) => r.kind === 'image').map((r) => r.id);
  const filesByNoteId = new Map<string, NoteFileRow[]>();
  if (imageNoteIds.length > 0) {
    const idFragments = imageNoteIds.map((id) => sql`${id}`);
    const inList = idFragments.reduce<ReturnType<typeof sql>>(
      (acc, frag, idx) => (idx === 0 ? frag : sql`${acc}, ${frag}`),
      sql``,
    );
    const nfResult = await db.execute<{
      id: string;
      note_id: string;
      file_id: string;
      thumbnail_file_id: string | null;
      position: number;
      caption: string | null;
    }>(sql`
      SELECT id, note_id, file_id, thumbnail_file_id, position, caption
      FROM app.note_files
      WHERE note_id IN (${inList})
      ORDER BY note_id, position
    `);
    for (const nf of nfResult.rows) {
      const arr = filesByNoteId.get(nf.note_id) ?? [];
      arr.push({
        id: nf.id,
        fileId: nf.file_id,
        thumbnailFileId: nf.thumbnail_file_id,
        position: nf.position,
        caption: nf.caption,
      });
      filesByNoteId.set(nf.note_id, arr);
    }
  }

  return {
    items: slice.map((r) => mapNote(r, filesByNoteId.get(r.id) ?? [])),
    nextCursor: hasMore && last
      ? encodeCursor(new Date(last.created_at).toISOString(), last.id)
      : null,
  };
}

export async function createNote(
  db: Db,
  reportId: string,
  authorId: string,
  input: {
    kind: NoteKind;
    body?: string | null;
    fileId?: string | null;
    thumbnailFileId?: string | null;
    transcript?: string | null;
    title?: string | null;
    summary?: string | null;
    files?: Array<{ fileId: string; thumbnailFileId?: string | null }>;
    source?: NoteSource;
    meta?: Record<string, unknown>;
  },
): Promise<NoteRow | null> {
  // For image notes, the join table `app.note_files` is the canonical
  // source of truth (migration 0010 cleared the legacy columns on
  // existing image rows). Back-compat: when callers pass only
  // `fileId` (single-file image upload, first photo of a batch),
  // funnel it into `files[]` and leave the legacy columns null so
  // `listNotes` sees every photo via the join.
  let fileList = input.files ?? [];
  let legacyFileId: string | null = input.fileId ?? null;
  let legacyThumbId: string | null = input.thumbnailFileId ?? null;
  if (input.kind === 'image' && legacyFileId && fileList.length === 0) {
    fileList = [{ fileId: legacyFileId, thumbnailFileId: legacyThumbId }];
    legacyFileId = null;
    legacyThumbId = null;
  }

  const id = newId('not');
  const source = input.source ?? defaultSourceForKind(input.kind);
  const metaJson = JSON.stringify(input.meta ?? {});
  const r = await db.execute<RawNote>(sql`
    INSERT INTO app.notes(
      id, report_id, author_id, kind, body, file_id, thumbnail_file_id,
      transcript, title, summary, source, meta
    )
    VALUES (
      ${id},
      ${reportId},
      ${authorId},
      ${input.kind}::app.note_kind,
      ${input.body ?? null},
      ${legacyFileId},
      ${legacyThumbId},
      ${input.transcript ?? null},
      ${input.title ?? null},
      ${input.summary ?? null},
      ${source},
      ${metaJson}::jsonb
    )
    RETURNING ${NOTE_COLUMNS}
  `);
  const row = r.rows[0];
  if (!row) return null;

  let files: NoteFileRow[] = [];
  if (fileList.length > 0) {
    const values = fileList.map((f, idx) => {
      const nfId = newId('nfl');
      return sql`(${nfId}, ${id}, ${f.fileId}, ${f.thumbnailFileId ?? null}, ${idx})`;
    });
    const valuesList = values.reduce<ReturnType<typeof sql>>(
      (acc, frag, idx) => (idx === 0 ? frag : sql`${acc}, ${frag}`),
      sql``,
    );
    const nfResult = await db.execute<{
      id: string;
      file_id: string;
      thumbnail_file_id: string | null;
      position: number;
      caption: string | null;
    }>(sql`
      INSERT INTO app.note_files (id, note_id, file_id, thumbnail_file_id, position)
      VALUES ${valuesList}
      RETURNING id, file_id, thumbnail_file_id, position, caption
    `);
    files = nfResult.rows.map((nf) => ({
      id: nf.id,
      fileId: nf.file_id,
      thumbnailFileId: nf.thumbnail_file_id,
      position: nf.position,
      caption: nf.caption,
    }));
  }

  await db.execute(sql`
    UPDATE app.reports
    SET notes_since_last_generation = notes_since_last_generation + 1,
        updated_at = now()
    WHERE id = ${reportId}
  `);
  await bumpNotesChangedAt(db, reportId);
  return mapNote(row, files);
}

/**
 * Voice-note aggregator insert. Used by `POST /reports/:report/notes/voice`
 * after transcribe + summarise complete. All voice-pipeline columns
 * (`summary`, `duration_sec`, `language`, `transcribe_provider`,
 * `transcribed_at`) populated; `body` mirrors `summary` for legacy
 * readers (arch-voice-pipeline.md §D3).
 */
export async function createVoiceNote(
  db: Db,
  reportId: string,
  authorId: string,
  input: {
    fileId: string;
    title: string | null;
    summary: string;
    transcript: string;
    durationSec?: number | null;
    language?: string | null;
    transcribeProvider: string;
  },
): Promise<NoteRow | null> {
  const id = newId('not');
  const metaJson = JSON.stringify(
    input.durationSec ? { durationSec: input.durationSec } : {},
  );
  const r = await db.execute<RawNote>(sql`
    INSERT INTO app.notes(
      id, report_id, author_id, kind, body, file_id, transcript,
      title, summary, duration_sec, language, transcribe_provider, transcribed_at,
      source, meta
    )
    VALUES (
      ${id},
      ${reportId},
      ${authorId},
      'voice'::app.note_kind,
      ${input.summary},
      ${input.fileId},
      ${input.transcript},
      ${input.title ?? null},
      ${input.summary},
      ${input.durationSec ?? null},
      ${input.language ?? null},
      ${input.transcribeProvider},
      now(),
      'voice',
      ${metaJson}::jsonb
    )
    RETURNING ${NOTE_COLUMNS}
  `);
  const row = r.rows[0];
  if (!row) return null;
  await db.execute(sql`
    UPDATE app.reports
    SET notes_since_last_generation = notes_since_last_generation + 1,
        updated_at = now()
    WHERE id = ${reportId}
  `);
  await bumpNotesChangedAt(db, reportId);
  return mapNote(row);
}

/**
 * Partial update. `undefined` leaves a column unchanged; `null`
 * clears it; a string overwrites. Returns null if no fields to update
 * (caller should reject this at the route boundary) or if the row
 * isn't visible / writable under RLS.
 */
export async function updateNote(
  db: Db,
  noteId: string,
  patch: {
    body?: string | null;
    title?: string | null;
    summary?: string | null;
  },
): Promise<NoteRow | null> {
  const sets = [];
  if (patch.body !== undefined) sets.push(sql`body = ${patch.body}`);
  if (patch.title !== undefined) sets.push(sql`title = ${patch.title}`);
  if (patch.summary !== undefined) sets.push(sql`summary = ${patch.summary}`);
  if (sets.length === 0) return null;
  sets.push(sql`updated_at = now()`);
  // Build "col1 = $1, col2 = $2, …" from the patch.
  const setClause = sets.reduce<ReturnType<typeof sql>>(
    (acc, frag, idx) => (idx === 0 ? frag : sql`${acc}, ${frag}`),
    sql``,
  );
  const r = await db.execute<RawNote>(sql`
    UPDATE app.notes
    SET ${setClause}
    WHERE id = ${noteId}
    RETURNING ${NOTE_COLUMNS}
  `);
  const row = r.rows[0];
  if (!row) return null;
  await bumpNotesChangedAt(db, row.report_id);
  return mapNote(row);
}

export async function deleteNote(db: Db, noteId: string): Promise<boolean> {
  const r = await db.execute<{ id: string; report_id: string }>(sql`
    DELETE FROM app.notes WHERE id = ${noteId} RETURNING id, report_id
  `);
  const row = r.rows[0];
  if (!row) return false;
  await bumpNotesChangedAt(db, row.report_id);
  return true;
}

export async function appendFiles(
  db: Db,
  noteId: string,
  files: Array<{ fileId: string; thumbnailFileId?: string | null }>,
): Promise<NoteFileRow[]> {
  const maxPos = await db.execute<{ max_pos: number | null }>(sql`
    SELECT MAX(position) as max_pos FROM app.note_files WHERE note_id = ${noteId}
  `);
  const startPos = (maxPos.rows[0]?.max_pos ?? -1) + 1;

  const values = files.map((f, idx) => {
    const nfId = newId('nfl');
    return sql`(${nfId}, ${noteId}, ${f.fileId}, ${f.thumbnailFileId ?? null}, ${startPos + idx})`;
  });
  const valuesList = values.reduce<ReturnType<typeof sql>>(
    (acc, frag, idx) => (idx === 0 ? frag : sql`${acc}, ${frag}`),
    sql``,
  );
  const nfResult = await db.execute<{
    id: string;
    file_id: string;
    thumbnail_file_id: string | null;
    position: number;
    caption: string | null;
  }>(sql`
    INSERT INTO app.note_files (id, note_id, file_id, thumbnail_file_id, position)
    VALUES ${valuesList}
    RETURNING id, file_id, thumbnail_file_id, position, caption
  `);
  // Appending photos to a batch note is a note-content mutation and must
  // flag the report dirty so the auto-regenerator picks it up. Look up
  // the owning report from the note (single round-trip; appendFiles is
  // called on the photo-upload-complete path which is already async).
  const ownerRes = await db.execute<{ report_id: string }>(sql`
    SELECT report_id FROM app.notes WHERE id = ${noteId}
  `);
  const reportId = ownerRes.rows[0]?.report_id;
  if (reportId) {
    // Dual-write: keep counter in lockstep with timestamp during the
    // expand-contract window (see arch-cicd-and-migrations.md §318).
    await db.execute(sql`
      UPDATE app.reports
         SET notes_since_last_generation = notes_since_last_generation + 1,
             updated_at                  = now()
       WHERE id = ${reportId}
         AND status = 'draft'
    `);
    await bumpNotesChangedAt(db, reportId);
  }
  return nfResult.rows.map((nf) => ({
    id: nf.id,
    fileId: nf.file_id,
    thumbnailFileId: nf.thumbnail_file_id,
    position: nf.position,
    caption: nf.caption,
  }));
}
