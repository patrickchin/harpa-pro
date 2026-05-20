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

export interface NoteRow {
  id: string;
  reportId: string;
  authorId: string;
  kind: NoteKind;
  body: string | null;
  fileId: string | null;
  transcript: string | null;
  summary: string | null;
  durationSec: number | null;
  language: string | null;
  transcribeProvider: string | null;
  transcribedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawNote {
  [key: string]: unknown;
  id: string;
  report_id: string;
  author_id: string;
  kind: NoteKind;
  body: string | null;
  file_id: string | null;
  transcript: string | null;
  summary: string | null;
  duration_sec: number | null;
  language: string | null;
  transcribe_provider: string | null;
  transcribed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapNote(r: RawNote): NoteRow {
  return {
    id: r.id,
    reportId: r.report_id,
    authorId: r.author_id,
    kind: r.kind,
    body: r.body,
    fileId: r.file_id,
    transcript: r.transcript,
    summary: r.summary,
    durationSec: r.duration_sec,
    language: r.language,
    transcribeProvider: r.transcribe_provider,
    transcribedAt: r.transcribed_at ? new Date(r.transcribed_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
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
       transcript, summary, duration_sec, language, transcribe_provider,
       transcribed_at, created_at, updated_at`;

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
  return {
    items: slice.map(mapNote),
    nextCursor: hasMore && last
      ? encodeCursor(new Date(last.created_at).toISOString(), last.id)
      : null,
  };
}

export async function createNote(
  db: Db,
  reportId: string,
  authorId: string,
  input: { kind: NoteKind; body?: string | null; fileId?: string | null; transcript?: string | null },
): Promise<NoteRow | null> {
  const id = newId('not');
  const r = await db.execute<RawNote>(sql`
    INSERT INTO app.notes(id, report_id, author_id, kind, body, file_id, transcript)
    VALUES (
      ${id},
      ${reportId},
      ${authorId},
      ${input.kind}::app.note_kind,
      ${input.body ?? null},
      ${input.fileId ?? null},
      ${input.transcript ?? null}
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
      summary, duration_sec, language, transcribe_provider, transcribed_at
    )
    VALUES (
      ${id},
      ${reportId},
      ${authorId},
      'voice'::app.note_kind,
      ${input.summary},
      ${input.fileId},
      ${input.transcript},
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

export async function updateNote(
  db: Db,
  noteId: string,
  body: string | null,
): Promise<NoteRow | null> {
  const r = await db.execute<RawNote>(sql`
    UPDATE app.notes
    SET body = ${body},
        updated_at = now()
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
