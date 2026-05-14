/**
 * CLI.2 — `harpa auth` integration tests.
 *
 * Boots a real Postgres + the in-process Hono app, then exercises
 * the auth commands through the actual `openapi-fetch` client wired
 * to `app.fetch` (no stubbing). This is the per-Pitfall-13
 * "default-wiring" test that proves the API contract + client +
 * command rendering all line up end-to-end.
 *
 * Uses the Twilio fake-mode (TWILIO_LIVE=0 default) so any code
 * matching TWILIO_VERIFY_FAKE_CODE (`000000`) is accepted.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { createApiClient } from '../lib/client.js';
import { authOtpStart, authOtpVerify, authLogout } from '../commands/auth.js';
import { EXIT } from '../lib/error.js';
import type { CliEnv } from '../lib/env.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;

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
 * Build the typed CLI client wired to the in-process Hono app — this
 * exercises the real `createApiClient` factory, not a stub.
 */
function makeClient(token?: string) {
  const env: CliEnv = {
    HARPA_API_URL: 'http://localhost',
    HARPA_DEBUG: '0',
    ...(token ? { HARPA_TOKEN: token } : {}),
  };
  return createApiClient(env, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      return app.fetch(req);
    },
  });
}

describe('harpa auth otp start', () => {
  it('sends OTP and prints verificationId', async () => {
    const client = makeClient();
    const exitCode = await authOtpStart({
      client,
      phone: '+15550800001',
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/OTP sent\. Verification ID:/);
    expect(stderr.text).toBe('');
  });

  it('rejects malformed phone with validation exit code', async () => {
    const client = makeClient();
    const exitCode = await authOtpStart({
      client,
      phone: 'not-a-phone',
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.VALIDATION);
    expect(stdout.text).toBe('');
    expect(stderr.text).toMatch(/Error: 400/);
  });

  it('emits JSON when --json is set', async () => {
    const client = makeClient();
    const exitCode = await authOtpStart({
      client,
      phone: '+15550800002',
      json: true,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    const parsed = JSON.parse(stdout.text);
    expect(parsed.verificationId).toBeTruthy();
  });
});

describe('harpa auth otp verify', () => {
  const phone = '+15550800010';

  beforeEach(async () => {
    // Use throw-away streams so the verify-step assertions see a clean stdout.
    await authOtpStart({
      client: makeClient(),
      phone,
      stdout: new MemoryStream(),
      stderr: new MemoryStream(),
    });
  });

  it('mints a token and renders user info', async () => {
    const client = makeClient();
    const exitCode = await authOtpVerify({
      client,
      phone,
      code: '000000',
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/Verified as/);
    expect(stdout.text).toMatch(/export HARPA_TOKEN=/);
  });

  it('--raw prints only the bearer token (shell-capture friendly)', async () => {
    const client = makeClient();
    const exitCode = await authOtpVerify({
      client,
      phone,
      code: '000000',
      raw: true,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    const token = stdout.text.trim();
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(stdout.text).not.toMatch(/Verified as/);
  });

  it('rejects an invalid OTP code with auth exit code', async () => {
    const client = makeClient();
    const exitCode = await authOtpVerify({
      client,
      phone,
      code: '999999',
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.AUTH);
    expect(stderr.text).toMatch(/Error: 401/);
  });
});

describe('harpa auth logout', () => {
  it('revokes the bearer token and reports success', async () => {
    const phone = '+15550800020';
    await authOtpStart({ client: makeClient(), phone, stdout, stderr });

    const verifyOut = new MemoryStream();
    await authOtpVerify({
      client: makeClient(),
      phone,
      code: '000000',
      raw: true,
      stdout: verifyOut,
      stderr,
    });
    const token = verifyOut.text.trim();

    const exitCode = await authLogout({
      client: makeClient(token),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/Logged out/);

    // Session row should be gone — same assertion as the API auth test.
    const pool = getPool();
    const conn = await pool.connect();
    try {
      const rows = await conn.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.sessions WHERE user_id = (SELECT id FROM auth.users WHERE phone = $1)`,
        [phone],
      );
      expect(rows.rows[0]?.count).toBe('0');
    } finally {
      conn.release();
    }
  });

  it('returns auth exit code when token is invalid', async () => {
    const exitCode = await authLogout({
      client: makeClient('not.a.real.jwt'),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.AUTH);
    expect(stderr.text).toMatch(/Error: 401/);
  });
});
