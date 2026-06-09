/**
 * Reports CRUD service. Generation / finalize / PDF live in
 * services/report-generation.ts (P1.7); this file is only the data
 * surface. All DB access expects a scoped drizzle handle so RLS
 * filters by project membership.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { reports as reportSchemas } from '@harpa/api-contract';
import type { z } from 'zod';
import * as schema from '../db/schema.js';
import { newId } from '../lib/ids.js';

type Db = NodePgDatabase<typeof schema>;
type ReportBody = z.infer<typeof reportSchemas.reportBody>;
type ReportAttachments = z.infer<typeof reportSchemas.reportAttachments>;

export type ReportStatus = 'draft' | 'finalized';

export type PlacementTarget =
  | { kind: 'issue'; index: number }
  | { kind: 'section'; index: number };

export type PlaceAttachmentResult =
  | { kind: 'ok'; report: ReportRow }
  | { kind: 'conflict'; report: ReportRow }
  | { kind: 'not_found' }
  | { kind: 'bad_target' }
  | { kind: 'bad_note_kind' }
  | { kind: 'finalized' };

/**
 * Persisted shape of the `last_generation` jsonb column (migration 0003).
 * Mirror of the api-contract `reportLastGeneration` schema; kept here as a
 * service-local type so the schema stays the single source of truth for
 * the wire format and this type stays the truth for the DB column.
 */
export interface ReportLastGeneration {
  requestedAt: string;
  finishedAt: string | null;
  vendor: string;
  model: string;
  fixtureMode: 'live' | 'replay' | 'record';
  systemPrompt: string;
  userPrompt: string;
  response: string;
  usage: { inputTokens: number; outputTokens: number; cachedTokens?: number } | null;
}

