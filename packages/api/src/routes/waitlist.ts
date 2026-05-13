/**
 * POST /waitlist  (M1.3) — public, unauthenticated waitlist signup.
 * POST /waitlist/confirm  (M1.4) — one-time-token confirmation.
 *
 * Both routes are enumeration-safe: /waitlist always returns a neutral
 * 202 with the same message regardless of whether the email was new,
 * duplicate, invalid, disposable, or rate-limited (rate-limit is the
 * one case where we return 429 — abuse signal we want the client to
 * back off on).
 *
 * Rate limit: per-IP, two windows (5/hour, 50/day). Anonymous DoS
 * protection — `withRateLimit` keys on userId so we can't reuse it
 * here. See lib/rateLimiter.ts.
 *
 * See docs/marketing/plan-m1-waitlist.md.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { sql } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { waitlist as waitlistSchemas } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { rawDb } from '../db/client.js';
import { env } from '../env.js';
import { validateEmail } from '../lib/email-validation.js';
import { createTurnstileClient, type TurnstileClient } from '../lib/turnstile.js';
import { createResendClient, type ResendClient } from '../lib/resend.js';
import { getRateLimiter } from '../lib/rateLimiter.js';
import { renderWaitlistConfirmationEmail } from '../emails/waitlist-confirmation.js';

const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string().optional(),
});

/**
 * Test seam — production code uses the env-driven default clients,
 * but integration tests inject fakes via `setWaitlistClients`.
 */
let turnstileClient: TurnstileClient | null = null;
let resendClient: ResendClient | null = null;

export function setWaitlistClients(opts: {
  turnstile?: TurnstileClient;
  resend?: ResendClient;
}): void {
  if (opts.turnstile !== undefined) turnstileClient = opts.turnstile;
  if (opts.resend !== undefined) resendClient = opts.resend;
}

export function resetWaitlistClients(): void {
  turnstileClient = null;
  resendClient = null;
}

function getTurnstile(): TurnstileClient {
  if (turnstileClient) return turnstileClient;
  turnstileClient = createTurnstileClient();
  return turnstileClient;
}

function getResend(): ResendClient {
  if (resendClient) return resendClient;
  resendClient = createResendClient();
  return resendClient;
}

const NEUTRAL_MESSAGE =
  "If that email address is valid, we've sent you a confirmation link.";

const SIGNUP_PER_HOUR = 5;
const SIGNUP_PER_DAY = 50;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CONFIRM_TTL_MS = 7 * DAY_MS;

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  // Fly.io passes the real client IP in `Fly-Client-IP`. Cloudflare in
  // `CF-Connecting-IP`. Fall back to `x-forwarded-for` for local/proxy
  // setups. Never trust the socket address in serverless.
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('fly-client-ip') ??
    (c.req.header('x-forwarded-for') ?? '').split(',')[0]?.trim() ??
    'unknown'
  );
}

