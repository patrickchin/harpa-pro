/**
 * Integration tests for /projects/:projectSlug/reports + .../reports/:number.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { pruneExpiredFileUploadLeases } from '../services/storage-delete-jobs.js';
import { FixtureStorage } from '../services/storage.js';
import { makeUserId, makeSessionId, makeProjectId, makeFileId } from './factories/index.js';

let fx: PgFixture;
let alice: string;
let bob: string;
let aliceSid: string;
let bobSid: string;
let aliceProj: string;
let bobProj: string;
let aliceProjSlug: string;
let bobProjSlug: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  delete process.env.AI_LIVE;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  aliceProj = makeProjectId();
  bobProj = makeProjectId();
  aliceProjSlug = aliceProj;
  bobProjSlug = bobProj;

  await seedAuthUsers(fx.url, [{ id: alice }, { id: bob }]);
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'A', $2)`,
    [aliceProj, alice],
  );
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'B', $2)`,
    [bobProj, bob],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [aliceProj, alice, bobProj, bob],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

interface ReportSnapshot {
  id: string;
  number: number;
  status: 'draft' | 'finalized';
  visitDate: string | null;
  body: { meta: { title: string | null } } | null;
  finalizedAt: string | null;
  updatedAt: string;
}

async function seedOwnedProject(projectId: string, ownerId: string) {
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO app.projects(id, name, owner_id)
       VALUES ($1, 'Phase 0 test project', $2)`,
      [projectId, ownerId],
    );
    await admin.query(
      `INSERT INTO app.project_members(project_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [projectId, ownerId],
    );
  } finally {
    await admin.end();
  }
}

async function createReportSnapshot(
  projectSlug: string,
  token: string,
  input: Record<string, unknown> = {},
): Promise<ReportSnapshot> {
  const res = await createApp().request(`/projects/${projectSlug}/reports`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(input),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as ReportSnapshot;
}

async function getReportSnapshot(
  projectSlug: string,
  reportNumberValue: number,
  token: string,
): Promise<ReportSnapshot> {
  const res = await createApp().request(`/projects/${projectSlug}/reports/${reportNumberValue}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as ReportSnapshot;
}

async function patchReportSnapshot(
  projectSlug: string,
  reportNumberValue: number,
  token: string,
  patch: Record<string, unknown>,
): Promise<ReportSnapshot> {
  const res = await createApp().request(`/projects/${projectSlug}/reports/${reportNumberValue}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(patch),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as ReportSnapshot;
}

function reportBodyWithTitle(title: string) {
  return {
    ...placementBody,
    meta: { ...placementBody.meta, title },
  };
}

function staleVersionOf(updatedAt: string) {
  return new Date(new Date(updatedAt).getTime() - 1_000).toISOString();
}

async function readConflictReport(res: Response, current: ReportSnapshot): Promise<ReportSnapshot> {
  expect(res.status).toBe(409);
  const body = (await res.json()) as { report: ReportSnapshot };
  expect(body.report).toMatchObject({
    id: current.id,
    number: current.number,
    status: current.status,
    updatedAt: current.updatedAt,
  });
  return body.report;
}

async function readDirty(reportId: string) {
  const c = await getPool().connect();
  try {
    const r = await c.query<{ changed_at: Date | null; generated_at: Date | null }>(
      `SELECT notes_changed_at AS changed_at, generated_at FROM app.reports WHERE id = $1`,
      [reportId],
    );
    return r.rows[0] ?? { changed_at: null, generated_at: null };
  } finally {
    c.release();
  }
}

const placementBody = {
  meta: { title: 'Placement report', summary: 'Placement test.', visitDate: null },
  weather: null,
  workers: [],
  materials: [],
  issues: [
    {
      title: 'Ceiling leak',
      severity: 'high',
      description: 'Water ingress above lobby.',
      action: 'Open ceiling bay.',
    },
  ],
  nextSteps: [],
  summarySections: [
    { title: 'Lobby', body: 'Lobby inspected.' },
    { title: 'Roof', body: 'Roof inspected.' },
  ],
};

describe('reports CRUD', () => {
  let aliceReport: string;
  let aliceReportNumber: number;

  it('POST creates a draft report under alice project', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: '2026-05-12T08:00:00.000Z' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      number: number;
      status: string;
      projectId: string;
    };
    expect(body.status).toBe('draft');
    expect(body.projectId).toBe(aliceProj);
    // P3.0 Commit 2: response carries `rpt_` slug + per-project number.
    expect(body.id).toMatch(/^rpt_[0-9a-hjkmnp-tv-z]{8}$/);
    expect(body.number).toBeGreaterThanOrEqual(1);
    aliceReport = body.id;
    aliceReportNumber = body.number;
  });

  it('per-project numbering: a second report in the same project gets number = previous + 1', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const first = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    const firstBody = (await first.json()) as { number: number };
    const second = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { number: number; id: string };
    expect(secondBody.number).toBe(firstBody.number + 1);
    // Slugs are globally unique even within a single project.
    expect(secondBody.id).toMatch(/^rpt_[0-9a-hjkmnp-tv-z]{8}$/);
  });

  it('POST 404 when caller is not member of the project', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it('POST 401 without auth', async () => {
    const app = createApp();
    const res = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('POST 400 on invalid visitDate', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: 'not-a-date' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET list under project', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports?limit=10`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((r) => r.id === aliceReport)).toBeTruthy();
  });

  it('GET list 404 when not member', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });

  it('GET /reports/:id returns the report', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(aliceReport);
  });

  it('GET /reports/:id 404 for non-member', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(404);
  });

  it('PATCH updates visitDate', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: '2026-06-01T10:00:00.000Z' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { visitDate: string };
    expect(body.visitDate).toBe('2026-06-01T10:00:00.000Z');
  });

  it('PATCH can clear visitDate (null)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: null }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { visitDate: string | null };
    expect(body.visitDate).toBeNull();
  });

  it('DELETE returns 204 then GET returns 404', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const del = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(del.status).toBe(204);
    const get = await app.request(`/projects/${aliceProjSlug}/reports/${aliceReportNumber}`, { headers: { authorization: `Bearer ${tok}` } });
    expect(get.status).toBe(404);
  });
});

describe('GET /projects/:project/reports status filter', () => {
  let projectSlug: string;
  let token: string;
  let olderDraft: ReportSnapshot;
  let finalized: ReportSnapshot;
  let newerDraft: ReportSnapshot;

  beforeAll(async () => {
    projectSlug = makeProjectId();
    token = await signTestToken(alice, aliceSid);
    await seedOwnedProject(projectSlug, alice);

    olderDraft = await createReportSnapshot(projectSlug, token);
    finalized = await createReportSnapshot(projectSlug, token);
    newerDraft = await createReportSnapshot(projectSlug, token);

    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    try {
      await admin.query(
        `UPDATE app.reports
         SET created_at = $2::timestamptz, updated_at = $2::timestamptz
         WHERE id = $1`,
        [olderDraft.id, '2026-07-29T10:00:00.000Z'],
      );
      await admin.query(
        `UPDATE app.reports
         SET status = 'finalized',
             finalized_at = $2::timestamptz,
             created_at = $2::timestamptz,
             updated_at = $2::timestamptz
         WHERE id = $1`,
        [finalized.id, '2026-07-29T10:01:00.000Z'],
      );
      await admin.query(
        `UPDATE app.reports
         SET created_at = $2::timestamptz, updated_at = $2::timestamptz
         WHERE id = $1`,
        [newerDraft.id, '2026-07-29T10:02:00.000Z'],
      );
    } finally {
      await admin.end();
    }
  }, 30_000);

  it('applies the status filter before cursor pagination', async () => {
    const first = await createApp().request(
      `/projects/${projectSlug}/reports?status=draft&limit=1`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(first.status).toBe(200);
    const firstPage = (await first.json()) as {
      items: ReportSnapshot[];
      nextCursor: string | null;
    };
    expect(firstPage.items.map((report) => report.id)).toEqual([newerDraft.id]);
    expect(firstPage.items.every((report) => report.status === 'draft')).toBe(true);
    expect(firstPage.nextCursor).not.toBeNull();

    const second = await createApp().request(
      `/projects/${projectSlug}/reports?status=draft&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(second.status).toBe(200);
    const secondPage = (await second.json()) as {
      items: ReportSnapshot[];
      nextCursor: string | null;
    };
    expect(secondPage.items.map((report) => report.id)).toEqual([olderDraft.id]);
    expect(secondPage.items.every((report) => report.status === 'draft')).toBe(true);
    expect(secondPage.nextCursor).toBeNull();

    const finalizedOnly = await createApp().request(
      `/projects/${projectSlug}/reports?status=finalized&limit=1`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(finalizedOnly.status).toBe(200);
    const finalizedPage = (await finalizedOnly.json()) as {
      items: ReportSnapshot[];
    };
    expect(finalizedPage.items.map((report) => report.id)).toEqual([finalized.id]);
    expect(finalizedPage.items.every((report) => report.status === 'finalized')).toBe(true);
  });

  it('rejects an unknown status filter', async () => {
    const res = await createApp().request(`/projects/${projectSlug}/reports?status=archived`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });
});

describe('Phase 0 report mutation concurrency', () => {
  let projectSlug: string;
  let token: string;

  beforeAll(async () => {
    projectSlug = makeProjectId();
    token = await signTestToken(alice, aliceSid);
    await seedOwnedProject(projectSlug, alice);
  });

  it('PATCH returns 409 plus the current report for a stale editor', async () => {
    const created = await createReportSnapshot(projectSlug, token);
    const current = await patchReportSnapshot(projectSlug, created.number, token, {
      body: reportBodyWithTitle('Saved by editor A'),
    });

    const res = await createApp().request(`/projects/${projectSlug}/reports/${created.number}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify({
        body: reportBodyWithTitle('Overwritten by stale editor B'),
        expectedUpdatedAt: staleVersionOf(current.updatedAt),
      }),
    });
    const conflict = await readConflictReport(res, current);
    expect(conflict.body?.meta.title).toBe('Saved by editor A');

    const latest = await getReportSnapshot(projectSlug, created.number, token);
    expect(latest.updatedAt).toBe(current.updatedAt);
    expect(latest.body?.meta.title).toBe('Saved by editor A');
  });

  it('generate returns 409 plus the current report for a stale editor', async () => {
    const created = await createReportSnapshot(projectSlug, token);
    const current = await patchReportSnapshot(projectSlug, created.number, token, {
      visitDate: '2026-07-29T11:00:00.000Z',
    });

    const res = await createApp().request(
      `/projects/${projectSlug}/reports/${created.number}/generate`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          expectedUpdatedAt: staleVersionOf(current.updatedAt),
        }),
      },
    );
    const conflict = await readConflictReport(res, current);
    expect(conflict.body).toBeNull();
    expect(conflict.visitDate).toBe('2026-07-29T11:00:00.000Z');

    const latest = await getReportSnapshot(projectSlug, created.number, token);
    expect(latest.updatedAt).toBe(current.updatedAt);
    expect(latest.body).toBeNull();
  });

  it('regenerate returns 409 plus the current report for a stale editor', async () => {
    const created = await createReportSnapshot(projectSlug, token);
    const current = await patchReportSnapshot(projectSlug, created.number, token, {
      body: reportBodyWithTitle('Current manual draft'),
    });

    const res = await createApp().request(
      `/projects/${projectSlug}/reports/${created.number}/regenerate`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          fixtureName: 'generate-report.voice-4',
          expectedUpdatedAt: staleVersionOf(current.updatedAt),
        }),
      },
    );
    const conflict = await readConflictReport(res, current);
    expect(conflict.body?.meta.title).toBe('Current manual draft');

    const latest = await getReportSnapshot(projectSlug, created.number, token);
    expect(latest.updatedAt).toBe(current.updatedAt);
    expect(latest.body?.meta.title).toBe('Current manual draft');
  });

  it('finalize returns 409 plus the current draft for a stale editor', async () => {
    const created = await createReportSnapshot(projectSlug, token);
    const current = await patchReportSnapshot(projectSlug, created.number, token, {
      body: reportBodyWithTitle('Current draft'),
    });

    const res = await createApp().request(
      `/projects/${projectSlug}/reports/${created.number}/finalize`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          expectedUpdatedAt: staleVersionOf(current.updatedAt),
        }),
      },
    );
    const conflict = await readConflictReport(res, current);
    expect(conflict.status).toBe('draft');
    expect(conflict.finalizedAt).toBeNull();

    const latest = await getReportSnapshot(projectSlug, created.number, token);
    expect(latest.status).toBe('draft');
    expect(latest.updatedAt).toBe(current.updatedAt);
  });

  it('unfinalize returns 409 plus the current finalized report for a stale editor', async () => {
    const created = await createReportSnapshot(projectSlug, token);
    await patchReportSnapshot(projectSlug, created.number, token, {
      body: reportBodyWithTitle('Finalized report'),
    });
    const finalizedRes = await createApp().request(
      `/projects/${projectSlug}/reports/${created.number}/finalize`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({}),
      },
    );
    expect(finalizedRes.status).toBe(200);
    const current = (
      (await finalizedRes.json()) as {
        report: ReportSnapshot;
      }
    ).report;

    const res = await createApp().request(
      `/projects/${projectSlug}/reports/${created.number}/unfinalize`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          expectedUpdatedAt: staleVersionOf(current.updatedAt),
        }),
      },
    );
    const conflict = await readConflictReport(res, current);
    expect(conflict.status).toBe('finalized');
    expect(conflict.finalizedAt).toBe(current.finalizedAt);

    const latest = await getReportSnapshot(projectSlug, created.number, token);
    expect(latest.status).toBe('finalized');
    expect(latest.updatedAt).toBe(current.updatedAt);
  });
});

describe('PATCH /projects/:project/reports/:number/attachments', () => {
  let reportId: string;
  let reportNumber: number;
  let imageNoteId: string;
  let documentNoteId: string;
  let textNoteId: string;
  let expectedBodyVersion: string | null;

  beforeAll(async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const created = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string; number: number };
    reportId = createdBody.id;
    reportNumber = createdBody.number;

    const fileId = makeFileId();
    const documentFileId = makeFileId();
    const client = new pg.Client({ connectionString: fx.url });
    await client.connect();
    await client.query(
      `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
       VALUES ($1, $2, 'image', $3, 1024, 'image/jpeg')`,
      [fileId, alice, `report-placement-${fileId}`],
    );
    await client.query(
      `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
       VALUES ($1, $2, 'document', $3, 2048, 'application/pdf')`,
      [documentFileId, alice, `report-placement-${documentFileId}.pdf`],
    );
    await client.end();

    const image = await app.request(`/reports/${reportId}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        files: [{ fileId, thumbnailFileId: null }],
        source: 'camera',
      }),
    });
    expect(image.status).toBe(201);
    imageNoteId = ((await image.json()) as { id: string }).id;

    const document = await app.request(`/reports/${reportId}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'document',
        fileId: documentFileId,
        title: 'Marked-up drawing',
        source: 'upload',
      }),
    });
    expect(document.status).toBe(201);
    documentNoteId = ((await document.json()) as { id: string }).id;

    const text = await app.request(`/reports/${reportId}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'text', body: 'text is not placeable' }),
    });
    expect(text.status).toBe(201);
    textNoteId = ((await text.json()) as { id: string }).id;

    expectedBodyVersion = '2026-06-09T12:00:00.000Z';
    const seededDirtyAt = '2026-06-09T12:05:00.000Z';
    const seed = new pg.Client({ connectionString: fx.url });
    await seed.connect();
    await seed.query(
      `UPDATE app.reports
          SET body = $1::jsonb,
              generated_at = $2::timestamptz,
              notes_changed_at = $3::timestamptz
        WHERE id = $4`,
      [JSON.stringify(placementBody), expectedBodyVersion, seededDirtyAt, reportId],
    );
    await seed.end();
  });

  it('places an image note in an issue without bumping notes_changed_at', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const before = await readDirty(reportId);

    const res = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: imageNoteId,
          target: { kind: 'issue', index: 0 },
          expectedBodyVersion,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        body: {
          issues: Array<{ attachments?: { images?: string[] } }>;
          summarySections: Array<{ attachments?: { images?: string[] } }>;
        };
      };
    };
    expect(body.report.body.issues[0]!.attachments?.images).toEqual([imageNoteId]);
    expect(body.report.body.summarySections[0]!.attachments).toBeUndefined();

    const after = await readDirty(reportId);
    expect(after.changed_at?.getTime()).toBe(before.changed_at?.getTime());
  });

  it('advances updatedAt by a wire-visible millisecond for attachment placement', async () => {
    const previousUpdatedAt = '2099-01-01T00:00:00.000Z';
    await getPool().query(
      `UPDATE app.reports SET updated_at = $1::timestamptz WHERE id = $2`,
      [previousUpdatedAt, reportId],
    );

    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: imageNoteId,
          target: { kind: 'issue', index: 0 },
          expectedBodyVersion,
        }),
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { updatedAt: string } };
    expect(new Date(body.report.updatedAt).getTime()).toBeGreaterThan(
      new Date(previousUpdatedAt).getTime(),
    );
  });

  it('moves the image note to a section exactly once', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: imageNoteId,
          target: { kind: 'section', index: 1 },
          expectedBodyVersion,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        body: {
          issues: Array<{ attachments?: { images?: string[] } }>;
          summarySections: Array<{ attachments?: { images?: string[] } }>;
        };
      };
    };
    expect(body.report.body.issues[0]!.attachments).toBeUndefined();
    expect(body.report.body.summarySections[1]!.attachments?.images).toEqual([
      imageNoteId,
    ]);
  });

  it('removes a placed image note when target is null', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: imageNoteId,
          target: null,
          expectedBodyVersion,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        body: {
          issues: Array<{ attachments?: { images?: string[] } }>;
          summarySections: Array<{ attachments?: { images?: string[] } }>;
        };
      };
    };
    expect(body.report.body.issues[0]!.attachments).toBeUndefined();
    expect(body.report.body.summarySections[1]!.attachments).toBeUndefined();
  });

  it('places a document note in the documents attachment bucket', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: documentNoteId,
          target: { kind: 'section', index: 0 },
          expectedBodyVersion,
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        body: {
          summarySections: Array<{ attachments?: { documents?: string[] } }>;
        };
      };
    };
    expect(body.report.body.summarySections[0]!.attachments?.documents).toEqual([
      documentNoteId,
    ]);
  });

  it('returns 400 for non-image/document notes and out-of-range targets', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const text = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: textNoteId,
          target: { kind: 'issue', index: 0 },
          expectedBodyVersion,
        }),
      },
    );
    expect(text.status).toBe(400);

    const missingTarget = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: imageNoteId,
          target: { kind: 'section', index: 99 },
          expectedBodyVersion,
        }),
      },
    );
    expect(missingTarget.status).toBe(400);
  });

  it('returns 409 with the current report on a stale body version', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: imageNoteId,
          target: { kind: 'issue', index: 0 },
          expectedBodyVersion: '2026-06-09T11:00:00.000Z',
        }),
      },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { report: { id: string; body: unknown } };
    expect(body.report.id).toBe(reportId);
    expect(body.report.body).toBeTruthy();
  });

  it('returns 404 for a read-only project member', async () => {
    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    try {
      await admin.query(
        `INSERT INTO app.project_members(project_id, user_id, role)
         VALUES ($1, $2, 'viewer')
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'viewer'`,
        [aliceProj, bob],
      );

      const app = createApp();
      const tok = await signTestToken(bob, bobSid);
      const res = await app.request(
        `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
        {
          method: 'PATCH',
          headers: headers(tok),
          body: JSON.stringify({
            noteId: imageNoteId,
            target: { kind: 'issue', index: 0 },
            expectedBodyVersion,
          }),
        },
      );
      expect(res.status).toBe(404);
    } finally {
      await admin.query(
        `DELETE FROM app.project_members WHERE project_id = $1 AND user_id = $2`,
        [aliceProj, bob],
      );
      await admin.end();
    }
  });

  it('does not place attachments into a finalized report', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const finalize = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/finalize`,
      {
        method: 'POST',
        headers: headers(tok),
      },
    );
    expect(finalize.status).toBe(200);
    const frozen = (
      (await finalize.json()) as {
        report: { body: unknown; status: string; updatedAt: string };
      }
    ).report;
    expect(frozen.status).toBe('finalized');

    const res = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/attachments`,
      {
        method: 'PATCH',
        headers: headers(tok),
        body: JSON.stringify({
          noteId: imageNoteId,
          target: { kind: 'issue', index: 0 },
          expectedBodyVersion,
        }),
      },
    );
    expect(res.status).toBe(409);
    const conflict = (await res.json()) as {
      report: { body: unknown; status: string; updatedAt: string };
    };
    expect(conflict.report.status).toBe('finalized');
    expect(conflict.report.updatedAt).toBe(frozen.updatedAt);
    expect(conflict.report.body).toEqual(frozen.body);

    const latest = await getReportSnapshot(aliceProjSlug, reportNumber, tok);
    expect(latest.status).toBe('finalized');
    expect(latest.updatedAt).toBe(frozen.updatedAt);
    expect(latest.body).toEqual(frozen.body);
  });
});

// ---------------------------------------------------------------------------
// P1.7 — generate / regenerate / finalize / pdf
//
// All four endpoints run against @harpa/ai-fixtures replay (no real provider,
// no R2). Tests share one report row so state transitions chain naturally:
//
//   draft (no body) → generate → draft (full body)
//                   → regenerate (incomplete fixture) → draft (sparse body)
//                   → pdf → signed URL (body untouched)
//                   → finalize → finalized
//                   → regenerate → 409
// ---------------------------------------------------------------------------
describe('reports AI/PDF', () => {
  let reportId: string;
  let reportNumber: number;

  beforeAll(async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ visitDate: '2026-05-12T08:00:00.000Z' }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; number: number };
    reportId = created.id;
    reportNumber = created.number;
  });

  it('POST /reports/:id/generate returns the recorded full body', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/generate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { status: string; body: { workers: unknown[]; weather: unknown }; generatedAt: string | null };
    };
    expect(body.report.status).toBe('draft');
    expect(body.report.body).toBeTruthy();
    // weather is nullable in the contract — LLM output varies across
    // re-recordings, so just assert the field is present (null or set).
    expect('weather' in body.report.body).toBe(true);
    expect(body.report.body.workers.length).toBeGreaterThan(0);
    expect(body.report.generatedAt).not.toBeNull();
  });

  it('POST /reports/:id/regenerate replaces body with the named fixture', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/regenerate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fixtureName: 'generate-report.voice-4' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { body: { workers: unknown[]; summarySections: { title: string }[] } };
    };
    expect(body.report.body.workers).toEqual([]);
    expect(body.report.body.summarySections.length).toBeGreaterThan(0);
    expect(body.report.body.summarySections[0]?.title).toBeTruthy();
  });

  it('regenerate sets generated_at to snapshot value, so a subsequent note bump marks dirty', async () => {
    // The COALESCE semantic in setReportBody pins generated_at to the
    // notes_changed_at value captured before the AI call (the snapshot).
    // If a note is added after generation, notes_changed_at > generated_at.
    // The true mid-flight race is tested at the service layer in
    // reports.snapshot.integration.test.ts.
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);

    // Pin notes_changed_at to a known past value.
    const past = new Date(Date.now() - 60_000).toISOString();
    const c1 = await getPool().connect();
    try {
      await c1.query(
        `UPDATE app.reports SET notes_changed_at = $1, generated_at = NULL WHERE id = $2`,
        [past, reportId],
      );
    } finally {
      c1.release();
    }

    // Regenerate — route captures snapshotTs = past, AI runs, then
    // setReportBody sets generated_at = past (not now()).
    const res = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/regenerate`,
      {
        method: 'POST',
        headers: headers(tok),
        body: JSON.stringify({ fixtureName: 'generate-report.voice-4' }),
      },
    );
    expect(res.status).toBe(200);

    // Verify generated_at was pinned to the snapshot (past), not now().
    const c2 = await getPool().connect();
    try {
      const r = await c2.query<{ generated_at: Date }>(
        `SELECT generated_at FROM app.reports WHERE id = $1`,
        [reportId],
      );
      const genAt = r.rows[0]!.generated_at.getTime();
      const pastMs = new Date(past).getTime();
      expect(genAt).toBe(pastMs);
    } finally {
      c2.release();
    }

    // Simulate a note add after generation — bump notes_changed_at.
    const future = new Date(Date.now() + 60_000).toISOString();
    const c3 = await getPool().connect();
    try {
      await c3.query(
        `UPDATE app.reports SET notes_changed_at = $1 WHERE id = $2`,
        [future, reportId],
      );
    } finally {
      c3.release();
    }

    // Now notes_changed_at(future) > generated_at(past) → dirty.
    const c4 = await getPool().connect();
    try {
      const r = await c4.query<{ changed_at: Date; generated_at: Date }>(
        `SELECT notes_changed_at AS changed_at, generated_at FROM app.reports WHERE id = $1`,
        [reportId],
      );
      const row = r.rows[0]!;
      expect(row.changed_at.getTime()).toBeGreaterThan(row.generated_at.getTime());
    } finally {
      c4.release();
    }
  });

  it('POST /reports/:id/pdf returns a signed URL pointing at the rendered key', async () => {
    const previousUpdatedAt = '2099-01-02T00:00:00.000Z';
    await getPool().query(
      `UPDATE app.reports SET updated_at = $1::timestamptz WHERE id = $2`,
      [previousUpdatedAt, reportId],
    );

    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/pdf`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expiresAt: string };
    // PDFs are project-scoped: server-built key is
    // projects/<projectSlug>/reports/<reportSlug>/fil_…pdf.
    expect(body.url).toContain(encodeURIComponent(`projects/${aliceProjSlug}/reports/`));
    expect(body.url).toContain('.pdf');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const lifecycle = await getPool().query<{
      file_key: string;
      consumed_at: Date;
      updated_at: Date;
    }>(
      `SELECT f.file_key, lease.consumed_at, report.updated_at
       FROM app.reports report
       JOIN app.files f ON f.id = report.pdf_file_id
       JOIN app.file_upload_leases lease
         ON lease.file_id = f.id
        AND lease.file_key = f.file_key
       WHERE report.id = $1`,
      [reportId],
    );
    expect(lifecycle.rows).toHaveLength(1);
    expect(lifecycle.rows[0]?.file_key).toContain(
      `projects/${aliceProjSlug}/reports/`,
    );
    expect(lifecycle.rows[0]?.consumed_at).toBeInstanceOf(Date);
    expect(lifecycle.rows[0]!.updated_at.getTime()).toBeGreaterThan(
      new Date(previousUpdatedAt).getTime(),
    );
  });

  it('keeps a durable PDF key when registration fails after the object write', async () => {
    const pool = getPool();
    await pool.query(
      `CREATE OR REPLACE FUNCTION app.test_fail_pdf_registration()
       RETURNS trigger
       LANGUAGE plpgsql
       AS $$
       BEGIN
         IF NEW.kind = 'pdf' THEN
           RAISE EXCEPTION 'test_pdf_registration_failure';
         END IF;
         RETURN NEW;
       END
       $$;

       CREATE TRIGGER test_fail_pdf_registration
       BEFORE INSERT ON app.files
       FOR EACH ROW
       EXECUTE FUNCTION app.test_fail_pdf_registration()`,
    );

    try {
      const app = createApp();
      const token = await signTestToken(alice, aliceSid);
      const response = await app.request(
        `/projects/${aliceProjSlug}/reports/${reportNumber}/pdf`,
        {
          method: 'POST',
          headers: headers(token),
        },
      );
      expect(response.status).toBe(500);

      const reservation = await pool.query<{
        file_id: string;
        file_key: string;
      }>(
        `SELECT file_id, file_key
         FROM app.file_upload_leases
         WHERE owner_id = $1
           AND report_id = $2
           AND consumed_at IS NULL`,
        [alice, reportId],
      );
      expect(reservation.rows).toHaveLength(1);
      expect(reservation.rows[0]?.file_key).toContain(
        `projects/${aliceProjSlug}/reports/${reportId}/`,
      );
      expect(
        (
          await pool.query(`SELECT 1 FROM app.files WHERE id = $1`, [
            reservation.rows[0]!.file_id,
          ])
        ).rowCount,
      ).toBe(0);

      await pool.query(
        `UPDATE app.file_upload_leases
         SET presign_expires_at = now() - interval '31 seconds'
         WHERE file_id = $1`,
        [reservation.rows[0]!.file_id],
      );
      await expect(
        pruneExpiredFileUploadLeases({
          maxLeases: 10,
          storage: new FixtureStorage(),
        }),
      ).resolves.toMatchObject({
        unconsumedLeasesPruned: 1,
        orphanObjectsDeleted: 1,
      });
    } finally {
      await pool.query(
        `DROP TRIGGER IF EXISTS test_fail_pdf_registration ON app.files;
         DROP FUNCTION IF EXISTS app.test_fail_pdf_registration()`,
      );
      await pool.query(
        `DELETE FROM app.file_upload_leases
         WHERE owner_id = $1
           AND report_id = $2
           AND consumed_at IS NULL`,
        [alice, reportId],
      );
    }
  });

  it('POST /reports/:id/finalize freezes the report', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/finalize`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { status: string; finalizedAt: string | null } };
    expect(body.report.status).toBe('finalized');
    expect(body.report.finalizedAt).not.toBeNull();
  });

  it('POST /reports/:id/finalize is idempotent (200 on already-finalized)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const before = await getReportSnapshot(aliceProjSlug, reportNumber, tok);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/finalize`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: ReportSnapshot };
    expect(body.report.updatedAt).toBe(before.updatedAt);
    expect(body.report.finalizedAt).toBe(before.finalizedAt);

    const conditional = await app.request(
      `/projects/${aliceProjSlug}/reports/${reportNumber}/finalize`,
      {
        method: 'POST',
        headers: headers(tok),
        body: JSON.stringify({ expectedUpdatedAt: before.updatedAt }),
      },
    );
    expect(conditional.status).toBe(200);
    const conditionalBody = (await conditional.json()) as { report: ReportSnapshot };
    expect(conditionalBody.report.updatedAt).toBe(before.updatedAt);
    expect(conditionalBody.report.finalizedAt).toBe(before.finalizedAt);

    const after = await getReportSnapshot(aliceProjSlug, reportNumber, tok);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.finalizedAt).toBe(before.finalizedAt);
  });

  it('POST /reports/:id/regenerate 409 once finalized', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/regenerate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
  });

  it('POST /reports/:id/unfinalize flips a finalized report back to draft', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/unfinalize`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { status: string; finalizedAt: string | null } };
    expect(body.report.status).toBe('draft');
    expect(body.report.finalizedAt).toBeNull();
  });

  it('POST /reports/:id/unfinalize 409 when the report is already a draft', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Previous test already unfinalized it; this hits a draft row.
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/unfinalize`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(409);
  });

  it('POST /reports/:id/unfinalize 404 when caller is not a project member (RLS-hidden)', async () => {
    const app = createApp();
    // Re-finalize alice's report so the row exists & is in a finalize-able
    // state, then attempt the unfinalize as bob.
    const aliceTok = await signTestToken(alice, aliceSid);
    const refinalize = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/finalize`, {
      method: 'POST',
      headers: headers(aliceTok),
    });
    expect(refinalize.status).toBe(200);

    const bobTok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/unfinalize`, {
      method: 'POST',
      headers: headers(bobTok),
    });
    expect(res.status).toBe(404);
  });

  it('POST /reports/:id/finalize 409 when report has no body', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Fresh draft, never generated.
    const created = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    const empty = (await created.json()) as { id: string; number: number };
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${empty.number}/finalize`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(409);
  });

  it('POST /reports/:id/pdf 409 when report has no body', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const created = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    const empty = (await created.json()) as { id: string; number: number };
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${empty.number}/pdf`, {
      method: 'POST',
      headers: headers(tok),
    });
    expect(res.status).toBe(409);
  });

  it('all four endpoints 401 without auth', async () => {
    const app = createApp();
    for (const path of ['generate', 'regenerate', 'finalize', 'pdf']) {
      const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(401);
    }
  });

  it('all four endpoints 404 on unknown reportId', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // valid-shaped slug that does not exist in DB
    for (const path of ['generate', 'regenerate', 'finalize', 'pdf']) {
      const res = await app.request(`/projects/${aliceProjSlug}/reports/9999/${path}`, {
        method: 'POST',
        headers: headers(tok),
        body: '{}',
      });
      expect(res.status).toBe(404);
    }
  });

  it('generate 400 rejects path-traversal-shaped fixtureName at the contract boundary', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${reportNumber}/generate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fixtureName: '../../../etc/passwd' }),
    });
    expect(res.status).toBe(400);
  });

  it('generate 502 with code=ai_provider_error on unknown fixtureName (no provider/fixture leak)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Need a fresh draft (current `reportId` is finalized; would 409).
    const created = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    const fresh = (await created.json()) as { id: string; number: number };
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${fresh.number}/generate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fixtureName: 'generate-report.does-not-exist' }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('ai_provider_error');
    expect(body.error.message).not.toContain('does-not-exist');
    expect(body.error.message).not.toContain('fixture');
    expect(body.error.message).not.toContain('openai');
  });

  it('regenerate drops attachments for notes deleted since the previous body', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const created = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(created.status).toBe(201);
    const fresh = (await created.json()) as { id: string; number: number };

    const fileId = makeFileId();
    const client = new pg.Client({ connectionString: fx.url });
    await client.connect();
    await client.query(
      `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
       VALUES ($1, $2, 'image', $3, 1024, 'image/jpeg')`,
      [fileId, alice, `regen-cleanup-${fileId}`],
    );
    await client.end();

    const note = await app.request(`/reports/${fresh.id}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({
        kind: 'image',
        files: [{ fileId, thumbnailFileId: null }],
        source: 'camera',
      }),
    });
    expect(note.status).toBe(201);
    const imageNote = (await note.json()) as { id: string };

    const seed = new pg.Client({ connectionString: fx.url });
    await seed.connect();
    await seed.query(
      `UPDATE app.reports
          SET body = $1::jsonb,
              generated_at = $2::timestamptz
        WHERE id = $3`,
      [
        JSON.stringify({
          ...placementBody,
          issues: [
            {
              ...placementBody.issues[0]!,
              attachments: { images: [imageNote.id] },
            },
          ],
        }),
        '2026-06-09T12:00:00.000Z',
        fresh.id,
      ],
    );
    await seed.end();

    const deleted = await app.request(`/notes/${imageNote.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(deleted.status).toBe(204);

    const regenerated = await app.request(
      `/projects/${aliceProjSlug}/reports/${fresh.number}/regenerate`,
      {
        method: 'POST',
        headers: headers(tok),
        body: JSON.stringify({ fixtureName: 'generate-report.voice-4' }),
      },
    );
    expect(regenerated.status).toBe(200);
    const body = (await regenerated.json()) as { report: { body: unknown } };
    expect(JSON.stringify(body.report.body)).not.toContain(imageNote.id);
  });
});

// ---------------------------------------------------------------------------
// P4.8 — GET /reports/{number}/debug
// ---------------------------------------------------------------------------
describe('GET /reports/:number/debug', () => {
  let debugReportNumber: number;
  let debugReportId: string;

  beforeAll(async () => {
    // Fresh draft owned by alice — keeps these tests independent of the
    // generate/finalize chain above (which leaves its report finalized).
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const created = await app.request(`/projects/${aliceProjSlug}/reports`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    const body = (await created.json()) as { id: string; number: number };
    debugReportNumber = body.number;
    debugReportId = body.id;

    // Add a text note so /debug surfaces non-empty data.
    await app.request(`/reports/${debugReportId}/notes`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ kind: 'text', body: 'wall is cracked at the SE corner' }),
    });
  });

  it('returns empty lastGeneration + live userPrompt for a never-generated draft', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${debugReportNumber}/debug`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      prompt: { system: string; user: string };
      notes: Array<{ kind: string; body: string | null }>;
      lastGeneration: unknown;
    };
    expect(body.lastGeneration).toBeNull();
    expect(body.prompt.system).toBe('');
    expect(body.prompt.user).toContain('wall is cracked');
    expect(body.notes.length).toBeGreaterThan(0);
    expect(body.notes[0]!.kind).toBe('text');
  });

  it('persists + surfaces lastGeneration after a /generate call', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const gen = await app.request(`/projects/${aliceProjSlug}/reports/${debugReportNumber}/generate`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({}),
    });
    expect(gen.status).toBe(200);

    const res = await app.request(`/projects/${aliceProjSlug}/reports/${debugReportNumber}/debug`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      prompt: { system: string; user: string };
      lastGeneration: {
        requestedAt: string;
        finishedAt: string | null;
        vendor: string;
        model: string;
        fixtureMode: string;
        systemPrompt: string;
        userPrompt: string;
        response: string;
        usage: unknown;
      } | null;
    };
    expect(body.lastGeneration).not.toBeNull();
    const lg = body.lastGeneration!;
    expect(lg.fixtureMode).toBe('replay');
    expect(lg.vendor).toMatch(/openai|anthropic|google|groq|kimi|deepseek|zai/);
    expect(lg.model.length).toBeGreaterThan(0);
    expect(lg.systemPrompt.length).toBeGreaterThan(0);
    expect(lg.userPrompt.length).toBeGreaterThan(0);
    expect(lg.response.length).toBeGreaterThan(0);
    expect(lg.usage).toBeNull(); // not wired yet — see design §3.4
    // `prompt.system` is hydrated from lastGeneration after a generate.
    expect(body.prompt.system).toBe(lg.systemPrompt);
  });

  it('404 for a non-member (Pitfall 6 scope test)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${debugReportNumber}/debug`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });

  it('viewer member of the project CAN read /debug (read-only, scope-test trio)', async () => {
    // Add bob as a viewer of alice's project via direct DB write — the
    // members route is the canonical add path, but we don't need its
    // semantics here, only the row.
    const admin = new pg.Client({ connectionString: fx.url });
    await admin.connect();
    await admin.query(
      `INSERT INTO app.project_members(project_id, user_id, role) VALUES ($1, $2, 'viewer') ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'viewer'`,
      [aliceProj, bob],
    );
    await admin.end();

    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${debugReportNumber}/debug`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(200);

    // Clean up so other tests that rely on bob being a non-member of
    // alice's project keep working.
    const admin2 = new pg.Client({ connectionString: fx.url });
    await admin2.connect();
    await admin2.query(
      `DELETE FROM app.project_members WHERE project_id = $1 AND user_id = $2`,
      [aliceProj, bob],
    );
    await admin2.end();
  });

  it('401 without auth', async () => {
    const app = createApp();
    const res = await app.request(`/projects/${aliceProjSlug}/reports/${debugReportNumber}/debug`);
    expect(res.status).toBe(401);
  });

  it('404 for unknown report number under a project the caller owns', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/projects/${aliceProjSlug}/reports/99999/debug`, {
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(res.status).toBe(404);
  });
});
