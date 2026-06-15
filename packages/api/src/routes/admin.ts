/**
 * GET /admin/waitlist.csv — admin-only CSV export of the waitlist.
 *
 * Streams the result set as text/csv with chunked transfer; we do
 * NOT buffer the full set in memory. Columns:
 *   id, email, company, role, source, confirmed_at, created_at
 *
 * Auth: bearer better-auth session token (withAuth) +
 * `public."user".is_admin = true` (withAdmin).
 * Non-admin → 403. Anonymous → 401.
 *
 * See docs/marketing/plan-m1-waitlist.md §M1.6.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { stream } from 'hono/streaming';
import type { AppEnv } from '../app.js';
import { getPool } from '../db/client.js';
import { withAuth } from '../middleware/auth.js';
import { withAdmin } from '../middleware/admin.js';
import { usageLimits as usageLimitsSchemas } from '@harpa/api-contract';
import {
  deleteUserLimitOverride,
  updateUserPlan,
  upsertUserLimitOverride,
} from '../services/usage-limits.js';

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

// ---------------------------------------------------------------------------
// Per-account usage limit admin endpoints. See
// docs/v4/arch-usage-limits.md §5.5–5.7.
//
// All three routes run against the unscoped pool because the admin
// acts on someone else's row — the scoped role can't UPDATE other
// users. `withAdmin` re-verifies the admin flag on every request
// (no caching).
// ---------------------------------------------------------------------------

adminRoutes.patch(
  '/admin/users/:id/plan',
  withAuth(),
  withAdmin(),
  async (c) => {
    const adminId = c.get('userId');
    if (!adminId) throw new HTTPException(401);
    const targetUserId = c.req.param('id');
    if (!targetUserId) throw new HTTPException(400, { message: 'Missing user id.' });
    const json = await c.req.json().catch(() => null);
    const parsed = usageLimitsSchemas.planUpdateRequest.safeParse(json);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'Invalid plan update.' });
    }
    await updateUserPlan(targetUserId, parsed.data.plan);
    // Audit log line — operator-grep target. Pitfall 11: never log
    // free-form admin input on the same line as the action, so the
    // `reason` field is intentionally minimal.
    console.log(
      `[admin] plan_change admin=${adminId} target=${targetUserId} plan=${parsed.data.plan}`,
    );
    return c.json({ ok: true }, 200);
  },
);

adminRoutes.put(
  '/admin/users/:id/limit-overrides',
  withAuth(),
  withAdmin(),
  async (c) => {
    const adminId = c.get('userId');
    if (!adminId) throw new HTTPException(401);
    const targetUserId = c.req.param('id');
    if (!targetUserId) throw new HTTPException(400, { message: 'Missing user id.' });
    const json = await c.req.json().catch(() => null);
    const parsed = usageLimitsSchemas.limitOverrideRequest.safeParse(json);
    if (!parsed.success) {
      throw new HTTPException(400, { message: 'Invalid override request.' });
    }
    await upsertUserLimitOverride(targetUserId, adminId, {
      report_generate: parsed.data.report_generate,
      voice_transcribe: parsed.data.voice_transcribe,
      voice_summarize: parsed.data.voice_summarize,
      ai_input_tokens: parsed.data.ai_input_tokens,
      ai_output_tokens: parsed.data.ai_output_tokens,
      reason: parsed.data.reason,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });
    console.log(
      `[admin] limit_override_upsert admin=${adminId} target=${targetUserId}`,
    );
    return c.json({ ok: true }, 200);
  },
);

adminRoutes.delete(
  '/admin/users/:id/limit-overrides',
  withAuth(),
  withAdmin(),
  async (c) => {
    const adminId = c.get('userId');
    if (!adminId) throw new HTTPException(401);
    const targetUserId = c.req.param('id');
    if (!targetUserId) throw new HTTPException(400, { message: 'Missing user id.' });
    await deleteUserLimitOverride(targetUserId);
    console.log(
      `[admin] limit_override_delete admin=${adminId} target=${targetUserId}`,
    );
    return c.json({ ok: true }, 200);
  },
);
