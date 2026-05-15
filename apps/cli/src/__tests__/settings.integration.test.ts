/**
 * CLI.11 — `harpa settings ai` integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { createApiClient } from '../lib/client.js';
import { authOtpStart, authOtpVerify } from '../commands/auth.js';
import { settingsAiGet, settingsAiSet } from '../commands/settings.js';
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

  const sink = new MemoryStream();
  await authOtpStart({ client: makeClient(), phone: '+15551000070', stdout: sink, stderr: sink });
  const out = new MemoryStream();
  await authOtpVerify({
    client: makeClient(),
    phone: '+15551000070',
    code: '000000',
    raw: true,
    stdout: out,
    stderr: sink,
  });
  token = out.text.trim();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('settings ai', () => {
  it('returns current settings', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await settingsAiGet({
      client: makeClient(token),
      json: true,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const body = JSON.parse(stdout.text);
    expect(typeof body.vendor).toBe('string');
    expect(typeof body.model).toBe('string');
  });

  it('updates vendor + model', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await settingsAiSet({
      client: makeClient(token),
      vendor: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      json: true,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const body = JSON.parse(stdout.text);
    expect(body.vendor).toBe('anthropic');
    expect(body.model).toBe('claude-3-5-sonnet-latest');

    // Verify it persists across the next GET.
    const verifyOut = new MemoryStream();
    await settingsAiGet({
      client: makeClient(token),
      json: true,
      stdout: verifyOut,
      stderr,
    });
    const persisted = JSON.parse(verifyOut.text);
    expect(persisted.vendor).toBe('anthropic');
    expect(persisted.model).toBe('claude-3-5-sonnet-latest');
  });

  it('requires auth', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await settingsAiGet({
      client: makeClient(),
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.AUTH);
  });
});
