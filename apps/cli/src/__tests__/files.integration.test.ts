/**
 * CLI.9 — `harpa files` integration tests.
 *
 * Exercises presign → register → signed-URL via the in-process API
 * (FixtureStorage, no real R2 calls). The `uploadFile` helper is
 * tested with an injected fetch that captures the PUT — the fixture
 * URL `https://fixtures.harpa.local/...` doesn't accept real network
 * traffic but the contract (presign → PUT → register) is what matters.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { createApiClient } from '../lib/client.js';
import { authOtpStart, authOtpVerify } from '../commands/auth.js';
import {
  filesPresign,
  filesRegister,
  filesUrl,
  uploadFile,
} from '../commands/files.js';
import { EXIT } from '../lib/error.js';
import type { CliEnv } from '../lib/env.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;
let token: string;
let tmpDir: string;

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
  process.env.R2_FIXTURE_MODE = 'replay';
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  app = createApp();

  const sink = new MemoryStream();
  await authOtpStart({ client: makeClient(), phone: '+15551000050', stdout: sink, stderr: sink });
  const out = new MemoryStream();
  await authOtpVerify({
    client: makeClient(),
    phone: '+15551000050',
    code: '000000',
    raw: true,
    stdout: out,
    stderr: sink,
  });
  token = out.text.trim();

  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'harpa-cli-files-'));
}, 120_000);

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  await fx?.stop();
}, 60_000);

describe('files presign + register + url', () => {
  it('presign mints an upload URL', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await filesPresign({
      client: makeClient(token),
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      json: true,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const body = JSON.parse(stdout.text);
    expect(body.fileKey).toMatch(/^users\/[0-9a-f-]+\/image\/.+\.jpg$/);
    expect(typeof body.uploadUrl).toBe('string');
    expect(typeof body.expiresAt).toBe('string');
  });

  it('register → url round-trips', async () => {
    // Presign first to obtain a server-built key.
    const presignOut = new MemoryStream();
    const sink = new MemoryStream();
    await filesPresign({
      client: makeClient(token),
      kind: 'document',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      json: true,
      stdout: presignOut,
      stderr: sink,
    });
    const { fileKey } = JSON.parse(presignOut.text);

    const regOut = new MemoryStream();
    const regExit = await filesRegister({
      client: makeClient(token),
      kind: 'document',
      fileKey,
      sizeBytes: 2048,
      contentType: 'application/pdf',
      json: true,
      stdout: regOut,
      stderr: sink,
    });
    expect(regExit).toBe(EXIT.OK);
    const file = JSON.parse(regOut.text);
    expect(file.fileKey).toBe(fileKey);
    expect(file.kind).toBe('document');

    const urlOut = new MemoryStream();
    const urlExit = await filesUrl({
      client: makeClient(token),
      fileId: file.id,
      json: true,
      stdout: urlOut,
      stderr: sink,
    });
    expect(urlExit).toBe(EXIT.OK);
    const url = JSON.parse(urlOut.text);
    expect(url.url).toContain(encodeURIComponent(fileKey));
  });

  it('register rejects fileKey outside caller prefix (400 → VALIDATION)', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await filesRegister({
      client: makeClient(token),
      kind: 'image',
      fileKey: 'users/00000000-0000-0000-0000-000000000000/image/x.jpg',
      sizeBytes: 1,
      contentType: 'image/jpeg',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.VALIDATION);
  });

  it('files url requires auth', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await filesUrl({
      client: makeClient(),
      fileId: '00000000-0000-0000-0000-000000000000',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.AUTH);
  });
});

describe('files upload helper', () => {
  it('streams presign → PUT → register and returns the file id', async () => {
    const filePath = path.join(tmpDir, 'sample.pdf');
    await writeFile(filePath, Buffer.alloc(1234, 0x41));

    const puts: { url: string; method?: string; contentType?: string }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      puts.push({
        url,
        method: init?.method,
        contentType: (init?.headers as Record<string, string> | undefined)?.['content-type'],
      });
      return new Response(null, { status: 200 });
    };

    const sink = new MemoryStream();
    const { exitCode, result } = await uploadFile({
      client: makeClient(token),
      file: filePath,
      kind: 'document',
      contentType: 'application/pdf',
      fetchImpl: fakeFetch,
      stderr: sink,
    });

    expect(exitCode).toBe(EXIT.OK);
    expect(result).toBeDefined();
    expect(result!.sizeBytes).toBe(1234);
    expect(result!.contentType).toBe('application/pdf');
    expect(puts).toHaveLength(1);
    expect(puts[0]!.method).toBe('PUT');
    expect(puts[0]!.contentType).toBe('application/pdf');
    expect(puts[0]!.url).toContain('fixtures.harpa.local');
  });

  it('surfaces a non-2xx PUT as GENERIC', async () => {
    const filePath = path.join(tmpDir, 'fail.pdf');
    await writeFile(filePath, Buffer.alloc(16, 0));
    const fakeFetch: typeof fetch = async () =>
      new Response('boom', { status: 500 });
    const sink = new MemoryStream();
    const { exitCode, result } = await uploadFile({
      client: makeClient(token),
      file: filePath,
      kind: 'document',
      contentType: 'application/pdf',
      fetchImpl: fakeFetch,
      stderr: sink,
    });
    expect(exitCode).toBe(EXIT.GENERIC);
    expect(result).toBeUndefined();
  });

  it('reports missing file as TRANSPORT', async () => {
    const sink = new MemoryStream();
    const { exitCode } = await uploadFile({
      client: makeClient(token),
      file: path.join(tmpDir, 'does-not-exist.bin'),
      kind: 'image',
      contentType: 'image/jpeg',
      fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch,
      stderr: sink,
    });
    expect(exitCode).toBe(EXIT.TRANSPORT);
  });
});
