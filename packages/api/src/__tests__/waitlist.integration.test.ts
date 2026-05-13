/**
 * Integration tests for POST /waitlist + POST /waitlist/confirm.
 * See docs/marketing/plan-m1-waitlist.md §M1.3 + §M1.4.
 *
 * Run against a real Postgres via Testcontainers so the citext
 * unique key, RLS, and the upsert path are all exercised. Turnstile
 * and Resend are injected as fakes via `setWaitlistClients`.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { startPg, type PgFixture } from './setup-pg.js';
import { createApp } from '../app.js';
import { rawDb, resetPool, getPool } from '../db/client.js';
import { resetRateLimiter } from '../lib/rateLimiter.js';
import {
  setWaitlistClients,
  resetWaitlistClients,
} from '../routes/waitlist.js';
import {
  resetFakeResendSends,
  getFakeResendSends,
  type ResendClient,
  type EmailSendParams,
} from '../lib/resend.js';
import type { TurnstileClient } from '../lib/turnstile.js';

let fx: PgFixture;

function alwaysOkTurnstile(): TurnstileClient {
  return { async verify() { return { success: true }; } };
}
function alwaysFailTurnstile(): TurnstileClient {
  return { async verify() { return { success: false, errorCodes: ['x'] }; } };
}
function recordingResend(): ResendClient & { sent: EmailSendParams[] } {
  const sent: EmailSendParams[] = [];
  return {
    sent,
    async send(p) {
      sent.push(p);
      return { id: `fake-${sent.length}` };
    },
  } as ResendClient & { sent: EmailSendParams[] };
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

beforeEach(async () => {
  resetRateLimiter();
  resetWaitlistClients();
  resetFakeResendSends();
  // Clean the table between tests so per-email upsert behaviour is
  // deterministic.
  await rawDb().execute(sql`TRUNCATE app.waitlist_signups`);
});

describe('POST /waitlist', () => {
  it('happy path: inserts a row and sends a confirmation email', async () => {
    const resend = recordingResend();
    setWaitlistClients({ turnstile: alwaysOkTurnstile(), resend });
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'jamie@buildco.com',
        company: 'BuildCo',
        role: 'Foreman',
        turnstileToken: 'tt-ok',
      }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(true);

    // Row exists and has hashed token.
    const r = await getPool().query<{ email: string; confirm_token_hash: string }>(
      `SELECT email::text AS email, confirm_token_hash FROM app.waitlist_signups`,
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0]!.email).toBe('jamie@buildco.com');
    expect(r.rows[0]!.confirm_token_hash).toMatch(/^[0-9a-f]{64}$/);

    // One email sent, to the right address.
    expect(resend.sent).toHaveLength(1);
    expect(resend.sent[0]!.to).toBe('jamie@buildco.com');
    expect(resend.sent[0]!.subject).toMatch(/confirm/i);
    expect(resend.sent[0]!.html).toContain('?token=');
  });

  it('dedupe: second submission for same email rotates the token but keeps created_at', async () => {
    const resend = recordingResend();
    setWaitlistClients({ turnstile: alwaysOkTurnstile(), resend });
    const app = createApp();
    const submit = () =>
      app.request('/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@buildco.com', turnstileToken: 'tt-ok' }),
      });

    const first = await submit();
    expect(first.status).toBe(202);
    const initial = await getPool().query<{
      created_at: Date;
      confirm_token_hash: string;
    }>(`SELECT created_at, confirm_token_hash FROM app.waitlist_signups`);
    const initialCreated = initial.rows[0]!.created_at;
    const initialHash = initial.rows[0]!.confirm_token_hash;

    const second = await submit();
    expect(second.status).toBe(202);
    const after = await getPool().query<{
      created_at: Date;
      confirm_token_hash: string;
    }>(`SELECT created_at, confirm_token_hash FROM app.waitlist_signups`);
    expect(after.rowCount).toBe(1); // still one row
    expect(after.rows[0]!.created_at.getTime()).toBe(initialCreated.getTime());
    expect(after.rows[0]!.confirm_token_hash).not.toBe(initialHash);
    expect(resend.sent).toHaveLength(2);
  });

  it('already-confirmed email: second submission does NOT rotate token or send email', async () => {
    // Seed a confirmed row directly.
    await rawDb().execute(sql`
      INSERT INTO app.waitlist_signups(email, confirmed_at, confirm_token_hash, confirm_token_expires_at)
      VALUES ('done@buildco.com', now(), ${'a'.repeat(64)}, now() + interval '7 days')
    `);
    const resend = recordingResend();
    setWaitlistClients({ turnstile: alwaysOkTurnstile(), resend });
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'done@buildco.com', turnstileToken: 'tt-ok' }),
    });
    expect(res.status).toBe(202);
    expect(resend.sent).toHaveLength(0);
    const after = await getPool().query<{ confirm_token_hash: string }>(
      `SELECT confirm_token_hash FROM app.waitlist_signups WHERE email = 'done@buildco.com'`,
    );
    expect(after.rows[0]!.confirm_token_hash).toBe('a'.repeat(64));
  });

  it('turnstile fail: returns 202 neutral but no row inserted, no email sent', async () => {
    const resend = recordingResend();
    setWaitlistClients({ turnstile: alwaysFailTurnstile(), resend });
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'bot@buildco.com', turnstileToken: 'tt-x' }),
    });
    expect(res.status).toBe(202);
    const r = await getPool().query(`SELECT count(*)::int AS c FROM app.waitlist_signups`);
    expect(Number((r.rows[0] as { c: number }).c)).toBe(0);
    expect(resend.sent).toHaveLength(0);
  });

  it('default fakeTurnstile (compose / :mock builds) accepts any non-empty token end-to-end', async () => {
    // Do NOT inject a Turnstile stub — we want the real default-mode
    // `fakeTurnstile()` from createTurnstileClient(). This mirrors
    // `docker compose up`, where the marketing site's Cloudflare
    // test-key widget produces real-format tokens like
    // `XXXX.DUMMY.TOKEN.XXXX`. Regression test for the silent
    // empty-DB bug where fake mode required a `tt-` prefix.
    const resend = recordingResend();
    setWaitlistClients({ resend });
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'dev@buildco.com',
        turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
      }),
    });
    expect(res.status).toBe(202);
    const r = await getPool().query<{ c: number }>(
      `SELECT count(*)::int AS c FROM app.waitlist_signups WHERE email = 'dev@buildco.com'`,
    );
    expect(Number(r.rows[0]!.c)).toBe(1);
    expect(resend.sent).toHaveLength(1);
  });

  it('default fakeTurnstile rejects empty token (caller forgot to wire widget)', async () => {
    const resend = recordingResend();
    setWaitlistClients({ resend });
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Zod schema requires min(1), so an empty token is a 400 before
      // it even reaches Turnstile. This guards both layers.
      body: JSON.stringify({ email: 'x@buildco.com', turnstileToken: '' }),
    });
    expect(res.status).toBe(400);
    const r = await getPool().query(`SELECT count(*)::int AS c FROM app.waitlist_signups`);
    expect(Number((r.rows[0] as { c: number }).c)).toBe(0);
  });

  it('disposable email: returns 202 neutral but no row inserted', async () => {
    const resend = recordingResend();
    setWaitlistClients({ turnstile: alwaysOkTurnstile(), resend });
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@mailinator.com', turnstileToken: 'tt-ok' }),
    });
    expect(res.status).toBe(202);
    const r = await getPool().query(`SELECT count(*)::int AS c FROM app.waitlist_signups`);
    expect(Number((r.rows[0] as { c: number }).c)).toBe(0);
    expect(resend.sent).toHaveLength(0);
  });

  it('rate limit: 6th request from same IP within hour gets 429', async () => {
    setWaitlistClients({ turnstile: alwaysOkTurnstile(), resend: recordingResend() });
    const app = createApp();
    const submit = (email: string) =>
      app.request('/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5' },
        body: JSON.stringify({ email, turnstileToken: 'tt-ok' }),
      });
    for (let i = 0; i < 5; i++) {
      const r = await submit(`u${i}@buildco.com`);
      expect(r.status).toBe(202);
    }
    const sixth = await submit('u5@buildco.com');
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('malformed email: returns 400 (zod schema rejection)', async () => {
    setWaitlistClients({ turnstile: alwaysOkTurnstile(), resend: recordingResend() });
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', turnstileToken: 'tt-ok' }),
    });
    expect(res.status).toBe(400);
  });

  it('lowercases email and dedupes case-variants via citext', async () => {
    const resend = recordingResend();
    setWaitlistClients({ turnstile: alwaysOkTurnstile(), resend });
    const app = createApp();
    await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'Jamie@BuildCo.com', turnstileToken: 'tt-ok' }),
    });
    await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'JAMIE@buildco.com', turnstileToken: 'tt-ok' }),
    });
    const r = await getPool().query(`SELECT count(*)::int AS c FROM app.waitlist_signups`);
    expect(Number((r.rows[0] as { c: number }).c)).toBe(1);
  });

  it('uses default fake clients when none injected (mock mode)', async () => {
    // Don't inject — pull defaults from env (TURNSTILE_LIVE=0, RESEND_LIVE=0).
    const app = createApp();
    const res = await app.request('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'env@buildco.com', turnstileToken: 'tt-ok' }),
    });
    expect(res.status).toBe(202);
    expect(getFakeResendSends().length).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /waitlist/confirm', () => {
  async function seedSignup(email: string, opts: { expired?: boolean; confirmed?: boolean } = {}) {
    const realToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(realToken).digest('hex');
    const expiresAt = opts.expired
      ? sql`now() - interval '1 day'`
      : sql`now() + interval '7 days'`;
    const confirmed = opts.confirmed ? sql`now()` : sql`NULL`;
    await rawDb().execute(sql`
      INSERT INTO app.waitlist_signups(email, confirm_token_hash, confirm_token_expires_at, confirmed_at)
      VALUES (${email}, ${tokenHash}, ${expiresAt}, ${confirmed})
    `);
    return { rawToken: realToken, tokenHash };
  }

  it('happy: valid unexpired token confirms (sets confirmed_at)', async () => {
    const { rawToken } = await seedSignup('h@buildco.com');
    const app = createApp();
    const res = await app.request('/waitlist/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    const r = await getPool().query<{ confirmed_at: Date | null }>(
      `SELECT confirmed_at FROM app.waitlist_signups WHERE email = 'h@buildco.com'`,
    );
    expect(r.rows[0]!.confirmed_at).not.toBeNull();
  });

  it('idempotent: confirming twice returns 200', async () => {
    const { rawToken } = await seedSignup('idem@buildco.com');
    const app = createApp();
    const first = await app.request('/waitlist/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
    expect(first.status).toBe(200);
    const second = await app.request('/waitlist/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
    expect(second.status).toBe(200);
  });

  it('expired token: 400', async () => {
    const { rawToken } = await seedSignup('exp@buildco.com', { expired: true });
    const app = createApp();
    const res = await app.request('/waitlist/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
    expect(res.status).toBe(400);
  });

  it('unknown token: 400', async () => {
    const app = createApp();
    const res = await app.request('/waitlist/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'c'.repeat(64) }),
    });
    expect(res.status).toBe(400);
  });

  it('malformed token (not 64-hex): 400', async () => {
    const app = createApp();
    const res = await app.request('/waitlist/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'short' }),
    });
    expect(res.status).toBe(400);
  });
});
