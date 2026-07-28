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
import { notesCanonicalOrder, type NoteKind, type NoteSource } from './notes.js';

type Db = NodePgDatabase<typeof schema>;
type ReportBody = z.infer<typeof reportSchemas.reportBody>;
type ReportAttachmentTarget = z.infer<typeof reportSchemas.reportAttachmentTarget>;
type AttachmentSets = { images: Set<string>; documents: Set<string> };

export type ReportStatus = 'draft' | 'finalized';

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
  status?: ReportStatus;
}

export async function listReports(
  db: Db,
  input: ListReportsInput,
): Promise<{ items: ReportRow[]; nextCursor: string | null }> {
  const { projectId, cursor, limit, status } = input;
  const statusFilter = status ?? null;
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
            AND (${statusFilter}::app.report_status IS NULL
              OR status = ${statusFilter}::app.report_status)
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
          AND (${statusFilter}::app.report_status IS NULL
            OR status = ${statusFilter}::app.report_status)
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

function reportUpdatedAtPrecondition(expectedUpdatedAt?: string) {
  const expected = expectedUpdatedAt ?? null;
  return sql`(
    ${expected}::timestamptz IS NULL
    OR date_trunc('milliseconds', updated_at) = ${expected}::timestamptz
  )`;
}

function nextReportUpdatedAt() {
  return sql`GREATEST(
    date_trunc('milliseconds', clock_timestamp()),
    date_trunc('milliseconds', updated_at) + interval '1 millisecond'
  )`;
}

export async function updateReport(
  db: Db,
  reportId: string,
  patch: { visitDate?: string | null; body?: ReportBody | null },
  expectedUpdatedAt?: string,
): Promise<ReportRow | null> {
  const setVisit = Object.prototype.hasOwnProperty.call(patch, 'visitDate');
  const setBody = Object.prototype.hasOwnProperty.call(patch, 'body');
  let nextBody: ReportBody | null = null;
  if (setBody && patch.body !== null && patch.body !== undefined) {
    const valid = await collectValidReportAttachmentIds(db, reportId);
    nextBody = sanitiseAttachments(patch.body, valid);
  }
  const bodyJson = nextBody ? JSON.stringify(nextBody) : null;
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
        updated_at = ${nextReportUpdatedAt()}
    WHERE id = ${reportId}
      AND status = 'draft'
      AND ${reportUpdatedAtPrecondition(expectedUpdatedAt)}
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
// Report-body attachment placement.
// ---------------------------------------------------------------------------

function cloneReportBody(body: ReportBody): ReportBody {
  return JSON.parse(JSON.stringify(body)) as ReportBody;
}

function attachmentBucketForKind(kind: NoteKind): 'images' | 'documents' | null {
  if (kind === 'image') return 'images';
  if (kind === 'document') return 'documents';
  return null;
}

function attachmentTargets(body: ReportBody) {
  const issues = body.issues ?? [];
  const summarySections = body.summarySections ?? [];
  return [
    ...issues.map((target, index) => ({ target, kind: 'issue' as const, index })),
    ...summarySections.map((target, index) => ({
      target,
      kind: 'section' as const,
      index,
    })),
  ];
}

export function collectPlacedAttachmentIds(body: ReportBody | null): AttachmentSets {
  const images = new Set<string>();
  const documents = new Set<string>();
  if (!body) return { images, documents };
  for (const { target } of attachmentTargets(body)) {
    for (const id of target.attachments?.images ?? []) images.add(id);
    for (const id of target.attachments?.documents ?? []) documents.add(id);
  }
  return { images, documents };
}

function sanitiseTargetAttachments(
  target: ReportBody['issues'][number] | ReportBody['summarySections'][number],
  valid: AttachmentSets,
  seen: AttachmentSets,
): void {
  const attachments = target.attachments;
  if (!attachments) return;

  const nextImages: string[] = [];
  for (const id of attachments.images ?? []) {
    if (!valid.images.has(id) || seen.images.has(id)) continue;
    seen.images.add(id);
    nextImages.push(id);
  }

  const nextDocuments: string[] = [];
  for (const id of attachments.documents ?? []) {
    if (!valid.documents.has(id) || seen.documents.has(id)) continue;
    seen.documents.add(id);
    nextDocuments.push(id);
  }

  if (nextImages.length === 0 && nextDocuments.length === 0) {
    delete target.attachments;
    return;
  }

  target.attachments = {};
  if (nextImages.length > 0) target.attachments.images = nextImages;
  if (nextDocuments.length > 0) target.attachments.documents = nextDocuments;
}

export function sanitiseAttachments(body: ReportBody, valid: AttachmentSets): ReportBody {
  const out = cloneReportBody(body);
  const seen: AttachmentSets = { images: new Set(), documents: new Set() };
  for (const { target } of attachmentTargets(out)) {
    sanitiseTargetAttachments(target, valid, seen);
  }
  return out;
}

function ensureAttachments(
  target: ReportBody['issues'][number] | ReportBody['summarySections'][number],
): NonNullable<typeof target.attachments> {
  target.attachments ??= {};
  return target.attachments;
}

function removeAttachmentId(body: ReportBody, noteId: string): void {
  for (const { target } of attachmentTargets(body)) {
    const attachments = target.attachments;
    if (!attachments) continue;
    attachments.images = attachments.images?.filter((id) => id !== noteId);
    attachments.documents = attachments.documents?.filter((id) => id !== noteId);
    if ((attachments.images?.length ?? 0) === 0) delete attachments.images;
    if ((attachments.documents?.length ?? 0) === 0) delete attachments.documents;
    if (!attachments.images && !attachments.documents) delete target.attachments;
  }
}

function targetAt(body: ReportBody, target: ReportAttachmentTarget) {
  return target.kind === 'issue'
    ? body.issues[target.index]
    : body.summarySections[target.index];
}

export function preserveExistingAttachments(
  generated: ReportBody,
  current: ReportBody | null,
  valid: AttachmentSets,
): ReportBody {
  const out = sanitiseAttachments(generated, valid);
  if (!current) return out;

  const placed = collectPlacedAttachmentIds(out);
  const append = (
    target: ReportBody['issues'][number] | ReportBody['summarySections'][number] | undefined,
    bucket: 'images' | 'documents',
    ids: string[] | undefined,
  ) => {
    if (!target || !ids) return;
    for (const id of ids) {
      if (!valid[bucket].has(id) || placed[bucket].has(id)) continue;
      const attachments = ensureAttachments(target);
      attachments[bucket] ??= [];
      attachments[bucket]!.push(id);
      placed[bucket].add(id);
    }
  };

  (current.issues ?? []).forEach((issue, index) => {
    append(out.issues[index], 'images', issue.attachments?.images);
    append(out.issues[index], 'documents', issue.attachments?.documents);
  });
  (current.summarySections ?? []).forEach((section, index) => {
    append(out.summarySections[index], 'images', section.attachments?.images);
    append(out.summarySections[index], 'documents', section.attachments?.documents);
  });

  return sanitiseAttachments(out, valid);
}

async function collectValidReportAttachmentIds(db: Db, reportId: string): Promise<AttachmentSets> {
  const rows = await db.execute<{ id: string; kind: 'image' | 'document' }>(sql`
    SELECT id, kind
    FROM app.notes
    WHERE report_id = ${reportId}
      AND kind IN ('image', 'document')
    ORDER BY ${notesCanonicalOrder()}
  `);
  const valid: AttachmentSets = { images: new Set(), documents: new Set() };
  for (const row of rows.rows) {
    if (row.kind === 'image') valid.images.add(row.id);
    if (row.kind === 'document') valid.documents.add(row.id);
  }
  return valid;
}

export type PlaceNoteInReportResult =
  | { ok: true; report: ReportRow }
  | { ok: false; reason: 'not-found' | 'wrong-kind' | 'bad-target' }
  | { ok: false; reason: 'conflict'; report: ReportRow };

export async function placeNoteInReport(
  db: Db,
  reportId: string,
  noteId: string,
  target: ReportAttachmentTarget | null,
  expectedBodyVersion: string | null,
): Promise<PlaceNoteInReportResult> {
  const report = await getReport(db, reportId);
  if (!report) return { ok: false, reason: 'not-found' };
  if (report.status === 'finalized') {
    return { ok: false, reason: 'conflict', report };
  }
  if (report.generatedAt !== expectedBodyVersion) {
    return { ok: false, reason: 'conflict', report };
  }

  const noteRes = await db.execute<{ id: string; kind: NoteKind; report_id: string }>(sql`
    SELECT id, kind, report_id
    FROM app.notes
    WHERE id = ${noteId}
      AND report_id = ${reportId}
    LIMIT 1
  `);
  const note = noteRes.rows[0];
  if (!note) return { ok: false, reason: 'not-found' };
  const bucket = attachmentBucketForKind(note.kind);
  if (!bucket) return { ok: false, reason: 'wrong-kind' };

  if (!report.body) {
    return target === null
      ? { ok: true, report }
      : { ok: false, reason: 'bad-target' };
  }
  if (target && !targetAt(report.body, target)) {
    return { ok: false, reason: 'bad-target' };
  }

  const next = cloneReportBody(report.body);
  removeAttachmentId(next, noteId);
  if (target) {
    const selected = targetAt(next, target);
    if (!selected) return { ok: false, reason: 'bad-target' };
    const attachments = ensureAttachments(selected);
    attachments[bucket] ??= [];
    attachments[bucket]!.push(noteId);
  }

  const valid = await collectValidReportAttachmentIds(db, reportId);
  const bodyJson = JSON.stringify(sanitiseAttachments(next, valid));
  const updated = await db.execute<RawReport>(sql`
    UPDATE app.reports
       SET body = ${bodyJson}::jsonb,
           updated_at = now()
     WHERE id = ${reportId}
       AND status = 'draft'
       AND date_trunc('milliseconds', generated_at)
           IS NOT DISTINCT FROM ${expectedBodyVersion}::timestamptz
       AND date_trunc('milliseconds', updated_at) = ${report.updatedAt}::timestamptz
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = updated.rows[0];
  if (row) return { ok: true, report: mapReport(row) };

  const current = await getReport(db, reportId);
  return current
    ? { ok: false, reason: 'conflict', report: current }
    : { ok: false, reason: 'not-found' };
}

// ---------------------------------------------------------------------------
// AI-generation surface (P1.7).
// ---------------------------------------------------------------------------

export interface GenerationNoteFile {
  id: string;
  fileId: string;
  thumbnailFileId: string | null;
  position: number;
  caption: string | null;
}

export interface GenerationNote {
  id: string;
  kind: NoteKind;
  body: string | null;
  fileId: string | null;
  thumbnailFileId: string | null;
  transcript: string | null;
  title: string | null;
  summary: string | null;
  source: NoteSource | null;
  meta: Record<string, unknown>;
  files: GenerationNoteFile[];
  createdAt: string;
}

export interface GenerationPayload {
  notes: GenerationNote[];
  currentBody: ReportBody | null;
}

/**
 * Build the structured user-prompt payload for `generateReport`.
 *
 * The AI receives ordered note objects plus the current report body.
 * Note array order is part of the contract: oldest first, then id.
 */
export async function collectNotesForGeneration(db: Db, reportId: string): Promise<GenerationPayload> {
  const reportRes = await db.execute<{ body: ReportBody | null }>(sql`
    SELECT body
    FROM app.reports
    WHERE id = ${reportId}
    LIMIT 1
  `);
  const currentBody = reportRes.rows[0]?.body ?? null;

  const r = await db.execute<{
    id: string;
    kind: NoteKind;
    body: string | null;
    file_id: string | null;
    thumbnail_file_id: string | null;
    transcript: string | null;
    title: string | null;
    summary: string | null;
    source: NoteSource | null;
    meta: Record<string, unknown> | null;
    created_at: Date;
  }>(sql`
    SELECT n.id, n.kind, n.body, n.file_id, n.thumbnail_file_id,
           n.transcript, n.title, n.summary, n.source, n.meta, n.created_at
    FROM app.notes n
    WHERE n.report_id = ${reportId}
    ORDER BY ${notesCanonicalOrder('n')}
  `);

  const noteIdsWithFiles = r.rows
    .filter((note) => note.kind === 'image')
    .map((note) => note.id);
  const filesByNoteId = new Map<string, GenerationNoteFile[]>();
  if (noteIdsWithFiles.length > 0) {
    const inList = sql.join(
      noteIdsWithFiles.map((id) => sql`${id}`),
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
      const files = filesByNoteId.get(nf.note_id) ?? [];
      files.push({
        id: nf.id,
        fileId: nf.file_id,
        thumbnailFileId: nf.thumbnail_file_id,
        position: nf.position,
        caption: nf.caption,
      });
      filesByNoteId.set(nf.note_id, files);
    }
  }

  return {
    currentBody,
    notes: r.rows.map((note) => ({
      id: note.id,
      kind: note.kind,
      body: note.body,
      fileId: note.file_id,
      thumbnailFileId: note.thumbnail_file_id,
      transcript: note.transcript,
      title: note.title,
      summary: note.summary,
      source: note.source,
      meta: note.meta && typeof note.meta === 'object' && !Array.isArray(note.meta)
        ? note.meta
        : {},
      files: filesByNoteId.get(note.id) ?? [],
      createdAt: new Date(note.created_at).toISOString(),
    })),
  };
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
  preserveAttachmentsFrom?: ReportBody | null,
  expectedUpdatedAt?: string,
): Promise<ReportRow | null> {
  const lastGenJson = lastGeneration ? JSON.stringify(lastGeneration) : null;
  const valid = await collectValidReportAttachmentIds(db, reportId);
  const cleanBody = preserveExistingAttachments(body, preserveAttachmentsFrom ?? null, valid);
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET body = ${JSON.stringify(cleanBody)}::jsonb,
        generated_at = COALESCE(${snapshotTs ?? null}::timestamptz, now()),
        notes_since_last_generation = 0,
        last_generation = CASE
          WHEN ${lastGenJson}::text IS NOT NULL THEN ${lastGenJson}::jsonb
          ELSE last_generation
        END,
        updated_at = ${nextReportUpdatedAt()}
    WHERE id = ${reportId}
      AND status = 'draft'
      AND ${reportUpdatedAtPrecondition(expectedUpdatedAt)}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

export async function finalizeReport(
  db: Db,
  reportId: string,
  expectedUpdatedAt?: string,
): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET status = 'finalized',
        finalized_at = COALESCE(finalized_at, now()),
        updated_at = ${nextReportUpdatedAt()}
    WHERE id = ${reportId}
      AND status = 'draft'
      AND ${reportUpdatedAtPrecondition(expectedUpdatedAt)}
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
export async function unfinalizeReport(
  db: Db,
  reportId: string,
  expectedUpdatedAt?: string,
): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET status = 'draft',
        finalized_at = NULL,
        updated_at = ${nextReportUpdatedAt()}
    WHERE id = ${reportId}
      AND finalized_at IS NOT NULL
      AND ${reportUpdatedAtPrecondition(expectedUpdatedAt)}
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
  const attached = await db.execute<{ attached: boolean }>(sql`
    SELECT app.attach_report_pdf(${reportId}, ${fileId}) AS attached
  `);
  if (!attached.rows[0]?.attached) return null;
  return getReport(db, reportId);
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
  const liveUserPrompt = JSON.stringify(
    await collectNotesForGeneration(db, reportId),
    null,
    2,
  );

  return {
    prompt: {
      system: lastGeneration?.systemPrompt ?? '',
      user: liveUserPrompt,
    },
    notes,
    lastGeneration,
  };
}
