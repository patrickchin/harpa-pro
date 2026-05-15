/**
 * CLI.3 — `harpa me` integration tests.
 *
 * Boots a real Postgres + in-process Hono app, mints a bearer via the
 * OTP fake flow, then exercises the `me` commands through the real
 * `openapi-fetch` client (default-wiring, per Pitfall 13).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { createApiClient } from '../lib/client.js';
import { authOtpStart, authOtpVerify } from '../commands/auth.js';
import { meGet, meUpdate, meUsage } from '../commands/me.js';
import { EXIT } from '../lib/error.js';
import type { CliEnv } from '../lib/env.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;
let token: string;

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

function makeClient(t?: string) {
  const env: CliEnv = {
    HARPA_API_URL: 'http://localhost',
    HARPA_DEBUG: '0',
    ...(t ? { HARPA_TOKEN: t } : {}),
  };
  return createApiClient(env, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      return app.fetch(req);
    },
  });
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  app = createApp();

  // Sign in once for the whole suite.
  const phone = '+15550900001';
  const throwaway = new MemoryStream();
  await authOtpStart({ client: makeClient(), phone, stdout: throwaway, stderr: throwaway });
  const verifyOut = new MemoryStream();
  await authOtpVerify({
    client: makeClient(),
    phone,
    code: '000000',
    raw: true,
    stdout: verifyOut,
    stderr: throwaway,
  });
  token = verifyOut.text.trim();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

let stdout: MemoryStream;
let stderr: MemoryStream;

beforeEach(() => {
  stdout = new MemoryStream();
  stderr = new MemoryStream();
});

describe('harpa me get', () => {
  it('renders the authenticated user', async () => {
    const exitCode = await meGet({ client: makeClient(token), stdout, stderr });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/\+15550900001/);
    expect(stdout.text).toMatch(/ID:/);
  });

  it('returns auth exit code without a token', async () => {
    const exitCode = await meGet({ client: makeClient(), stdout, stderr });

    expect(exitCode).toBe(EXIT.AUTH);
    expect(stderr.text).toMatch(/Error: 401/);
  });

  it('emits JSON with --json', async () => {
    const exitCode = await meGet({ client: makeClient(token), json: true, stdout, stderr });

    expect(exitCode).toBe(EXIT.OK);
    const parsed = JSON.parse(stdout.text);
    expect(parsed.user.phone).toBe('+15550900001');
  });
});

describe('harpa me update', () => {
  it('updates display name + company name and renders updated user', async () => {
    const exitCode = await meUpdate({
      client: makeClient(token),
      displayName: 'Test User',
      companyName: 'Test Co',
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/Test User/);
    expect(stdout.text).toMatch(/Test Co/);

    // Side-effect check: the next `me get` reflects the new values.
    const verifyOut = new MemoryStream();
    await meGet({ client: makeClient(token), stdout: verifyOut, stderr });
    expect(verifyOut.text).toMatch(/Test User/);
    expect(verifyOut.text).toMatch(/Test Co/);
  });

  it('rejects empty display name with validation exit code', async () => {
    const exitCode = await meUpdate({
      client: makeClient(token),
      displayName: '',
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.VALIDATION);
    expect(stderr.text).toMatch(/Error: 400/);
  });

  it('rejects overlong display name with validation exit code', async () => {
    const exitCode = await meUpdate({
      client: makeClient(token),
      displayName: 'x'.repeat(200),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.VALIDATION);
    expect(stderr.text).toMatch(/Error: 400/);
  });
});

describe('harpa me usage', () => {
  it('renders usage table for a fresh user', async () => {
    const exitCode = await meUsage({ client: makeClient(token), stdout, stderr });

    expect(exitCode).toBe(EXIT.OK);
    expect(stdout.text).toMatch(/Reports/);
    expect(stdout.text).toMatch(/Voice notes/);
    expect(stdout.text).toMatch(/Total/);
  });

  it('emits JSON with --json', async () => {
    const exitCode = await meUsage({
      client: makeClient(token),
      json: true,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(EXIT.OK);
    const parsed = JSON.parse(stdout.text);
    expect(parsed.totals).toBeDefined();
    expect(parsed.months).toBeInstanceOf(Array);
  });
});
