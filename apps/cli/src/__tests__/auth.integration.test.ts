/**
 * CLI.2 — `harpa auth` integration tests (better-auth email-OTP).
 *
 * Boots a real Postgres + the in-process Hono app, then exercises
 * the auth commands through their real raw-fetch implementation
 * wired to `app.fetch` (no stubbing). This is the per-Pitfall-13
 * "default-wiring" test that proves the better-auth handler + CLI
 * surface line up end-to-end.
 *
 * `EMAIL_OTP_LIVE` defaults to off, so OTPs are persisted to
 * `public.verification` instead of being mailed; we read them back
 * directly from the DB.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { authOtpStart, authOtpVerify, authLogout } from '../commands/auth.js';
import { EXIT } from '../lib/error.js';
import { readLatestOtp } from './_helpers.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;

const API_URL = 'http://localhost';

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  app = createApp();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

class MemoryStream extends Writable {
  chunks: string[] = [];
  _write(chunk: Buffer | string, _enc: BufferEncoding, cb: () => void): void {
    this.chunks.push(chunk.toString());
    cb();
  }
  get text(): string {
    return this.chunks.join('');
  }
}

let stdout: MemoryStream;
let stderr: MemoryStream;

beforeEach(() => {
  stdout = new MemoryStream();
  stderr = new MemoryStream();
});

/**
 * Adapter fetch that routes requests through the in-process Hono app.
 * Same shape as the integration-test fetch override on the typed client.
 */
const appFetch: typeof fetch = (input, init) => {
  const req = input instanceof Request ? input : new Request(input as string, init);
  return app.fetch(req);
};

describe('harpa auth otp start', () => {
  it('sends OTP and prints success', async () => {
    const exitCode = await authOtpStart({
      apiUrl: API_URL,
      fetch: appFetch,
      email: 'cli-tests-001@e2e.harpapro.com',
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/OTP sent/);
    expect(stdout.text).toMatch(/cli-tests-001@e2e\.harpapro\.com/);
    expect(stderr.text).toBe('');
  });

  it('rejects malformed email with validation exit code', async () => {
    const exitCode = await authOtpStart({
      apiUrl: API_URL,
      fetch: appFetch,
      email: 'not-an-email',
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.VALIDATION);
    expect(stdout.text).toBe('');
    expect(stderr.text).toMatch(/Error: 400/);
  });

  it('emits JSON when --json is set', async () => {
    const exitCode = await authOtpStart({
      apiUrl: API_URL,
      fetch: appFetch,
      email: 'cli-tests-002@e2e.harpapro.com',
      json: true,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    // Better-auth returns an object body; just verify it parses.
    expect(() => JSON.parse(stdout.text)).not.toThrow();
  });
});

describe('harpa auth otp verify', () => {
  const email = 'cli-tests-010@e2e.harpapro.com';

  beforeEach(async () => {
    await authOtpStart({
      apiUrl: API_URL,
      fetch: appFetch,
      email,
      stdout: new MemoryStream(),
      stderr: new MemoryStream(),
    });
  });

  it('mints a token and renders user info', async () => {
    const code = await readLatestOtp(email);
    const exitCode = await authOtpVerify({
      apiUrl: API_URL,
      fetch: appFetch,
      email,
      code,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/Verified as/);
    expect(stdout.text).toMatch(new RegExp(email));
    expect(stdout.text).toMatch(/export HARPA_TOKEN=/);
  });

  it('--raw prints only the bearer token (shell-capture friendly)', async () => {
    const code = await readLatestOtp(email);
    const exitCode = await authOtpVerify({
      apiUrl: API_URL,
      fetch: appFetch,
      email,
      code,
      raw: true,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    const token = stdout.text.trim();
    expect(token.length).toBeGreaterThan(16);
    expect(stdout.text).not.toMatch(/Verified as/);
  });

  it('rejects an invalid OTP code with validation exit code', async () => {
    const exitCode = await authOtpVerify({
      apiUrl: API_URL,
      fetch: appFetch,
      email,
      code: '000000',
      stdout,
      stderr,
    });

    // Better-auth returns 400 INVALID_OTP for a wrong code.
    expect([EXIT.VALIDATION, EXIT.AUTH]).toContain(exitCode);
    expect(stderr.text).toMatch(/Error: 4\d\d/);
  });
});

describe('harpa auth logout', () => {
  it('revokes the bearer token and reports success', async () => {
    const email = 'cli-tests-020@e2e.harpapro.com';
    await authOtpStart({
      apiUrl: API_URL,
      fetch: appFetch,
      email,
      stdout: new MemoryStream(),
      stderr: new MemoryStream(),
    });

    const code = await readLatestOtp(email);
    const verifyOut = new MemoryStream();
    await authOtpVerify({
      apiUrl: API_URL,
      fetch: appFetch,
      email,
      code,
      raw: true,
      stdout: verifyOut,
      stderr: new MemoryStream(),
    });
    const token = verifyOut.text.trim();
    expect(token.length).toBeGreaterThan(16);

    const exitCode = await authLogout({
      apiUrl: API_URL,
      fetch: appFetch,
      token,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/Logged out/);

    // Side-effect check: the session row should be gone.
    const pool = getPool();
    const conn = await pool.connect();
    try {
      const rows = await conn.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM "session" s
         JOIN "user" u ON u.id = s.user_id
         WHERE lower(u.email) = lower($1)`,
        [email],
      );
      expect(rows.rows[0]?.count).toBe('0');
    } finally {
      conn.release();
    }
  });

  it('treats sign-out with an invalid token as a no-op (better-auth)', async () => {
    const exitCode = await authLogout({
      apiUrl: API_URL,
      fetch: appFetch,
      token: 'not-a-real-token',
      stdout,
      stderr,
    });

    // Better-auth's sign-out endpoint is idempotent and returns 200 even
    // when the token doesn't resolve to a session — there's nothing to
    // delete. We just want to make sure the CLI doesn't crash.
    expect(exitCode).toBe(EXIT.OK);
  });
});
