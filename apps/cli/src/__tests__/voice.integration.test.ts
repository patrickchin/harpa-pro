/**
 * CLI.10 — `harpa voice` integration tests.
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
import { uploadFile } from '../commands/files.js';
import { voiceTranscribe, voiceSummarize } from '../commands/voice.js';
import { EXIT } from '../lib/error.js';
import type { CliEnv } from '../lib/env.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;
let token: string;
let voiceFileId: string;
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
  delete process.env.AI_LIVE;
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  app = createApp();

  const sink = new MemoryStream();
  await authOtpStart({ client: makeClient(), phone: '+15551000060', stdout: sink, stderr: sink });
  const out = new MemoryStream();
  await authOtpVerify({
    client: makeClient(),
    phone: '+15551000060',
    code: '000000',
    raw: true,
    stdout: out,
    stderr: sink,
  });
  token = out.text.trim();

  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'harpa-cli-voice-'));
  const voicePath = path.join(tmpDir, 'note.m4a');
  await writeFile(voicePath, Buffer.alloc(2048, 0x55));

  // Upload helper, with fake PUT — FixtureStorage doesn't accept real PUTs.
  const fakeFetch: typeof fetch = async () => new Response(null, { status: 200 });
  const up = await uploadFile({
    client: makeClient(token),
    file: voicePath,
    kind: 'voice',
    contentType: 'audio/m4a',
    fetchImpl: fakeFetch,
    stderr: sink,
  });
  if (up.exitCode !== EXIT.OK || !up.result) {
    throw new Error('failed to seed voice file');
  }
  voiceFileId = up.result.fileId;
}, 180_000);

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  await fx?.stop();
}, 60_000);

describe('voice transcribe', () => {
  it('returns the recorded transcript with the default fixture', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await voiceTranscribe({
      client: makeClient(token),
      fileId: voiceFileId,
      json: true,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const body = JSON.parse(stdout.text);
    expect(typeof body.transcript).toBe('string');
    expect(body.transcript.length).toBeGreaterThan(0);
  });

  it('passes through an Idempotency-Key header', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await voiceTranscribe({
      client: makeClient(token),
      fileId: voiceFileId,
      idempotencyKey: 'cli-voice-once',
      json: true,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
  });

  it('404 on unknown fileId', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await voiceTranscribe({
      client: makeClient(token),
      fileId: '00000000-0000-0000-0000-000000000000',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.NOT_FOUND);
  });

  it('requires auth', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await voiceTranscribe({
      client: makeClient(),
      fileId: voiceFileId,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.AUTH);
  });
});

describe('voice summarize', () => {
  it('returns a summary with the default fixture', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await voiceSummarize({
      client: makeClient(token),
      transcript: 'Site arrival 8:15. Steel delivery complete. Two workers on rebar.',
      json: true,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const body = JSON.parse(stdout.text);
    expect(typeof body.summary).toBe('string');
    expect(body.summary.length).toBeGreaterThan(0);
  });

  it('rejects empty transcript (400 → VALIDATION)', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const exit = await voiceSummarize({
      client: makeClient(token),
      transcript: '',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.VALIDATION);
  });
});