function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}|${env.WAITLIST_IP_HASH_SALT}`).digest('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const waitlistRoutes = new OpenAPIHono<AppEnv>();

waitlistRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/waitlist',
    tags: ['waitlist'],
    request: {
      body: {
        content: {
          'application/json': { schema: waitlistSchemas.waitlistSignupRequest },
        },
      },
    },
    responses: {
      202: {
        description: 'Signup accepted (neutral response).',
        content: { 'application/json': { schema: waitlistSchemas.waitlistSignupResponse } },
      },
      400: {
        description: 'Bad request.',
        content: { 'application/json': { schema: errorBody } },
      },
      429: {
        description: 'Rate limited.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  async (c) => {
    const ip = clientIp(c);
    const limiter = getRateLimiter();

    const hourly = await limiter.consume(`waitlist_signup_hour:${ip}`, SIGNUP_PER_HOUR, HOUR_MS);
    const daily = await limiter.consume(`waitlist_signup_day:${ip}`, SIGNUP_PER_DAY, DAY_MS);
    if (!hourly.success || !daily.success) {
      const retryAfter = Math.max(
        1,
        Math.ceil(((hourly.success ? daily.reset : hourly.reset) - Date.now()) / 1000),
      );
      const requestId = c.get('requestId');
      return c.json(
        {
          error: { code: 'rate_limited', message: 'Too many requests. Please try again later.' },
          requestId,
        },
        429,
        { 'Retry-After': String(retryAfter) },
      );
    }

    const body = c.req.valid('json');

    // Turnstile first — cheapest abuse signal. Failure returns neutral 202
    // (don't tell the bot why we rejected it).
    const turnstile = getTurnstile();
    const verify = await turnstile.verify(body.turnstileToken, ip);
    if (!verify.success) {
      return c.json({ success: true, message: NEUTRAL_MESSAGE }, 202);
    }

    // Disposable-domain check. Same neutral response.
    const emailCheck = validateEmail(body.email);
    if (!emailCheck.ok) {
      return c.json({ success: true, message: NEUTRAL_MESSAGE }, 202);
    }

    // Generate the raw confirm token + its hash. The raw token only
    // ever leaves the system inside the email body.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS);

    // Upsert by email. If the row exists and is confirmed already, we
    // do NOT rotate the token (no point — they're confirmed). If it
    // exists and is NOT confirmed, we DO rotate to a fresh token so
    // re-requests work. Either way we return the neutral 202.
    //
    // `app.waitlist_signups.email` is `citext UNIQUE`, so we can rely
    // on PG for the conflict resolution.
    const db = rawDb();
    const result = await db.execute<{
      email: string;
      confirmed_at: Date | null;
      // We need to know whether this insert actually set our token,
      // so we use a `RETURNING` clause + a CASE on the conflict.
      token_was_rotated: boolean;
    }>(sql`
      INSERT INTO app.waitlist_signups (
        email, company, role, source, ip_hash,
        confirm_token_hash, confirm_token_expires_at
      ) VALUES (
        ${body.email}, ${body.company ?? null}, ${body.role ?? null}, ${body.source ?? null},
        ${hashIp(ip)}, ${tokenHash}, ${expiresAt.toISOString()}::timestamptz
      )
      ON CONFLICT (email) DO UPDATE SET
        confirm_token_hash = CASE
          WHEN app.waitlist_signups.confirmed_at IS NULL THEN EXCLUDED.confirm_token_hash
          ELSE app.waitlist_signups.confirm_token_hash
        END,
        confirm_token_expires_at = CASE
          WHEN app.waitlist_signups.confirmed_at IS NULL THEN EXCLUDED.confirm_token_expires_at
          ELSE app.waitlist_signups.confirm_token_expires_at
        END,
        company = COALESCE(app.waitlist_signups.company, EXCLUDED.company),
        role = COALESCE(app.waitlist_signups.role, EXCLUDED.role),
        source = COALESCE(app.waitlist_signups.source, EXCLUDED.source)
      RETURNING
        email::text AS email,
        confirmed_at,
        (confirm_token_hash = ${tokenHash}) AS token_was_rotated
    `);

    const row = result.rows[0];
    if (row && row.token_was_rotated && row.confirmed_at === null) {
      // Send the confirmation email (raw token in the URL, never logged).
      const confirmUrl = `${env.WAITLIST_CONFIRM_BASE_URL}?token=${rawToken}`;
      const email = renderWaitlistConfirmationEmail({ confirmUrl });
      try {
        await getResend().send({
          to: body.email,
          subject: 'Confirm your spot on the harpapro.com waitlist',
          html: email.html,
          text: email.text,
        });
      } catch (err) {
        // Log but do NOT leak failure to the client (still 202). The
        // operator alerting picks this up via the access log.
        console.error('[waitlist] resend send failed', err);
      }
    }

    return c.json({ success: true, message: NEUTRAL_MESSAGE }, 202);
  },
);

waitlistRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/waitlist/confirm',
    tags: ['waitlist'],
    request: {
      body: {
        content: {
          'application/json': { schema: waitlistSchemas.waitlistConfirmRequest },
        },
      },
    },
    responses: {
      200: {
        description: 'Confirmed.',
        content: { 'application/json': { schema: waitlistSchemas.waitlistConfirmResponse } },
      },
      400: {
        description: 'Bad token.',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  }),
  async (c) => {
    const { token } = c.req.valid('json');
    const candidate = hashToken(token);

    // Pull the row by indexed hash, then compare in constant time to
    // make doubly sure we're never timing-leaking which hashes exist.
    const db = rawDb();
    const result = await db.execute<{
      id: string;
      confirm_token_hash: string;
      confirm_token_expires_at: Date | null;
      confirmed_at: Date | null;
    }>(sql`
      SELECT id, confirm_token_hash, confirm_token_expires_at, confirmed_at
      FROM app.waitlist_signups
      WHERE confirm_token_hash = ${candidate}
      LIMIT 1
    `);
    const row = result.rows[0];

    // Constant-time compare even after the hash lookup, so a row-found
    // vs row-not-found path takes the same time at the bytes level.
    const candBuf = Buffer.from(candidate, 'hex');
    const dummy = Buffer.alloc(candBuf.length);
    const stored = row ? Buffer.from(row.confirm_token_hash, 'hex') : dummy;
    const match =
      row !== undefined &&
      stored.length === candBuf.length &&
      timingSafeEqual(stored, candBuf);

    if (!match) {
      throw new HTTPException(400, { message: 'Invalid or expired confirmation link.' });
    }

    // Already-confirmed → idempotent 200.
    if (row.confirmed_at !== null) {
      return c.json({ success: true as const, message: 'Already confirmed.' }, 200);
    }

    // Expired.
    if (
      row.confirm_token_expires_at === null ||
      new Date(row.confirm_token_expires_at).getTime() < Date.now()
    ) {
      throw new HTTPException(400, { message: 'Invalid or expired confirmation link.' });
    }

    await db.execute(sql`
      UPDATE app.waitlist_signups
      SET confirmed_at = now()
      WHERE id = ${row.id} AND confirmed_at IS NULL
    `);

    return c.json({ success: true as const, message: "You're on the list." }, 200);
  },
);
