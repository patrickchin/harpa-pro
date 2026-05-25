/**
 * Notes CRUD service. RLS in app.notes (member-of-project for SELECT/
 * INSERT, author-only for UPDATE/DELETE) does the access control;
 * no SECURITY DEFINER helpers needed.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { newId } from '../lib/ids.js';

type Db = NodePgDatabase<typeof schema>;

export type NoteKind = 'text' | 'voice' | 'image' | 'document';

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
  createdAt: string;
  updatedAt: string;
  files: NoteFileRow[];
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
  created_at: Date;
  updated_at: Date;
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
       transcribe_provider, transcribed_at, created_at, updated_at`;

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
          ORDER BY created_at ASC, id ASC
          LIMIT ${overFetch}
        `);
      })()
    : await db.execute<RawNote>(sql`
        SELECT ${NOTE_COLUMNS}
        FROM app.notes
        WHERE report_id = ${reportId}
        ORDER BY created_at ASC, id ASC
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
      WHERE note_id = ANY(${imageNoteIds})
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
  },
): Promise<NoteRow | null> {
  const id = newId('not');
  const r = await db.execute<RawNote>(sql`
    INSERT INTO app.notes(
      id, report_id, author_id, kind, body, file_id, thumbnail_file_id,
      transcript, title, summary
    )
    VALUES (
      ${id},
      ${reportId},
      ${authorId},
      ${input.kind}::app.note_kind,
      ${input.body ?? null},
      ${input.fileId ?? null},
      ${input.thumbnailFileId ?? null},
      ${input.transcript ?? null},
      ${input.title ?? null},
      ${input.summary ?? null}
    )
    RETURNING ${NOTE_COLUMNS}
  `);
  const row = r.rows[0];
  if (!row) return null;

  let files: NoteFileRow[] = [];
  if (input.files && input.files.length > 0) {
    const values = input.files.map((f, idx) => {
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
  const r = await db.execute<RawNote>(sql`
    INSERT INTO app.notes(
      id, report_id, author_id, kind, body, file_id, transcript,
      title, summary, duration_sec, language, transcribe_provider, transcribed_at
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
      now()
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
  return row ? mapNote(row) : null;
}

export async function deleteNote(db: Db, noteId: string): Promise<boolean> {
  const r = await db.execute<{ id: string }>(sql`
    DELETE FROM app.notes WHERE id = ${noteId} RETURNING id
  `);
  return r.rows.length > 0;
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
  return nfResult.rows.map((nf) => ({
    id: nf.id,
    fileId: nf.file_id,
    thumbnailFileId: nf.thumbnail_file_id,
    position: nf.position,
    caption: nf.caption,
  }));
}