export interface ReportRow {
  id: string;
  number: number;
  projectId: string;
  status: ReportStatus;
  visitDate: string | null;
  body: ReportBody | null;
  notesSinceLastGeneration: number; // kept for dual-read during expand window
  notesChangedAt: string | null;
  generatedAt: string | null;
  finalizedAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawReport {
  [key: string]: unknown;
  id: string;
  number: number;
  project_id: string;
  status: ReportStatus;
  visit_date: Date | null;
  body: ReportBody | null;
  notes_since_last_generation: number; // kept for dual-read during expand window
  notes_changed_at: Date | null;
  generated_at: Date | null;
  finalized_at: Date | null;
  pdf_file_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapReport(r: RawReport): ReportRow {
  return {
    id: r.id,
    number: Number(r.number),
    projectId: r.project_id,
    status: r.status,
    visitDate: r.visit_date ? new Date(r.visit_date).toISOString() : null,
    body: r.body,
    notesSinceLastGeneration: Number(r.notes_since_last_generation), // expand window
    notesChangedAt: r.notes_changed_at ? new Date(r.notes_changed_at).toISOString() : null,
    generatedAt: r.generated_at ? new Date(r.generated_at).toISOString() : null,
    finalizedAt: r.finalized_at ? new Date(r.finalized_at).toISOString() : null,
    pdfUrl: null, // populated by P1.7 (signed URL minted from pdf_file_id)
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

/**
 * Dual-read during the expand window: prefer notes_changed_at when set
 * (new code path); fall back to the legacy counter for rows not yet
 * touched by new code. The fallback is removed in the contract PR
 * that drops notes_since_last_generation.
 *
 * Compares ISO-8601 strings directly — lexicographic ordering matches
 * chronological ordering when both timestamps are UTC ISO (which both
 * sides of `mapReport` guarantee).
 */
export function needsRegenerationOf(report: ReportRow): boolean {
  if (report.notesChangedAt !== null) {
    if (report.generatedAt === null) return true;
    return report.notesChangedAt > report.generatedAt;
  }
  return report.notesSinceLastGeneration > 0;
}

/**
 * Wire-shape projection of a ReportRow. Adds the contract-derived
 * `needsRegeneration` boolean so every route returns it consistently.
 * Use this in routes instead of returning `ReportRow` directly.
 */
export function toReportResponse(r: ReportRow): ReportRow & { needsRegeneration: boolean } {
  return { ...r, needsRegeneration: needsRegenerationOf(r) };
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

export interface ListReportsInput {
  projectId: string;
  cursor?: string;
  limit: number;
}

export async function listReports(
  db: Db,
  input: ListReportsInput,
): Promise<{ items: ReportRow[]; nextCursor: string | null }> {
  const { projectId, cursor, limit } = input;
  const overFetch = limit + 1;
  const result = cursor
    ? await (async () => {
        const { createdAt, id } = decodeCursor(cursor);
        return db.execute<RawReport>(sql`
          SELECT id, number, project_id, status, visit_date, body,
                 notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
                 pdf_file_id, created_at, updated_at
          FROM app.reports
          WHERE project_id = ${projectId}
            AND (created_at, id) < (${createdAt}::timestamptz, ${id})
          ORDER BY created_at DESC, id DESC
          LIMIT ${overFetch}
        `);
      })()
    : await db.execute<RawReport>(sql`
        SELECT id, number, project_id, status, visit_date, body,
               notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
               pdf_file_id, created_at, updated_at
        FROM app.reports
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${overFetch}
      `);
  const rows = result.rows;
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return {
    items: slice.map(mapReport),
    nextCursor: hasMore && last
      ? encodeCursor(new Date(last.created_at).toISOString(), last.id)
      : null,
  };
}

export async function getReport(db: Db, reportId: string): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    SELECT id, number, project_id, status, visit_date, body,
           notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
           pdf_file_id, created_at, updated_at
    FROM app.reports
    WHERE id = ${reportId}
    LIMIT 1
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

/**
 * Look up a report by its parent project slug and per-project number.
 * Used by the canonical long-URL routes (`/projects/:project/
 * reports/:number`). Returns null when the parent project is hidden by
 * RLS, when the number doesn't exist within the project, or both — the
 * caller surfaces this as a 404 (Pitfall 6: never distinguish).
 */
export async function getReportByProjectSlugAndNumber(
  db: Db,
  projectIdValue: string,
  reportNumber: number,
): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    SELECT r.id, r.number, r.project_id, r.status, r.visit_date, r.body,
           r.notes_since_last_generation, r.notes_changed_at, r.generated_at, r.finalized_at,
           r.pdf_file_id, r.created_at, r.updated_at
    FROM app.reports r
    JOIN app.projects p ON p.id = r.project_id
    WHERE p.id = ${projectIdValue}
      AND r.number = ${reportNumber}
    LIMIT 1
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

/**
 * Resolve a `rpt_xxxxxxxx` ID to its canonical (`projectId`,
 * `reportNumber`) pair so the mobile client can `router.replace` to the
 * long URL. Returns null when the report doesn't exist or RLS hides it.
 */
export async function resolveReportSlug(
  db: Db,
  reportIdValue: string,
): Promise<{ projectId: string; reportId: string; reportNumber: number } | null> {
  const r = await db.execute<{ project_id: string; report_id: string; number: number }>(sql`
    SELECT p.id AS project_id,
           r.id AS report_id,
           r.number AS number
    FROM app.reports r
    JOIN app.projects p ON p.id = r.project_id
    WHERE r.id = ${reportIdValue}
    LIMIT 1
  `);
  const row = r.rows[0];
  if (!row) return null;
  return {
    projectId: row.project_id,
    reportId: row.report_id,
    reportNumber: Number(row.number),
  };
}

/**
 * Create a draft report under a project. Atomically increments
 * `projects.next_report_number` and assigns the app-minted ID
 * (`rpt_xxxxxxxx`). CTE serialises concurrent createReport calls via
 * the row-level lock on `app.projects`. Retries on PK collisions.
 *
 * Returns `null` if the project is not visible to the scoped role
 * (RLS hides the parent row → counter UPDATE finds no row → CTE empty
 * → INSERT inserts zero rows). Callers surface that as a 404.
 */
export async function createReport(
  db: Db,
  projectId: string,
  authorId: string,
  input: { visitDate?: string },
): Promise<ReportRow | null> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = newId('rpt');
    try {
      const r = await db.execute<RawReport>(sql`
        WITH assigned AS (
          UPDATE app.projects
             SET next_report_number = next_report_number + 1,
                 updated_at = now()
           WHERE id = ${projectId}
          RETURNING next_report_number - 1 AS n
        )
        INSERT INTO app.reports(id, project_id, author_id, visit_date, number)
        SELECT ${id}, ${projectId}, ${authorId}, ${input.visitDate ?? null}, a.n
        FROM assigned a
        RETURNING id, number, project_id, status, visit_date, body,
                  notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
                  pdf_file_id, created_at, updated_at
      `);
      const row = r.rows[0];
      return row ? mapReport(row) : null;
    } catch (err) {
      if (isPkCollision(err) && attempt < maxAttempts - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('id collision retry exhausted (reports)');
}

function isPkCollision(err: unknown): boolean {
  const e = err as { code?: string; cause?: unknown };
  if (e.code === '23505') return true;
  if (e.cause && isPkCollision(e.cause)) return true;
  return false;
}

export async function updateReport(
  db: Db,
  reportId: string,
  patch: { visitDate?: string | null; body?: ReportBody | null },
): Promise<ReportRow | null> {
  const setVisit = Object.prototype.hasOwnProperty.call(patch, 'visitDate');
  const setBody = Object.prototype.hasOwnProperty.call(patch, 'body');
  const bodyJson = setBody && patch.body !== null && patch.body !== undefined
    ? JSON.stringify(patch.body)
    : null;
  // body patch flow: we deliberately do NOT touch
  // `notes_since_last_generation` or `generated_at` here — those belong
  // to the AI loop (setReportBody). Manual edits round-trip through the
  // same column without resetting the AI counter, so the action row
  // can keep showing "Update report (N)" if new notes arrived while
  // the user was editing.
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET visit_date = CASE WHEN ${setVisit} THEN ${patch.visitDate ?? null} ELSE visit_date END,
        body = CASE
                 WHEN ${setBody} AND ${bodyJson}::text IS NOT NULL THEN ${bodyJson}::jsonb
                 WHEN ${setBody} THEN NULL
                 ELSE body
               END,
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

export async function deleteReport(db: Db, reportId: string): Promise<boolean> {
  const r = await db.execute<{ id: string }>(sql`
    DELETE FROM app.reports WHERE id = ${reportId} RETURNING id
  `);
  return r.rows.length > 0;
}

// ---------------------------------------------------------------------------
// AI-generation surface (P1.7).
// ---------------------------------------------------------------------------

/**
 * Per-photo metadata surfaced in the LLM payload. Only included when
 * at least one photo in a batch has a caption (keeps the common-case
 * prompt small — see docs/v4/design-photo-placement.md §"LLM payload").
 */
export type GenerationPhoto = {
  id: string;
  caption?: string;
};

/**
 * One note in the structured LLM payload. Position in the surrounding
 * `notes[]` array is the contract — there is intentionally no `n` /
 * `index` field. Capture order (`created_at ASC, id ASC`) is preserved
 * end-to-end so the LLM can use adjacency as a semantic signal (e.g.
 * a voice note describing the photo just captured).
 */
export type GenerationNote =
  | {
      kind: 'text';
      id: string;
      source?: 'typed';
      body: string;
      createdAt: string;
    }
  | {
      kind: 'voice';
      id: string;
      source?: 'voice';
      transcript: string;
      durationSec?: number;
      createdAt: string;
    }
  | {
      kind: 'image';
      id: string;
      source?: 'camera' | 'gallery' | 'upload';
      photoCount: number;
      caption?: string;
      photos?: GenerationPhoto[];
      createdAt: string;
    }
  | {
      kind: 'document';
      id: string;
      source?: 'upload';
      caption?: string;
      createdAt: string;
    };

/**
 * Structured user-message payload fed to the LLM.
 *
 * - `notes` — chronological capture order. Position is the contract.
 * - `currentBody` — the most recent saved report body, including any
 *   user-placed `attachments`. Null on first generation. Lets the LLM
 *   preserve user placements and propose new ones from context.
 *
 * See docs/v4/design-photo-placement.md.
 */
export interface GenerationPayload {
  notes: GenerationNote[];
  currentBody: ReportBody | null;
}

/**
 * Build the structured user-prompt payload for `generateReport`.
 *
 * Returns a `GenerationPayload` object (notes[] + currentBody). The
 * AI service JSON-stringifies it into the user message — array
 * position carries capture order, every note has a stable `id` the
 * LLM can echo into `attachments.images` / `.documents`.
 */
export async function collectNotesForGeneration(
  db: Db,
  reportId: string,
): Promise<GenerationPayload> {
  const r = await db.execute<{
    id: string;
    kind: 'text' | 'voice' | 'image' | 'document';
    body: string | null;
    transcript: string | null;
    source: string | null;
    duration_sec: number | null;
    created_at: Date;
    file_count: number;
    photos_json: Array<{ id: string; caption: string | null }> | null;
  }>(sql`
    SELECT n.id, n.kind, n.body, n.transcript, n.source,
           n.duration_sec, n.created_at,
           COALESCE(nf.file_count, 0) AS file_count,
           nf.photos_json AS photos_json
    FROM app.notes n
    LEFT JOIN (
      SELECT note_id,
             COUNT(*)::int AS file_count,
             json_agg(
               json_build_object('id', id, 'caption', caption)
               ORDER BY position
             ) AS photos_json
      FROM app.note_files
      GROUP BY note_id
    ) nf ON nf.note_id = n.id
    WHERE n.report_id = ${reportId}
    ORDER BY n.created_at ASC, n.id ASC
  `);

  const bodyResult = await db.execute<{ body: ReportBody | null }>(sql`
    SELECT body FROM app.reports WHERE id = ${reportId} LIMIT 1
  `);
  const currentBody = bodyResult.rows[0]?.body ?? null;

  const notes: GenerationNote[] = [];
  for (const n of r.rows) {
    const createdAt = new Date(n.created_at).toISOString();
    switch (n.kind) {
      case 'text': {
        const body = (n.body ?? '').trim();
        if (!body) continue;
        notes.push({
          kind: 'text',
          id: n.id,
          ...(n.source === 'typed' ? { source: 'typed' } : {}),
          body,
          createdAt,
        });
        break;
      }
      case 'voice': {
        const transcript = (n.transcript ?? n.body ?? '').trim();
        if (!transcript) continue;
        notes.push({
          kind: 'voice',
          id: n.id,
          ...(n.source === 'voice' ? { source: 'voice' } : {}),
          transcript,
          ...(typeof n.duration_sec === 'number' ? { durationSec: n.duration_sec } : {}),
          createdAt,
        });
        break;
      }
      case 'image': {
        const photoCount = n.file_count > 0 ? n.file_count : 1;
        const caption = (n.body ?? '').trim();
        // Only include `photos[]` when at least one per-photo caption
        // is set (keeps the common-case prompt small).
        const photos = (n.photos_json ?? [])
          .filter((p) => p && p.id)
          .map((p) => ({
            id: p.id,
            ...(p.caption ? { caption: p.caption } : {}),
          }));
        const anyPhotoCaption = photos.some((p) => 'caption' in p);
        notes.push({
          kind: 'image',
          id: n.id,
          ...(n.source === 'camera' || n.source === 'gallery' || n.source === 'upload'
            ? { source: n.source as 'camera' | 'gallery' | 'upload' }
            : {}),
          photoCount,
          ...(caption ? { caption } : {}),
          ...(anyPhotoCaption ? { photos } : {}),
          createdAt,
        });
        break;
      }
      case 'document': {
        const caption = (n.body ?? '').trim();
        notes.push({
          kind: 'document',
          id: n.id,
          ...(n.source === 'upload' ? { source: 'upload' } : {}),
          ...(caption ? { caption } : {}),
          createdAt,
        });
        break;
      }
    }
  }

  return { notes, currentBody };
}

/**
 * Format the structured `GenerationPayload` into the literal user
 * message sent to the LLM. Stable JSON shape — keep in lock-step with
 * the system prompt in `prompts/reportGeneration.ts`.
 */
export function formatGenerationPayload(payload: GenerationPayload): string {
  return JSON.stringify(payload);
}

/**
 * Strip / repair `attachments` on every issue and section of a body
 * before persisting it. Defense-in-depth around the LLM (which may
 * hallucinate IDs or violate the "preserve user placements" rule) and
 * around the placement endpoint (defense against drift).
 *
 * Rules:
 *   1. Drop IDs not in `validNoteIds` (deleted notes, wrong report,
 *      scope-invisible). Renderer also drops unknowns cosmetically;
 *      this is the canonical cleanup.
 *   2. Each ID may appear in at most one `attachments` array across
 *      the whole body. First occurrence wins (reading
 *      `body.issues[]` then `body.summarySections[]`, in array order).
 *   3. Empty `images` / `documents` arrays collapse to undefined;
 *      empty `attachments` object collapses to undefined.
 *
 * Pure function. Always returns a new body — never mutates the input.
 */
export function sanitiseAttachments(
  body: ReportBody,
  validNoteIds: Set<string>,
): ReportBody {
  const seen = new Set<string>();

  function cleanList(ids: string[] | undefined): string[] | undefined {
    if (!ids || ids.length === 0) return undefined;
    const out: string[] = [];
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      if (!validNoteIds.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out.length > 0 ? out : undefined;
  }

  function cleanAttachments(a: ReportAttachments | undefined): ReportAttachments | undefined {
    if (!a) return undefined;
    const images = cleanList(a.images);
    const documents = cleanList(a.documents);
    if (!images && !documents) return undefined;
    return {
      ...(images ? { images } : {}),
      ...(documents ? { documents } : {}),
    };
  }

  return {
    ...body,
    issues: body.issues.map((i) => {
      const next = cleanAttachments(i.attachments);
      const { attachments: _drop, ...rest } = i;
      return next ? { ...rest, attachments: next } : { ...rest };
    }),
    summarySections: body.summarySections.map((s) => {
      const next = cleanAttachments(s.attachments);
      const { attachments: _drop, ...rest } = s;
      return next ? { ...rest, attachments: next } : { ...rest };
    }),
  };
}

/**
 * Return the set of note IDs visible (under the current scope) on this
 * report. Used by `sanitiseAttachments` to drop dangling IDs.
 */
async function loadValidNoteIds(db: Db, reportId: string): Promise<Set<string>> {
  const r = await db.execute<{ id: string }>(sql`
    SELECT id FROM app.notes WHERE report_id = ${reportId}
  `);
  return new Set(r.rows.map((row) => row.id));
}

export async function setReportBody(
  db: Db,
  reportId: string,
  body: ReportBody,
  lastGeneration?: ReportLastGeneration,
  /**
   * Snapshot of `report.notes_changed_at` taken BEFORE the AI call.
   * `generated_at` is set to this value (NOT `now()`) so concurrent
   * note bumps that landed during the multi-second AI call keep
   * `notes_changed_at > generated_at` and the queue-of-one fires
   * another regen. Falls back to `now()` when omitted — first-time
   * generates have no prior snapshot, and manual edits round-trip
   * through this helper too with no race to defend.
   */
  snapshotTs?: string | null,
): Promise<ReportRow | null> {
  const validIds = await loadValidNoteIds(db, reportId);
  const sanitised = sanitiseAttachments(body, validIds);
  const lastGenJson = lastGeneration ? JSON.stringify(lastGeneration) : null;
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET body = ${JSON.stringify(sanitised)}::jsonb,
        generated_at = COALESCE(${snapshotTs ?? null}::timestamptz, now()),
        notes_since_last_generation = 0,
        last_generation = CASE
          WHEN ${lastGenJson}::text IS NOT NULL THEN ${lastGenJson}::jsonb
          ELSE last_generation
        END,
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

/**
 * Move (or unplace) a note's batch into / out of an issue or section.
 *
 * - Removes `noteId` from every other `attachments.images` /
 *   `.documents` array first (idempotent move).
 * - Adds it to the requested target if `target` is non-null.
 * - Rejects with `bad_target` when the index is out of range, or
 *   `bad_note_kind` when the note is not `image` / `document`, or
 *   `finalized` when the report is finalised.
 * - Returns `conflict` with the current report when
 *   `expectedBodyVersion` doesn't match `report.generatedAt`.
 * - Does NOT call `bumpNotesChangedAt`. Placement reshapes
 *   presentation of existing content; no regen should be triggered.
 *
 * See docs/v4/design-photo-placement.md §"API surface".
 */
export async function placeNoteInReport(
  db: Db,
  reportId: string,
  noteId: string,
  target: PlacementTarget | null,
  expectedBodyVersion: string | null,
): Promise<PlaceAttachmentResult> {
  const report = await getReport(db, reportId);
  if (!report) return { kind: 'not_found' };
  if (report.status === 'finalized') return { kind: 'finalized' };

  // Optimistic concurrency. `report.generatedAt` is null on a never-
  // generated draft — clients send `null` in that case too.
  if ((expectedBodyVersion ?? null) !== (report.generatedAt ?? null)) {
    return { kind: 'conflict', report };
  }

  const noteRes = await db.execute<{ kind: 'text' | 'voice' | 'image' | 'document' }>(sql`
    SELECT kind FROM app.notes
    WHERE id = ${noteId} AND report_id = ${reportId}
    LIMIT 1
  `);
  const noteRow = noteRes.rows[0];
  if (!noteRow) return { kind: 'not_found' };
  if (noteRow.kind !== 'image' && noteRow.kind !== 'document') {
    return { kind: 'bad_note_kind' };
  }
  const slot: 'images' | 'documents' =
    noteRow.kind === 'image' ? 'images' : 'documents';

  // Empty body just after creation: there's nothing to attach into.
  // Treat this as bad_target so the client surfaces "generate first".
  const body = report.body;
  if (!body) return { kind: 'bad_target' };

  if (target) {
    if (target.kind === 'issue' && target.index >= body.issues.length) {
      return { kind: 'bad_target' };
    }
    if (target.kind === 'section' && target.index >= body.summarySections.length) {
      return { kind: 'bad_target' };
    }
  }

  // Remove noteId from every attachments array first.
  function strip<T extends { attachments?: { images?: string[]; documents?: string[] } }>(
    item: T,
  ): T {
    if (!item.attachments) return item;
    const a = item.attachments;
    const images = a.images?.filter((id) => id !== noteId);
    const documents = a.documents?.filter((id) => id !== noteId);
    const cleaned: { images?: string[]; documents?: string[] } = {};
    if (images && images.length > 0) cleaned.images = images;
    if (documents && documents.length > 0) cleaned.documents = documents;
    const next = Object.keys(cleaned).length > 0 ? cleaned : undefined;
    const { attachments: _drop, ...rest } = item;
    return (next ? { ...rest, attachments: next } : { ...rest }) as T;
  }

  const stripped: ReportBody = {
    ...body,
    issues: body.issues.map(strip),
    summarySections: body.summarySections.map(strip),
  };

  // Add to the chosen target.
  let next: ReportBody = stripped;
  if (target) {
    if (target.kind === 'issue') {
      next = {
        ...stripped,
        issues: stripped.issues.map((it, i) => {
          if (i !== target.index) return it;
          const current = it.attachments ?? {};
          const list = [...(current[slot] ?? []), noteId];
          return {
            ...it,
            attachments: { ...current, [slot]: list },
          };
        }),
      };
    } else {
      next = {
        ...stripped,
        summarySections: stripped.summarySections.map((s, i) => {
          if (i !== target.index) return s;
          const current = s.attachments ?? {};
          const list = [...(current[slot] ?? []), noteId];
          return {
            ...s,
            attachments: { ...current, [slot]: list },
          };
        }),
      };
    }
  }

  // Persist via the same UPDATE used by manual edits, but DON'T call
  // setReportBody — that resets the AI counter and stamps generated_at.
  // Placement is presentation-only.
  const validIds = await loadValidNoteIds(db, reportId);
  const sanitised = sanitiseAttachments(next, validIds);
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET body = ${JSON.stringify(sanitised)}::jsonb,
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  if (!row) return { kind: 'not_found' };
  return { kind: 'ok', report: mapReport(row) };
}

export async function finalizeReport(db: Db, reportId: string): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET status = 'finalized',
        finalized_at = COALESCE(finalized_at, now()),
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

/**
 * Reverse of `finalizeReport`: flips a finalized report back to draft so
 * the user can edit / regenerate it. Only matches rows that are currently
 * finalized — callers should 409 if this returns null AND the row exists
 * (route checks status before calling). RLS still applies via the scoped
 * Postgres role, so a row the caller can't see is just "not found".
 */
export async function unfinalizeReport(db: Db, reportId: string): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET status = 'draft',
        finalized_at = NULL,
        updated_at = now()
    WHERE id = ${reportId}
      AND finalized_at IS NOT NULL
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

export async function setReportPdfFileId(
  db: Db,
  reportId: string,
  fileId: string,
): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET pdf_file_id = ${fileId},
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

// ---------------------------------------------------------------------------
// Report Debug surface (P4.8).
// ---------------------------------------------------------------------------

/**
 * Shape returned by GET /reports/{number}/debug.
 *
 * `prompt.system` / `prompt.user` are surfaced from `last_generation` when
 * the report has been generated; if it hasn't (draft, never generated),
 * we still surface the user prompt the API *would* send (the same
 * `NOTES:` block built by collectNotesForGeneration) so the operator can
 * inspect the input. `prompt.system` is empty in that case — the
 * SYSTEM_PROMPT canonical depends on the AI fixture path, which the
 * service layer doesn't know without actually running the generator.
 *
 * RLS: the caller must have already loaded the report under the
 * per-request scoped handle (route does this via `loadReport`). Notes
 * inherit the same scope through `app.notes` policies.
 */
export interface ReportDebugRow {
  prompt: { system: string; user: string };
  notes: Array<{
    id: string;
    kind: 'text' | 'voice' | 'image' | 'document';
    body: string | null;
    transcript: string | null;
    files: Array<{
      id: string;
      fileId: string;
      thumbnailFileId: string | null;
      position: number;
      caption: string | null;
    }>;
    createdAt: string;
  }>;
  lastGeneration: ReportLastGeneration | null;
}

export async function getReportDebug(db: Db, reportId: string): Promise<ReportDebugRow | null> {
  // last_generation column lookup. Existence check is via the same id
  // — the route loaded the report under scope before calling us, so a
  // missing row here means the report was deleted between the load and
  // this query (treat as 404).
  const r = await db.execute<{ last_generation: ReportLastGeneration | null }>(sql`
    SELECT last_generation
    FROM app.reports
    WHERE id = ${reportId}
    LIMIT 1
  `);
  const row = r.rows[0];
  if (!row) return null;
  const lastGeneration = row.last_generation ?? null;

  // Notes — same shape used by NoteTimeline, ordered ascending so the
  // operator sees them in the order they were composed into the prompt.
  const notesResult = await db.execute<{
    id: string;
    kind: 'text' | 'voice' | 'image' | 'document';
    body: string | null;
    transcript: string | null;
    created_at: Date;
  }>(sql`
    SELECT id, kind, body, transcript, created_at
    FROM app.notes
    WHERE report_id = ${reportId}
    ORDER BY created_at ASC, id ASC
  `);

  // Image-note attachments via the join table, so the operator can
  // see how many photos hung off each note (the prompt collapses a
  // batch to a single placeholder, which is otherwise invisible).
  const imageNoteIds = notesResult.rows.filter((n) => n.kind === 'image').map((n) => n.id);
  const filesByNoteId = new Map<
    string,
    Array<{ id: string; fileId: string; thumbnailFileId: string | null; position: number; caption: string | null }>
  >();
  if (imageNoteIds.length > 0) {
    const inList = sql.join(
      imageNoteIds.map((id) => sql`${id}`),
      sql`, `,
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

  const notes = notesResult.rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    body: n.body,
    transcript: n.transcript,
    files: filesByNoteId.get(n.id) ?? [],
    createdAt: new Date(n.created_at).toISOString(),
  }));

  // Always rebuild the live `userPrompt` from the current notes so the
  // operator sees the prompt the next generate call would send — even
  // when a previous lastGeneration is stored. The persisted
  // `lastGeneration.userPrompt` is still surfaced separately as a
  // record of what was last sent.
  const livePayload = await collectNotesForGeneration(db, reportId);
  const liveUserPrompt = formatGenerationPayload(livePayload);

  return {
    prompt: {
      system: lastGeneration?.systemPrompt ?? '',
      user: liveUserPrompt,
    },
    notes,
    lastGeneration,
  };
}
