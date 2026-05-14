/**
 * CLI.6 — `harpa reports` (CRUD) integration tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { createApiClient } from '../lib/client.js';
import { authOtpStart, authOtpVerify } from '../commands/auth.js';
import { projectsCreate } from '../commands/projects.js';
import {
  reportsList,
  reportsCreate,
  reportsGet,
  reportsUpdate,
  reportsDelete,
} from '../commands/reports.js';
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
  await resetPool();
  getPool(fx.url);
  app = createApp();

  const sink = new MemoryStream();
  await authOtpStart({ client: makeClient(), phone: '+15551000020', stdout: sink, stderr: sink });
  const out = new MemoryStream();
  await authOtpVerify({
    client: makeClient(),
    phone: '+15551000020',
    code: '000000',
    raw: true,
    stdout: out,
    stderr: sink,
  });
  token = out.text.trim();

  const projOut = new MemoryStream();
  await projectsCreate({
    client: makeClient(token),
    name: 'Reports Test Project',
    json: true,
    stdout: projOut,
    stderr: sink,
  });
  projectId = JSON.parse(projOut.text).id;
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

describe('harpa reports (CRUD)', () => {
  it('full CRUD: list → create → get → update → delete', async () => {
    const client = makeClient(token);

    // 1. Empty list (or populated — only assert success).
    let exit = await reportsList({ client, projectId, stdout, stderr });
    expect(exit).toBe(EXIT.OK);

    // 2. Create.
    const createOut = new MemoryStream();
    exit = await reportsCreate({
      client,
      projectId,
      visitDate: '2025-01-15',
      json: true,
      stdout: createOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const created = JSON.parse(createOut.text);
    expect(created.projectId).toBe(projectId);
    expect(created.status).toBe('draft');
    const reportId: string = created.id;

    // 3. Get.
    const getOut = new MemoryStream();
    exit = await reportsGet({ client, reportId, json: true, stdout: getOut, stderr });
    expect(exit).toBe(EXIT.OK);
    expect(JSON.parse(getOut.text).id).toBe(reportId);

    // 4. Update.
    const updateOut = new MemoryStream();
    exit = await reportsUpdate({
      client,
      reportId,
      visitDate: '2025-01-16',
      json: true,
      stdout: updateOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const updated = JSON.parse(updateOut.text);
    expect(updated.visitDate).toMatch(/^2025-01-16/);

    // 5. List shows it.
    const listOut = new MemoryStream();
    exit = await reportsList({ client, projectId, json: true, stdout: listOut, stderr });
    expect(exit).toBe(EXIT.OK);
    const page = JSON.parse(listOut.text);
    expect(page.items.some((r: { id: string }) => r.id === reportId)).toBe(true);

    // 6. Pagination flag plumbed.
    const limitedOut = new MemoryStream();
    exit = await reportsList({
      client,
      projectId,
      limit: 1,
      json: true,
      stdout: limitedOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    expect(JSON.parse(limitedOut.text).items.length).toBeLessThanOrEqual(1);

    // 7. Delete (204).
    const deleteOut = new MemoryStream();
    exit = await reportsDelete({ client, reportId, stdout: deleteOut, stderr });
    expect(exit).toBe(EXIT.OK);
    expect(deleteOut.text).toMatch(/Deleted report/);

    // 8. 404 after delete.
    exit = await reportsGet({ client, reportId, stdout, stderr });
    expect(exit).toBe(EXIT.NOT_FOUND);
  });

  it('rejects unauthenticated list', async () => {
    const exit = await reportsList({ client: makeClient(), projectId, stdout, stderr });
    expect(exit).toBe(EXIT.AUTH);
  });

  it('returns 404 for non-existent report id', async () => {
    const exit = await reportsGet({
      client: makeClient(token),
      reportId: '00000000-0000-0000-0000-000000000999',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.NOT_FOUND);
  });
});
