/**
 * GET /admin/waitlist.csv — admin-only CSV export of the waitlist.
 *
 * Streams the result set as text/csv with chunked transfer; we do
 * NOT buffer the full set in memory. Columns:
 *   id, email, company, role, source, confirmed_at, created_at
 *
 * Auth: bearer JWT (withAuth) + auth.users.is_admin = true (withAdmin).
 * Non-admin → 403. Anonymous → 401.
 *
 * See docs/marketing/plan-m1-waitlist.md §M1.6.
 */
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { AppEnv } from '../app.js';
import { getPool } from '../db/client.js';
import { withAuth } from '../middleware/auth.js';
import { withAdmin } from '../middleware/admin.js';

export const adminRoutes = new Hono<AppEnv>();

/**
 * CSV-escape a single field. Wrap in quotes if the value contains a
 * comma, quote, newline, or carriage return; double up internal quotes.
 */
function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowToCsv(row: {
  id: string;
  email: string;
  company: string | null;
  role: string | null;
  source: string | null;
  confirmed_at: Date | null;
  created_at: Date;
}): string {
  return [
    row.id,
    row.email,
    csvEscape(row.company),
    csvEscape(row.role),
    csvEscape(row.source),
    row.confirmed_at ? row.confirmed_at.toISOString() : '',
    row.created_at.toISOString(),
  ].join(',') + '\n';
}

adminRoutes.get('/admin/waitlist.csv', withAuth(), withAdmin(), (c) => {
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="waitlist.csv"');
  c.header('Cache-Control', 'no-store');

  return stream(c, async (s) => {
    await s.write('id,email,company,role,source,confirmed_at,created_at\n');

    const client = await getPool().connect();
    try {
      // Single query + row-by-row flush. Memory bound is the size of
      // the result set; fine at launch volumes (we're a waitlist, not
      // a billing system). When the waitlist grows past ~50k rows we
      // can swap to `pg-query-stream` for a true server-side cursor —
      // the response shape is unchanged.
      const r = await client.query<{
        id: string;
        email: string;
        company: string | null;
        role: string | null;
        source: string | null;
        confirmed_at: Date | null;
        created_at: Date;
      }>(`
        SELECT id, email::text AS email, company, role, source, confirmed_at, created_at
        FROM app.waitlist_signups
        ORDER BY created_at ASC
      `);
      for (const row of r.rows) {
        await s.write(rowToCsv(row));
      }
    } finally {
      client.release();
    }
  });
});
