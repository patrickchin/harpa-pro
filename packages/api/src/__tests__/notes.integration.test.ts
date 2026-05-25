/**
 * Integration tests for /reports/:reportId/notes + /notes/:noteId.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeUserId, makeSessionId, makeProjectId, makeReportId, makeFileId } from './factories/index.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let aliceSid: string;
let bobSid: string;
let report: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);
  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone) VALUES ($1, $2), ($3, $4)`,
    [alice, '+15550800001', bob, '+15550800002'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days'), ($3, $4, now() + interval '7 days')`,
    [aliceSid, alice, bobSid, bob],
  );
  const projId = makeProjectId();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'NotesProj', $2)`,
    [projId, alice],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [projId, alice],
  );
  report = makeReportId();
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number) VALUES ($1, $2, $3, 1)`,
    [report, projId, alice],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

describe('notes CRUD', () => {
  let noteId: string;

  it('POST creates a text note and bumps notes_since_last_generation', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const before = await getPool().connect();
    let beforeCount = 0;
    try {
      const r = await before.query<{ n: number }>(
        `SELECT notes_since_last_generation AS n FROM app.reports WHERE id = $1`,
        [report],
      );
      beforeCount = Number(r.rows[0]?.n ?? 0);
    } finally {
      before.release();
    }
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'text', body: 'first observation' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; kind: string; body: string; authorId: string };
    expect(body.kind).toBe('text');
    expect(body.body).toBe('first observation');
    expect(body.authorId).toBe(alice);
    noteId = body.id;

    const after = await getPool().connect();
    try {
      const r = await after.query<{ n: number }>(
        `SELECT notes_since_last_generation AS n FROM app.reports WHERE id = $1`,
        [report],
      );
      expect(Number(r.rows[0]?.n)).toBe(beforeCount + 1);
    } finally {
      after.release();
    }
  });

  it('POST 404 when caller cannot see the report', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'text', body: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST 401 without auth', async () => {
    const app = createApp();
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'text', body: 'x' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST 400 on invalid kind', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET timeline list returns notes ascending', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Add a second note so we can verify ordering.
    await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'text', body: 'second' }),
    });
    const res = await app.request(`/reports/${report}/notes`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ body: string | null }> };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items[0]!.body).toBe('first observation');
  });

  it('PATCH updates body for the author', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/notes/${noteId}`, {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ body: 'updated text' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { body: string }).body).toBe('updated text');
  });

  it('DELETE returns 204 then list no longer contains it', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const del = await app.request(`/notes/${noteId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(del.status).toBe(204);
    const list = await app.request(`/reports/${report}/notes`, { headers: { authorization: `Bearer ${tok}` } });
    const body = (await list.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((n) => n.id === noteId)).toBeFalsy();
  });
});

describe('batch photo notes', () => {
  // Dummy file IDs inserted into app.files to satisfy FK constraints.
  const fileIds: string[] = [];

  beforeAll(async () => {
    const client = new pg.Client({ connectionString: fx.url });
    await client.connect();
    for (let i = 0; i < 5; i++) {
      const fid = makeFileId();
      fileIds.push(fid);
      await client.query(
        `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
         VALUES ($1, $2, 'image', $3, 1024, 'image/jpeg')`,
        [fid, alice, `test-key-${fid}`],
      );
    }
    await client.end();
  });

  it('create note with files[] populates note_files join table', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        files: [{ fileId: fileIds[0], thumbnailFileId: null }],
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { files: Array<{ id: string; fileId: string; position: number }> };
    expect(body.files).toHaveLength(1);
    expect(body.files[0]!.id).toMatch(/^nfl_/);
    expect(body.files[0]!.fileId).toBe(fileIds[0]);
  });

  it('create note with multiple files', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        files: [
          { fileId: fileIds[0] },
          { fileId: fileIds[1] },
          { fileId: fileIds[2] },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { files: Array<{ id: string; position: number }> };
    expect(body.files).toHaveLength(3);
    expect(body.files.map((f) => f.position)).toEqual([0, 1, 2]);
  });

  it('append files to existing note', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Create a note with 1 file first.
    const create = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        files: [{ fileId: fileIds[0] }],
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; files: Array<{ position: number }> };
    expect(created.files).toHaveLength(1);

    // Append a new file.
    const append = await app.request(`/notes/${created.id}/files`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ files: [{ fileId: fileIds[3] }] }),
    });
    expect(append.status).toBe(200);
    const appended = (await append.json()) as { files: Array<{ id: string; position: number; fileId: string }> };
    expect(appended.files).toHaveLength(1);
    expect(appended.files[0]!.position).toBe(1);
    expect(appended.files[0]!.fileId).toBe(fileIds[3]);
  });

  it('list notes returns files array', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Create a note with 2 files.
    const create = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        files: [{ fileId: fileIds[1] }, { fileId: fileIds[4] }],
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string };

    // List notes and find the one we just created.
    const list = await app.request(`/reports/${report}/notes`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { items: Array<{ id: string; files: Array<{ fileId: string }> }> };
    const note = body.items.find((n) => n.id === created.id);
    expect(note).toBeDefined();
    expect(note!.files).toHaveLength(2);
  });

  it('back-compat: image note with fileId only routes into note_files', async () => {
    // Mobile client's first-photo path sends `kind: 'image', fileId, thumbnailFileId`
    // without an explicit `files[]`. The service should funnel it into
    // `note_files` so listNotes' join surfaces every photo of a batch
    // (the first image was previously invisible to the join).
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const create = await app.request(`/reports/${report}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        fileId: fileIds[2],
        thumbnailFileId: null,
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      id: string;
      fileId: string | null;
      files: Array<{ fileId: string; position: number }>;
    };
    expect(created.files).toHaveLength(1);
    expect(created.files[0]!.fileId).toBe(fileIds[2]);
    expect(created.files[0]!.position).toBe(0);
    // Legacy column cleared: note_files is canonical for image rows.
    expect(created.fileId).toBeNull();

    const list = await app.request(`/reports/${report}/notes`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    const body = (await list.json()) as { items: Array<{ id: string; files: Array<{ fileId: string }> }> };
    const note = body.items.find((n) => n.id === created.id);
    expect(note!.files).toHaveLength(1);
    expect(note!.files[0]!.fileId).toBe(fileIds[2]);
  });
});
