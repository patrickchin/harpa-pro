/**
 * CLI.4 — `harpa projects` integration tests.
 *
 * Default-wiring per Pitfall 13: each command goes through the real
 * `createApiClient` + `app.fetch` (no client stub).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { createApiClient } from '../lib/client.js';
import { authOtpStart, authOtpVerify } from '../commands/auth.js';
import {
  projectsList,
  projectsCreate,
  projectsGet,
  projectsUpdate,
  projectsDelete,
} from '../commands/projects.js';
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

  const phone = '+15551000001';
  const sink = new MemoryStream();
  await authOtpStart({ client: makeClient(), phone, stdout: sink, stderr: sink });
  const verifyOut = new MemoryStream();
  await authOtpVerify({
    client: makeClient(),
    phone,
    code: '000000',
    raw: true,
    stdout: verifyOut,
    stderr: sink,
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

describe('harpa projects (CRUD via default-wired client)', () => {
  it('full CRUD lifecycle: list → create → get → update → delete', async () => {
    const client = makeClient(token);

    // 1. Empty list to start.
    let exit = await projectsList({ client, stdout, stderr });
    expect(exit).toBe(EXIT.OK);
    // Either "No projects" or a populated list — both pass; we only assert success.

    // 2. Create.
    const createOut = new MemoryStream();
    exit = await projectsCreate({
      client,
      name: 'CLI Test Project',
      clientName: 'CLI Test Client',
      address: '123 CLI Way',
      stdout: createOut,
      stderr,
      json: true,
    });
    expect(exit).toBe(EXIT.OK);
    const created = JSON.parse(createOut.text);
    expect(created.name).toBe('CLI Test Project');
    expect(created.clientName).toBe('CLI Test Client');
    expect(created.myRole).toBe('owner');
    const projectId: string = created.id;

    // 3. Get it back.
    const getOut = new MemoryStream();
    exit = await projectsGet({ client, id: projectId, json: true, stdout: getOut, stderr });
    expect(exit).toBe(EXIT.OK);
    const got = JSON.parse(getOut.text);
    expect(got.id).toBe(projectId);
    expect(got.address).toBe('123 CLI Way');

    // 4. Update.
    const updateOut = new MemoryStream();
    exit = await projectsUpdate({
      client,
      id: projectId,
      name: 'Renamed CLI Project',
      stdout: updateOut,
      stderr,
      json: true,
    });
    expect(exit).toBe(EXIT.OK);
    const updated = JSON.parse(updateOut.text);
    expect(updated.name).toBe('Renamed CLI Project');

    // 5. List now shows it.
    const listOut = new MemoryStream();
    exit = await projectsList({ client, json: true, stdout: listOut, stderr });
    expect(exit).toBe(EXIT.OK);
    const page = JSON.parse(listOut.text);
    expect(page.items.some((p: { id: string }) => p.id === projectId)).toBe(true);

    // 6. Pagination cursor flag is plumbed through.
    const limitedOut = new MemoryStream();
    exit = await projectsList({ client, limit: 1, json: true, stdout: limitedOut, stderr });
    expect(exit).toBe(EXIT.OK);
    const limited = JSON.parse(limitedOut.text);
    expect(limited.items.length).toBeLessThanOrEqual(1);

    // 7. Delete (204 — empty body handled correctly).
    const deleteOut = new MemoryStream();
    exit = await projectsDelete({ client, id: projectId, stdout: deleteOut, stderr });
    expect(exit).toBe(EXIT.OK);
    expect(deleteOut.text).toMatch(/Deleted project/);

    // 8. Subsequent get returns 404.
    exit = await projectsGet({ client, id: projectId, stdout, stderr });
    expect(exit).toBe(EXIT.NOT_FOUND);
    expect(stderr.text).toMatch(/Error: 404/);
  });

  it('rejects unauthenticated list', async () => {
    const exit = await projectsList({ client: makeClient(), stdout, stderr });
    expect(exit).toBe(EXIT.AUTH);
  });

  it('rejects create with empty name (validation)', async () => {
    const exit = await projectsCreate({
      client: makeClient(token),
      name: '',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.VALIDATION);
    expect(stderr.text).toMatch(/Error: 400/);
  });

  it('returns 404 for a non-existent project id', async () => {
    const exit = await projectsGet({
      client: makeClient(token),
      id: '00000000-0000-0000-0000-000000000999',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.NOT_FOUND);
  });
});
