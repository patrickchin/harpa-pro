/**
 * Finalized-report review comments.
 *
 * All calls receive the request-scoped DB handle. The list helper is a
 * SECURITY DEFINER function because better-auth profile RLS otherwise hides
 * other members' display names; the function itself re-checks membership.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../db/schema.js';
import { insertWithGeneratedId } from '../lib/ids.js';

type Db = NodePgDatabase<typeof schema>;

export interface ReportCommentRow {
  id: string;
  reportId: string;
  authorId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}

interface RawReportCommentRow extends Record<string, unknown> {
  id: string;
  report_id: string;
  author_id: string;
  author_display_name: string;
  body: string;
  created_at: Date;
}

function toComment(row: RawReportCommentRow): ReportCommentRow {
  return {
    id: row.id,
    reportId: row.report_id,
    authorId: row.author_id,
    authorDisplayName: row.author_display_name,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listReportComments(db: Db, reportId: string): Promise<ReportCommentRow[]> {
  const result = await db.execute<RawReportCommentRow>(
    sql`SELECT * FROM app.list_report_comments(${reportId})`,
  );
  return result.rows.map(toComment);
}

export async function createReportComment(
  db: Db,
  input: { reportId: string; authorId: string; body: string },
): Promise<ReportCommentRow> {
  return insertWithGeneratedId('rcm', async (id) => {
    const result = await db.execute<RawReportCommentRow>(sql`
      WITH inserted AS (
        INSERT INTO app.report_comments(id, report_id, author_id, body)
        VALUES (${id}, ${input.reportId}, ${input.authorId}, ${input.body})
        RETURNING id, report_id, author_id, body, created_at
      )
      SELECT i.id,
             i.report_id,
             i.author_id,
             COALESCE(
               NULLIF(btrim(u.display_name), ''),
               NULLIF(btrim(u.name), ''),
               'Project member'
             ) AS author_display_name,
             i.body,
             i.created_at
      FROM inserted i
      JOIN public."user" u ON u.id = i.author_id
    `);
    const row = result.rows[0];
    if (!row) throw new Error('create report comment returned no row');
    return toComment(row);
  });
}
