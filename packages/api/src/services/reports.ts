/**
 * Reports CRUD service. Generation / finalize / PDF live in
 * services/report-generation.ts (P1.7); this file is only the data
 * surface. All DB access expects a scoped drizzle handle so RLS
 * filters by project membership (see migrations/202605120001_init.sql).
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { reports as reportSchemas } from '@harpa/api-contract';
import type { z } from 'zod';
import * as schema from '../db/schema.js';

type Db = NodePgDatabase<typeof schema>;
type ReportBody = z.infer<typeof reportSchemas.reportBody>;

export type ReportStatus = 'draft' | 'finalized';

export interface ReportRow {
  id: string;
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
          SELECT id, project_id, status, visit_date, body,
                 notes_since_last_generation, generated_at, finalized_at,
                 pdf_file_id, created_at, updated_at
          FROM app.reports
          WHERE project_id = ${projectId}::uuid
            AND (created_at, id) < (${createdAt}::timestamptz, ${id}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${overFetch}
        `);
      })()
    : await db.execute<RawReport>(sql`
        SELECT id, project_id, status, visit_date, body,
               notes_since_last_generation, generated_at, finalized_at,
               pdf_file_id, created_at, updated_at
        FROM app.reports
        WHERE project_id = ${projectId}::uuid
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
    SELECT id, project_id, status, visit_date, body,
           notes_since_last_generation, generated_at, finalized_at,
           pdf_file_id, created_at, updated_at
    FROM app.reports
    WHERE id = ${reportId}::uuid
    LIMIT 1
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

export async function createReport(
  db: Db,
  projectId: string,
  authorId: string,
  input: { visitDate?: string },
): Promise<ReportRow | null> {
  const r = await db.execute<RawReport>(sql`
    INSERT INTO app.reports(project_id, author_id, visit_date)
    VALUES (${projectId}::uuid, ${authorId}::uuid, ${input.visitDate ?? null})
    RETURNING id, project_id, status, visit_date, body,
              notes_since_last_generation, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

export async function updateReport(
  db: Db,
  reportId: string,
  patch: { visitDate?: string | null },
): Promise<ReportRow | null> {
  // Use a discriminator so `null` (clear) vs `undefined` (no change) are distinct.
  const setVisit = Object.prototype.hasOwnProperty.call(patch, 'visitDate');
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET visit_date = CASE WHEN ${setVisit} THEN ${patch.visitDate ?? null} ELSE visit_date END,
        updated_at = now()
    WHERE id = ${reportId}::uuid
    RETURNING id, project_id, status, visit_date, body,
              notes_since_last_generation, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}

export async function deleteReport(db: Db, reportId: string): Promise<boolean> {
  const r = await db.execute<{ id: string }>(sql`
    DELETE FROM app.reports WHERE id = ${reportId}::uuid RETURNING id
  `);
  return r.rows.length > 0;
}
