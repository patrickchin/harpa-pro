/**
 * CLI.5 — `harpa projects members` integration tests.
 *
 * Default-wiring (Pitfall 13): commands go through the real `createApiClient`
 * + `app.fetch`. better-auth bearer tokens are opaque, so we resolve member
 * userIds via `/me` instead of decoding the JWT (which they aren't).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { createApp } from '../../../../packages/api/src/app.js';
import { startPg, type PgFixture } from '../../../../packages/api/src/__tests__/setup-pg.js';
import { resetPool, getPool } from '../../../../packages/api/src/db/client.js';
import { createApiClient } from '../lib/client.js';
import { authOtpStart, authOtpVerify } from '../commands/auth.js';
import { projectsCreate } from '../commands/projects.js';
import { membersList, membersAdd, membersRemove } from '../commands/members.js';
import { EXIT } from '../lib/error.js';
import type { CliEnv } from '../lib/env.js';
import { readLatestOtp } from './_helpers.js';

let fx: PgFixture;
let app: ReturnType<typeof createApp>;
let ownerToken: string;
let memberToken: string;
let memberUserId: string;
let projectId: string;

const OWNER_EMAIL = 'cli-tests-owner@dev.harpa.test';
const MEMBER_EMAIL = 'cli-tests-member@dev.harpa.test';
const OUTSIDER_EMAIL = 'cli-tests-outsider@dev.harpa.test';

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

async function signIn(email: string): Promise<string> {
  const sink = new MemoryStream();
  await authOtpStart({
    apiUrl: 'http://localhost',
    fetch: appFetch,
    email,
    stdout: sink,
    stderr: sink,
  });
  const code = await readLatestOtp(email);
  const out = new MemoryStream();
  await authOtpVerify({
    apiUrl: 'http://localhost',
    fetch: appFetch,
    email,
    code,
    raw: true,
    stdout: out,
    stderr: sink,
  });
  return out.text.trim();
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  app = createApp();

  ownerToken = await signIn(OWNER_EMAIL);
  memberToken = await signIn(MEMBER_EMAIL);

  // Resolve member's userId via /me (better-auth bearer is opaque, not a JWT).
  const meRes = await makeClient(memberToken).GET('/me');
  if (!meRes.data) throw new Error(`failed to load /me for member: ${meRes.response.status}`);
  memberUserId = meRes.data.user.id;

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
      email: MEMBER_EMAIL,
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

    const memberListOut = new MemoryStream();
    exit = await membersList({
      client: makeClient(memberToken),
      projectId,
      json: true,
      stdout: memberListOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);

    const removeOut = new MemoryStream();
    exit = await membersRemove({
      client: makeClient(ownerToken),
      projectId,
      email: MEMBER_EMAIL,
      stdout: removeOut,
      stderr,
    });
    expect(exit).toBe(EXIT.OK);
    expect(removeOut.text).toMatch(/Removed/);

    exit = await membersList({
      client: makeClient(memberToken),
      projectId,
      stdout,
      stderr,
    });
    expect([EXIT.AUTH, EXIT.NOT_FOUND]).toContain(exit);
  });

  it('non-owner cannot add a member (403 or 404)', async () => {
    await membersAdd({
      client: makeClient(ownerToken),
      projectId,
      email: MEMBER_EMAIL,
      role: 'editor',
      stdout: new MemoryStream(),
      stderr: new MemoryStream(),
    });

    const exit = await membersAdd({
      client: makeClient(memberToken),
      projectId,
      email: OUTSIDER_EMAIL,
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
      email: OUTSIDER_EMAIL,
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
