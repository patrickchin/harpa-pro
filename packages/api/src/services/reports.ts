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

export type ReportStatus = 'draft' | 'finalized';

export interface ReportRow {
  id: string;
  number: number;
  projectId: string;
  status: ReportStatus;
  visitDate: string | null;
  body: ReportBody | null;
  notesSinceLastGeneration: number;
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
  notes_since_last_generation: number;
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
    notesSinceLastGeneration: Number(r.notes_since_last_generation),
    generatedAt: r.generated_at ? new Date(r.generated_at).toISOString() : null,
    finalizedAt: r.finalized_at ? new Date(r.finalized_at).toISOString() : null,
    pdfUrl: null, // populated by P1.7 (signed URL minted from pdf_file_id)
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
                 notes_since_last_generation, generated_at, finalized_at,
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
               notes_since_last_generation, generated_at, finalized_at,
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
           notes_since_last_generation, generated_at, finalized_at,
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
           r.notes_since_last_generation, r.generated_at, r.finalized_at,
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
): Promise<{ projectSlug: string; reportSlug: string; reportNumber: number } | null> {
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
    projectSlug: row.project_id,
    reportSlug: row.report_id,
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
                  notes_since_last_generation, generated_at, finalized_at,
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
  patch: { visitDate?: string | null },
): Promise<ReportRow | null> {
  const setVisit = Object.prototype.hasOwnProperty.call(patch, 'visitDate');
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET visit_date = CASE WHEN ${setVisit} THEN ${patch.visitDate ?? null} ELSE visit_date END,
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, generated_at, finalized_at,
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

export async function collectNotesForGeneration(db: Db, reportId: string): Promise<string> {
  const r = await db.execute<{ body: string | null; transcript: string | null }>(sql`
    SELECT body, transcript
    FROM app.notes
    WHERE report_id = ${reportId}
    ORDER BY created_at ASC, id ASC
  `);
  return r.rows
    .map((n) => n.transcript ?? n.body ?? '')
    .filter((s) => s.length > 0)
    .join('\n\n');
}

export async function setReportBody(
  db: Db,
  reportId: string,
  body: ReportBody,
): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET body = ${JSON.stringify(body)}::jsonb,
        generated_at = now(),
        notes_since_last_generation = 0,
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

export async function finalizeReport(db: Db, reportId: string): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET status = 'finalized',
        finalized_at = COALESCE(finalized_at, now()),
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_since_last_generation, generated_at, finalized_at,
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
              notes_since_last_generation, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}
