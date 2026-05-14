/**
 * CLI.7 — `harpa reports {generate, regenerate, finalize, pdf}` integration tests.
 *
 * Runs against in-process API with default AI fixture replay + R2 fixture
 * replay. No `AI_LIVE` env, no live calls — pure default-wiring exercise
 * (Pitfall 13).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { createApiClient } from '../lib/client.js';
import { authOtpStart, authOtpVerify } from '../commands/auth.js';
import { projectsCreate } from '../commands/projects.js';
import { reportsCreate } from '../commands/reports.js';
import {
  reportsGenerate,
  reportsRegenerate,
  reportsFinalize,
  reportsPdf,
} from '../commands/reports-ai.js';
import { EXIT } from '../lib/error.js';
import type { CliEnv } from '../lib/env.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

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
  process.env.R2_FIXTURE_MODE = 'replay';
  delete process.env.AI_LIVE;
  await resetPool();
  getPool(fx.url);
  app = createApp();

  const sink = new MemoryStream();
  await authOtpStart({ client: makeClient(), phone: '+15551000030', stdout: sink, stderr: sink });
  const out = new MemoryStream();
  await authOtpVerify({
    client: makeClient(),
    phone: '+15551000030',
    code: '000000',
    raw: true,
    stdout: out,
    stderr: sink,
  });
  token = out.text.trim();

  const projOut = new MemoryStream();
  await projectsCreate({
    client: makeClient(token),
    name: 'Reports AI Test Project',
    json: true,
    stdout: projOut,
    stderr: sink,
  });
  projectId = JSON.parse(projOut.text).id;
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

async function createDraft(): Promise<string> {
  const out = new MemoryStream();
  await reportsCreate({
    client: makeClient(token),
    projectId,
    visitDate: '2026-05-12T08:00:00.000Z',
    json: true,
    stdout: out,
    stderr: new MemoryStream(),
  });
  return JSON.parse(out.text).id;
}

let stdout: MemoryStream;
let stderr: MemoryStream;

beforeEach(() => {
  stdout = new MemoryStream();
  stderr = new MemoryStream();
});

describe('harpa reports AI commands', () => {
  it('generate → pdf → finalize lifecycle', async () => {
    const client = makeClient(token);
    const reportId = await createDraft();

    // generate (default fixture).
    const genOut = new MemoryStream();
    let exit = await reportsGenerate({ client, reportId, json: true, stdout: genOut, stderr });
    expect(exit).toBe(EXIT.OK);
    const generated = JSON.parse(genOut.text);
    expect(generated.report.status).toBe('draft');
    expect(generated.report.body).toBeTruthy();

    // pdf.
    const pdfOut = new MemoryStream();
    exit = await reportsPdf({ client, reportId, json: true, stdout: pdfOut, stderr });
    expect(exit).toBe(EXIT.OK);
    const pdf = JSON.parse(pdfOut.text);
    expect(pdf.url).toContain('.pdf');
    expect(new Date(pdf.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // finalize.
    const finOut = new MemoryStream();
    exit = await reportsFinalize({ client, reportId, json: true, stdout: finOut, stderr });
    expect(exit).toBe(EXIT.OK);
    expect(JSON.parse(finOut.text).report.status).toBe('finalized');

    // regenerate 409 after finalize.
    exit = await reportsRegenerate({ client, reportId, stdout, stderr });
    expect(exit).toBe(EXIT.GENERIC); // 409 maps to GENERIC (no specific code)
  });

  it('regenerate with --fixture replaces body', async () => {
    const client = makeClient(token);
    const reportId = await createDraft();

    // generate first so a body exists.
    await reportsGenerate({
      client,
      reportId,
      stdout: new MemoryStream(),
      stderr: new MemoryStream(),
    });

    const out = new MemoryStream();
    const exit = await reportsRegenerate({
      client,
      reportId,
      fixtureName: 'generate-report.incomplete',
      json: true,
      stdout: out,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const regen = JSON.parse(out.text);
    expect(regen.report.body.workers).toEqual([]);
  });

  it('finalize on empty draft returns 409 (conflict → GENERIC exit)', async () => {
    const client = makeClient(token);
    const reportId = await createDraft();

    const exit = await reportsFinalize({ client, reportId, stdout, stderr });
    expect(exit).toBe(EXIT.GENERIC);
  });

  it('idempotency-key header is plumbed through generate', async () => {
    const client = makeClient(token);
    const reportId = await createDraft();
    const key = '11111111-2222-3333-4444-555555555555';

    const firstOut = new MemoryStream();
    let exit = await reportsGenerate({
      client,
      reportId,
      idempotencyKey: key,
      json: true,
      stdout: firstOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);

    // Replay with the same key returns the same response.
    const secondOut = new MemoryStream();
    exit = await reportsGenerate({
      client,
      reportId,
      idempotencyKey: key,
      json: true,
      stdout: secondOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    expect(JSON.parse(secondOut.text).report.id).toBe(JSON.parse(firstOut.text).report.id);
  });

  it('rejects unauthenticated generate', async () => {
    const exit = await reportsGenerate({
      client: makeClient(),
      reportId: '00000000-0000-0000-0000-000000000999',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.AUTH);
  });
});
