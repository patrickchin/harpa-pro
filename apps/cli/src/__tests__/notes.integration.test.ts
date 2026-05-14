/**
 * CLI.8 — `harpa notes` integration tests.
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
import { notesList, notesCreate, notesUpdate, notesDelete } from '../commands/notes.js';
import { EXIT } from '../lib/error.js';
import type { CliEnv } from '../lib/env.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;
let token: string;
let reportId: string;

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
  await authOtpStart({ client: makeClient(), phone: '+15551000040', stdout: sink, stderr: sink });
  const out = new MemoryStream();
  await authOtpVerify({
    client: makeClient(),
    phone: '+15551000040',
    code: '000000',
    raw: true,
    stdout: out,
    stderr: sink,
  });
  token = out.text.trim();

  const projOut = new MemoryStream();
  await projectsCreate({
    client: makeClient(token),
    name: 'Notes Test Project',
    json: true,
    stdout: projOut,
    stderr: sink,
  });
  const projectId: string = JSON.parse(projOut.text).id;

  const reportOut = new MemoryStream();
  await reportsCreate({
    client: makeClient(token),
    projectId,
    json: true,
    stdout: reportOut,
    stderr: sink,
  });
  reportId = JSON.parse(reportOut.text).id;
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

describe('harpa notes', () => {
  it('full CRUD: list → create → list → update → delete', async () => {
    const client = makeClient(token);

    // 1. List (empty).
    let exit = await notesList({ client, reportId, json: true, stdout, stderr });
    expect(exit).toBe(EXIT.OK);

    // 2. Create text note.
    const createOut = new MemoryStream();
    exit = await notesCreate({
      client,
      reportId,
      kind: 'text',
      body: 'first note',
      json: true,
      stdout: createOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const note = JSON.parse(createOut.text);
    expect(note.kind).toBe('text');
    expect(note.body).toBe('first note');
    const noteId: string = note.id;

    // 3. List now includes it.
    const listOut = new MemoryStream();
    exit = await notesList({ client, reportId, json: true, stdout: listOut, stderr });
    expect(exit).toBe(EXIT.OK);
    expect(
      JSON.parse(listOut.text).items.some((n: { id: string }) => n.id === noteId),
    ).toBe(true);

    // 4. Update.
    const updateOut = new MemoryStream();
    exit = await notesUpdate({
      client,
      noteId,
      body: 'edited note',
      json: true,
      stdout: updateOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    expect(JSON.parse(updateOut.text).body).toBe('edited note');

    // 5. Delete (204).
    const deleteOut = new MemoryStream();
    exit = await notesDelete({ client, noteId, stdout: deleteOut, stderr });
    expect(exit).toBe(EXIT.OK);
    expect(deleteOut.text).toMatch(/Deleted note/);
  });

  it('rejects create with invalid kind (validation)', async () => {
    const exit = await notesCreate({
      client: makeClient(token),
      reportId,
      // @ts-expect-error - intentionally invalid for runtime test
      kind: 'video',
      body: 'x',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.VALIDATION);
  });

  it('rejects unauthenticated list', async () => {
    const exit = await notesList({ client: makeClient(), reportId, stdout, stderr });
    expect(exit).toBe(EXIT.AUTH);
  });
});
