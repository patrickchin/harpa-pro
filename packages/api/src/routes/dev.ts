/**
 * Dev-only routes — registered only when NODE_ENV !== 'production'.
 *
 * POST /api/dev/last-otp  — returns the most-recently created OTP for a
 * given email from public.verification. Used by journey tests to read back
 * the code that better-auth persisted to the DB without sending (EMAIL_OTP_LIVE=0).
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { rawDb } from '../db/client.js';
import type { AppEnv } from '../app.js';

export const devRoutes = new Hono<AppEnv>();

devRoutes.post('/api/dev/last-otp', async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email ?? '';
  const db = rawDb();
  const result = await db.execute<{ value: string }>(
    sql`SELECT value FROM verification WHERE identifier = ${email} ORDER BY created_at DESC LIMIT 1`,
  );
  const rows = (result as unknown as { rows: Array<{ value: string }> }).rows;
  const otp = rows[0]?.value;
  if (!otp) return c.json({ error: 'No OTP found for that email' }, 404);
  return c.json({ otp });
});
