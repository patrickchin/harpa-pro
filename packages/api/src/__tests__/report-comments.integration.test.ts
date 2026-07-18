/**
 * Integration coverage for finalized-report review comments.
 *
 * The route must use the normal auth + scoped DB path: owners, editors, and
 * viewers in the project can review a finalized report, while a non-member
 * sees the same 404 as a missing report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import { createApp } from '../app.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import {
  makeProjectId,
  makeReportId,
  makeSessionId,
  makeUserId,
} from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let carol: string;
let aliceSid: string;
let bobSid: string;
let carolSid: string;
let projectId: string;
let reportId: string;
let draftReportId: string;

const finalizedNumber = 1;
const draftNumber = 2;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  carol = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  carolSid = makeSessionId();
  projectId = makeProjectId();
  reportId = makeReportId();
  draftReportId = makeReportId();

  await seedAuthUsers(fx.url, [
    { id: alice, displayName: 'Alice Owner' },
    { id: bob, displayName: 'Bob Viewer' },
    { id: carol, displayName: 'Carol Outsider' },
  ]);

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id)
     VALUES ($1, 'Review project', $2)`,
    [projectId, alice],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role)
     VALUES ($1, $2, 'owner'), ($1, $3, 'viewer')`,
    [projectId, alice, bob],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number, status,
                             finalized_at)
     VALUES ($1, $2, $3, $4, 'finalized', now()),
            ($5, $2, $3, $6, 'draft', NULL)`,
    [reportId, projectId, alice, finalizedNumber, draftReportId, draftNumber],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (token: string) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
});

const commentsPath = (number: number) =>
  `/projects/${projectId}/reports/${number}/comments`;

async function reportTimestamps() {
  const client = new pg.Client({ connectionString: fx.url });
  await client.connect();
  try {
    const result = await client.query<{
      updated_at: Date;
      notes_changed_at: Date | null;
    }>(
      `SELECT updated_at, notes_changed_at
         FROM app.reports
        WHERE id = $1`,
      [reportId],
    );
    return result.rows[0]!;
  } finally {
    await client.end();
  }
}

describe('finalized report comments', () => {
  it('lets an owner and viewer add comments and read them oldest first', async () => {
    const app = createApp();
    const aliceToken = await signTestToken(alice, aliceSid);
    const bobToken = await signTestToken(bob, bobSid);
    const before = await reportTimestamps();

    const first = await app.request(commentsPath(finalizedNumber), {
      method: 'POST',
      headers: headers(aliceToken),
      body: JSON.stringify({ body: '  Please verify the delivery count.  ' }),
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as {
      id: string;
      reportId: string;
      authorId: string;
      authorDisplayName: string;
      body: string;
      createdAt: string;
    };
    expect(firstBody).toMatchObject({
      reportId,
      authorId: alice,
      authorDisplayName: 'Alice Owner',
      body: 'Please verify the delivery count.',
    });
    expect(firstBody.id).toMatch(/^rcm_[0-9a-hjkmnp-tv-z]{10}$/);
    expect(new Date(firstBody.createdAt).toISOString()).toBe(firstBody.createdAt);

    const second = await app.request(commentsPath(finalizedNumber), {
      method: 'POST',
      headers: headers(bobToken),
      body: JSON.stringify({ body: 'Count checked. It is correct.' }),
    });
    expect(second.status).toBe(201);

    const list = await app.request(commentsPath(finalizedNumber), {
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      items: Array<{ id: string; authorDisplayName: string; body: string }>;
    };
    expect(listBody.items.map((comment) => comment.body)).toEqual([
      'Please verify the delivery count.',
      'Count checked. It is correct.',
    ]);
    expect(listBody.items.map((comment) => comment.authorDisplayName)).toEqual([
      'Alice Owner',
      'Bob Viewer',
    ]);

    const after = await reportTimestamps();
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
    expect(after.notes_changed_at).toBeNull();
  });

  it('rejects empty and over-limit comment bodies', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);

    const empty = await app.request(commentsPath(finalizedNumber), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ body: '   ' }),
    });
    expect(empty.status).toBe(400);

    const tooLong = await app.request(commentsPath(finalizedNumber), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ body: 'x'.repeat(2_001) }),
    });
    expect(tooLong.status).toBe(400);
  });

  it('returns 409 for review access while a report is still a draft', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);

    const get = await app.request(commentsPath(draftNumber), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.status).toBe(409);

    const post = await app.request(commentsPath(draftNumber), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ body: 'Not published yet.' }),
    });
    expect(post.status).toBe(409);
  });

  it('RLS-hides comments from a non-member on both read and write', async () => {
    const app = createApp();
    const token = await signTestToken(carol, carolSid);

    const get = await app.request(commentsPath(finalizedNumber), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.status).toBe(404);

    const post = await app.request(commentsPath(finalizedNumber), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ body: 'I should not be able to post.' }),
    });
    expect(post.status).toBe(404);
  });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await app.request(commentsPath(finalizedNumber));
    expect(res.status).toBe(401);
  });
});

