/**
 * CLI.5 — `harpa projects members` integration tests.
 *
 * Default-wiring (Pitfall 13): commands go through the real `createApiClient`
 * + `app.fetch`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import pg from 'pg';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { signTestSession } from '../../../../packages/api/src/middleware/auth.js';
import { makeUserId } from '../../../../packages/api/src/__tests__/factories/index.js';
import { createApiClient } from '../lib/client.js';
import { projectsCreate } from '../commands/projects.js';
import { membersList, membersAdd, membersRemove } from '../commands/members.js';
import { EXIT } from '../lib/error.js';
import type { CliEnv } from '../lib/env.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;
let ownerToken: string;
let memberToken: string;
let memberUserId: string;
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

  const ownerId = makeUserId();
  memberUserId = makeUserId();
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO "user"(id, name, email, email_verified, display_name, created_at, updated_at) VALUES ($1, 'Owner', $2, true, 'Owner', now(), now()), ($3, 'Member', $4, true, 'Member', now(), now())`,
    [ownerId, 'owner@example.com', memberUserId, 'member@example.com'],
  );
  await admin.end();

  app = createApp();
  ({ token: ownerToken } = await signTestSession(ownerId));
  ({ token: memberToken } = await signTestSession(memberUserId));

  // Create a project owned by ownerToken.
  const out = new MemoryStream();
  const exit = await projectsCreate({
    client: makeClient(ownerToken),
    name: 'Members Test Project',
    json: true,
    stdout: out,
    stderr: new MemoryStream(),
  });
  expect(exit).toBe(EXIT.OK);
  projectId = JSON.parse(out.text).id;
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

describe('harpa projects members', () => {
  it('list returns owner-only on a fresh project', async () => {
    const out = new MemoryStream();
    const exit = await membersList({
      client: makeClient(ownerToken),
      projectId,
      json: true,
      stdout: out,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const page = JSON.parse(out.text);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].role).toBe('owner');
  });

  it('add then list shows the new member; remove takes them away', async () => {
    const addOut = new MemoryStream();
    let exit = await membersAdd({
      client: makeClient(ownerToken),
      projectId,
      email: 'member@example.com',
      role: 'editor',
      json: true,
      stdout: addOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const added = JSON.parse(addOut.text);
    expect(added.userId).toBe(memberUserId);
    expect(added.role).toBe('editor');

    const listOut = new MemoryStream();
    exit = await membersList({
      client: makeClient(ownerToken),
      projectId,
      json: true,
      stdout: listOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    const page = JSON.parse(listOut.text);
    expect(page.items.some((m: { userId: string }) => m.userId === memberUserId)).toBe(true);

    // Member can list members of the project they belong to.
    const memberListOut = new MemoryStream();
    exit = await membersList({
      client: makeClient(memberToken),
      projectId,
      json: true,
      stdout: memberListOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);

    // Remove (204).
    const removeOut = new MemoryStream();
    exit = await membersRemove({
      client: makeClient(ownerToken),
      projectId,
      email: 'member@example.com',
      stdout: removeOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    expect(removeOut.text).toMatch(/Removed/);

    // After removal the member can no longer list.
    exit = await membersList({
      client: makeClient(memberToken),
      projectId,
      stdout,
      stderr,
    });
    expect([EXIT.AUTH, EXIT.NOT_FOUND]).toContain(exit);
  });

  it('non-owner cannot add a member (403 or 404)', async () => {
    // Re-add the member first so they're inside the project as editor.
    await membersAdd({
      client: makeClient(ownerToken),
      projectId,
      email: 'member@example.com',
      role: 'editor',
      stdout: new MemoryStream(),
      stderr: new MemoryStream(),
    });

    const exit = await membersAdd({
      client: makeClient(memberToken),
      projectId,
      email: 'other@example.com',
      role: 'editor',
      stdout,
      stderr,
    });
    expect([EXIT.AUTH, EXIT.NOT_FOUND]).toContain(exit);
  });

  it('rejects invalid role at the API layer', async () => {
    const exit = await membersAdd({
      client: makeClient(ownerToken),
      projectId,
      email: 'another@example.com',
      // @ts-expect-error - intentionally invalid for runtime test
      role: 'admin',
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.VALIDATION);
  });

  it('rejects unauthenticated list', async () => {
    const exit = await membersList({
      client: makeClient(),
      projectId,
      stdout,
      stderr,
    });
    expect(exit).toBe(EXIT.AUTH);
  });
});
