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
import { readLatestOtp } from './_helpers.js';
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

const appFetch: typeof fetch = (input, init) => {
  const req = input instanceof Request ? input : new Request(input as string, init);
  return app.fetch(req);
};

function makeClient(t?: string) {
  const env: CliEnv = {
    HARPA_API_URL: 'http://localhost',
    HARPA_DEBUG: '0',
    ...(t ? { HARPA_TOKEN: t } : {}),
  };
  return createApiClient(env, { fetch: appFetch });
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
  await authOtpStart({ apiUrl: 'http://localhost', fetch: appFetch, email: 'cli-tests-reports-ai@dev.harpa.test', stdout: sink, stderr: sink });
  const code = await readLatestOtp('cli-tests-reports-ai@dev.harpa.test');
  const out = new MemoryStream();
  await authOtpVerify({
    apiUrl: 'http://localhost',
    fetch: appFetch,
    email: 'cli-tests-reports-ai@dev.harpa.test',
    code,
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

async function createDraft(): Promise<{ id: string; number: number }> {
  const out = new MemoryStream();
  await reportsCreate({
    client: makeClient(token),
    projectId,
    visitDate: '2026-05-12T08:00:00.000Z',
    json: true,
    stdout: out,
    stderr: new MemoryStream(),
  });
  const r = JSON.parse(out.text);
  return { id: r.id, number: r.number };
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
    const { number } = await createDraft();

    // generate (default fixture).
    const genOut = new MemoryStream();
    let exit = await reportsGenerate({ client, project: projectId, number, json: true, stdout: genOut, stderr });
    expect(exit).toBe(EXIT.OK);
    const generated = JSON.parse(genOut.text);
    expect(generated.report.status).toBe('draft');
    expect(generated.report.body).toBeTruthy();

    // pdf.
    const pdfOut = new MemoryStream();
    exit = await reportsPdf({ client, project: projectId, number, json: true, stdout: pdfOut, stderr });
    expect(exit).toBe(EXIT.OK);
    const pdf = JSON.parse(pdfOut.text);
    expect(pdf.url).toContain('.pdf');
    expect(new Date(pdf.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // finalize.
    const finOut = new MemoryStream();
    exit = await reportsFinalize({ client, project: projectId, number, json: true, stdout: finOut, stderr });
    expect(exit).toBe(EXIT.OK);
    expect(JSON.parse(finOut.text).report.status).toBe('finalized');

    // regenerate 409 after finalize.
    exit = await reportsRegenerate({ client, project: projectId, number, stdout, stderr });
    expect(exit).toBe(EXIT.GENERIC); // 409 maps to GENERIC (no specific code)
  });

  it('regenerate with --fixture replaces body', async () => {
    const client = makeClient(token);
    const { number } = await createDraft();

    // generate first so a body exists.
    await reportsGenerate({
      client,
      project: projectId,
      number,
      stdout: new MemoryStream(),
      stderr: new MemoryStream(),
    });

    const out = new MemoryStream();
    const exit = await reportsRegenerate({
      client,
      project: projectId,
      number,
      fixtureName: 'generate-report.voice-4',
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
    const { number } = await createDraft();

    const exit = await reportsFinalize({ client, project: projectId, number, stdout, stderr });
    expect(exit).toBe(EXIT.GENERIC);
  });

  it('idempotency-key header is plumbed through generate', async () => {
    const client = makeClient(token);
    const { number } = await createDraft();
    const key = '11111111-2222-3333-4444-555555555555';

    const firstOut = new MemoryStream();
    let exit = await reportsGenerate({
      client,
      project: projectId,
      number,
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
      project: projectId,
      number,
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
      project: 'prj_zzzzzzzz',
      number: 999,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.AUTH);
  });
});
