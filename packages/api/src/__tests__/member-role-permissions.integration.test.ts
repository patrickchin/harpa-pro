/**
 * Actor-matrix coverage for project member roles.
 *
 * Membership makes project data visible; role decides which mutations are
 * allowed. These tests intentionally exercise the real request scope and
 * Postgres policies instead of stubbing route collaborators.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import { createApp } from '../app.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import {
  makeFileId,
  makeNoteId,
  makeProjectId,
  makeReportId,
  makeSessionId,
  makeUserId,
} from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

type ProjectRole = 'owner' | 'editor' | 'viewer';

const roles: ProjectRole[] = ['owner', 'editor', 'viewer'];
const writerRoles = new Set<ProjectRole>(['owner', 'editor']);

const reportBody = {
  meta: {
    title: 'Role matrix report',
    summary: 'Authorization regression fixture.',
    visitDate: null,
  },
  weather: null,
  workers: [],
  materials: [],
  issues: [],
  nextSteps: [],
  summarySections: [],
};

let fx: PgFixture;
let projectId: string;
let inviteeId: string;
let actorIds: Record<ProjectRole, string>;
let actorTokens: Record<ProjectRole, string>;

async function withAdmin<T>(
  run: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: fx.url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function seedReport(input?: {
  authorId?: string;
  status?: 'draft' | 'finalized';
  body?: typeof reportBody | null;
}): Promise<{ id: string; number: number }> {
  const id = makeReportId();
  const authorId = input?.authorId ?? actorIds.owner;
  const status = input?.status ?? 'draft';
  const body = input?.body === undefined ? reportBody : input.body;
  return withAdmin(async (client) => {
    const next = await client.query<{ number: number }>(
      `UPDATE app.projects
          SET next_report_number = next_report_number + 1
        WHERE id = $1
        RETURNING next_report_number - 1 AS number`,
      [projectId],
    );
    const number = next.rows[0]!.number;
    await client.query(
      `INSERT INTO app.reports(
         id, project_id, author_id, number, status, body, finalized_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5::app.report_status,
         $6::jsonb,
         CASE
           WHEN $5::app.report_status = 'finalized'::app.report_status
           THEN now()
           ELSE NULL
         END
       )`,
      [id, projectId, authorId, number, status, body === null ? null : JSON.stringify(body)],
    );
    return { id, number };
  });
}

async function seedNote(
  reportId: string,
  authorId: string,
): Promise<string> {
  const id = makeNoteId();
  await withAdmin((client) =>
    client.query(
      `INSERT INTO app.notes(id, report_id, author_id, kind, body)
       VALUES ($1, $2, $3, 'text', 'seeded note')`,
      [id, reportId, authorId],
    ),
  );
  return id;
}

async function seedFile(
  reportId: string,
  ownerId: string,
  kind: 'image' | 'voice' = 'image',
): Promise<string> {
  const id = makeFileId();
  const contentType = kind === 'voice' ? 'audio/m4a' : 'image/jpeg';
  const ext = kind === 'voice' ? 'm4a' : 'jpg';
  await withAdmin((client) =>
    client.query(
      `INSERT INTO app.files(
         id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id
       )
       VALUES ($1, $2, $3, $4, 2048, $5, $6, $7)`,
      [
        id,
        ownerId,
        kind,
        `projects/${projectId}/reports/${reportId}/${id}.${ext}`,
        contentType,
        projectId,
        reportId,
      ],
    ),
  );
  return id;
}

async function seedRoleProject(role: ProjectRole): Promise<string> {
  const id = makeProjectId();
  const actorId = actorIds[role];
  await withAdmin(async (client) => {
    await client.query(
      `INSERT INTO app.projects(id, name, owner_id)
       VALUES ($1, 'Role-specific project', $2)`,
      [id, actorIds.owner],
    );
    if (role === 'owner') {
      await client.query(
        `INSERT INTO app.project_members(project_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [id, actorId],
      );
    } else {
      await client.query(
        `INSERT INTO app.project_members(project_id, user_id, role)
         VALUES ($1, $2, 'owner'), ($1, $3, $4::app.project_role)`,
        [id, actorIds.owner, actorId, role],
      );
    }
  });
  return id;
}

function headers(role: ProjectRole, idempotencyKey?: string) {
  const out: Record<string, string> = {
    authorization: `Bearer ${actorTokens[role]}`,
    'content-type': 'application/json',
  };
  if (idempotencyKey) out['idempotency-key'] = idempotencyKey;
  return out;
}

function writerStatus(role: ProjectRole, success: number): number {
  return writerRoles.has(role) ? success : 404;
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  delete process.env.AI_LIVE;
  await resetPool();
  getPool(fx.url);

  actorIds = {
    owner: makeUserId(),
    editor: makeUserId(),
    viewer: makeUserId(),
  };
  inviteeId = makeUserId();
  projectId = makeProjectId();

  await seedAuthUsers(fx.url, [
    { id: actorIds.owner, displayName: 'Olivia Owner' },
    { id: actorIds.editor, displayName: 'Eddie Editor' },
    { id: actorIds.viewer, displayName: 'Vera Viewer' },
    { id: inviteeId, displayName: 'Ivy Invitee' },
  ]);

  await withAdmin(async (client) => {
    await client.query(
      `INSERT INTO app.projects(id, name, owner_id)
       VALUES ($1, 'Shared role matrix', $2)`,
      [projectId, actorIds.owner],
    );
    await client.query(
      `INSERT INTO app.project_members(project_id, user_id, role)
       VALUES
         ($1, $2, 'owner'),
         ($1, $3, 'editor'),
         ($1, $4, 'viewer')`,
      [projectId, actorIds.owner, actorIds.editor, actorIds.viewer],
    );
  });

  actorTokens = {
    owner: await signTestToken(actorIds.owner, makeSessionId()),
    editor: await signTestToken(actorIds.editor, makeSessionId()),
    viewer: await signTestToken(actorIds.viewer, makeSessionId()),
  };
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('project role mutation matrix', () => {
  it.each(roles)('%s project PATCH follows writer access', async (role) => {
    const res = await createApp().request(`/projects/${projectId}`, {
      method: 'PATCH',
      headers: headers(role),
      body: JSON.stringify({ name: `Patched by ${role}` }),
    });
    expect(res.status).toBe(writerStatus(role, 200));
  });

  it.each(roles)('%s project DELETE is owner-only', async (role) => {
    const targetProject = await seedRoleProject(role);
    const res = await createApp().request(`/projects/${targetProject}`, {
      method: 'DELETE',
      headers: headers(role),
    });
    expect(res.status).toBe(role === 'owner' ? 204 : 404);
  });

  it.each(roles)('%s member administration is owner-only', async (role) => {
    const targetProject = await seedRoleProject(role);
    const res = await createApp().request(`/projects/${targetProject}/members`, {
      method: 'POST',
      headers: headers(role),
      body: JSON.stringify({
        email: `${inviteeId}@test.local`,
        role: 'editor',
      }),
    });
    expect(res.status).toBe(role === 'owner' ? 201 : 403);
  });
});

describe('draft report role mutation matrix', () => {
  it.each(roles)('%s follows writer access for report create, patch, and delete', async (role) => {
    const app = createApp();

    const create = await app.request(`/projects/${projectId}/reports`, {
      method: 'POST',
      headers: headers(role),
      body: JSON.stringify({}),
    });

    const patchTarget = await seedReport({ authorId: actorIds[role] });
    const patch = await app.request(
      `/projects/${projectId}/reports/${patchTarget.number}`,
      {
        method: 'PATCH',
        headers: headers(role),
        body: JSON.stringify({ visitDate: '2026-07-28T08:00:00.000Z' }),
      },
    );

    const deleteTarget = await seedReport({ authorId: actorIds[role] });
    const remove = await app.request(
      `/projects/${projectId}/reports/${deleteTarget.number}`,
      {
        method: 'DELETE',
        headers: headers(role),
      },
    );
    expect({
      create: create.status,
      patch: patch.status,
      delete: remove.status,
    }).toEqual({
      create: writerStatus(role, 201),
      patch: writerStatus(role, 200),
      delete: writerStatus(role, 204),
    });
  });
});

describe('note and project-file role mutation matrix', () => {
  it.each(roles)('%s follows writer access for note mutations', async (role) => {
    const app = createApp();
    const report = await seedReport({ authorId: actorIds[role] });

    const create = await app.request(`/reports/${report.id}/notes`, {
      method: 'POST',
      headers: headers(role),
      body: JSON.stringify({ kind: 'text', body: `${role} note` }),
    });

    const patchTarget = await seedNote(report.id, actorIds[role]);
    const patch = await app.request(`/notes/${patchTarget}`, {
      method: 'PATCH',
      headers: headers(role),
      body: JSON.stringify({ body: `${role} edited note` }),
    });

    const appendTarget = await seedNote(report.id, actorIds[role]);
    const imageFileId = await seedFile(report.id, actorIds[role]);
    const append = await app.request(`/notes/${appendTarget}/files`, {
      method: 'POST',
      headers: headers(role),
      body: JSON.stringify({ files: [{ fileId: imageFileId }] }),
    });

    const deleteTarget = await seedNote(report.id, actorIds[role]);
    const remove = await app.request(`/notes/${deleteTarget}`, {
      method: 'DELETE',
      headers: headers(role),
    });
    expect({
      create: create.status,
      patch: patch.status,
      appendFiles: append.status,
      delete: remove.status,
    }).toEqual({
      create: writerStatus(role, 201),
      patch: writerStatus(role, 200),
      appendFiles: writerStatus(role, 200),
      delete: writerStatus(role, 204),
    });
  });

  it.each(roles)('%s follows writer access for project upload presign and registration', async (role) => {
    const app = createApp();
    const report = await seedReport({ authorId: actorIds[role] });

    const presign = await app.request('/files/presign', {
      method: 'POST',
      headers: headers(role),
      body: JSON.stringify({
        scope: 'project',
        projectId,
        reportId: report.id,
        kind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: 2048,
      }),
    });

    const fileId = makeFileId();
    const register = await app.request('/files', {
      method: 'POST',
      headers: headers(role),
      body: JSON.stringify({
        scope: 'project',
        projectId,
        reportId: report.id,
        kind: 'image',
        fileKey: `projects/${projectId}/reports/${report.id}/${fileId}.jpg`,
        contentType: 'image/jpeg',
        sizeBytes: 2048,
      }),
    });
    expect({
      presign: presign.status,
      register: register.status,
    }).toEqual({
      presign: writerStatus(role, 200),
      register: writerStatus(role, 201),
    });
  });

  it.each(roles)('%s follows writer access for voice-note ingestion', async (role) => {
    const app = createApp();
    const report = await seedReport({ authorId: actorIds[role] });
    const voiceFileId = await seedFile(report.id, actorIds[role], 'voice');
    const res = await app.request(`/reports/${report.id}/notes/voice`, {
      method: 'POST',
      headers: headers(role, `role-matrix:${role}:${voiceFileId}`),
      body: JSON.stringify({ fileId: voiceFileId, durationSec: 12 }),
    });
    expect(res.status).toBe(writerStatus(role, 201));
  });
});

describe('generation and publication role mutation matrix', () => {
  it.each(roles)('%s follows writer access for generate and regenerate', async (role) => {
    const app = createApp();
    const generateTarget = await seedReport({
      authorId: actorIds[role],
      body: null,
    });
    const generate = await app.request(
      `/projects/${projectId}/reports/${generateTarget.number}/generate`,
      {
        method: 'POST',
        headers: headers(role),
        body: JSON.stringify({ fixtureName: 'generate-report.voice-4' }),
      },
    );

    const regenerateTarget = await seedReport({ authorId: actorIds[role] });
    const regenerate = await app.request(
      `/projects/${projectId}/reports/${regenerateTarget.number}/regenerate`,
      {
        method: 'POST',
        headers: headers(role),
        body: JSON.stringify({ fixtureName: 'generate-report.voice-4' }),
      },
    );
    expect({
      generate: generate.status,
      regenerate: regenerate.status,
    }).toEqual({
      generate: writerStatus(role, 200),
      regenerate: writerStatus(role, 200),
    });
  });

  it.each(roles)('%s follows owner-only finalize and writer unfinalize access', async (role) => {
    const app = createApp();
    const finalizeTarget = await seedReport({ authorId: actorIds[role] });
    const finalize = await app.request(
      `/projects/${projectId}/reports/${finalizeTarget.number}/finalize`,
      {
        method: 'POST',
        headers: headers(role),
      },
    );

    const unfinalizeTarget = await seedReport({
      authorId: actorIds[role],
      status: 'finalized',
    });
    const unfinalize = await app.request(
      `/projects/${projectId}/reports/${unfinalizeTarget.number}/unfinalize`,
      {
        method: 'POST',
        headers: headers(role),
      },
    );
    expect({
      finalize: finalize.status,
      unfinalize: unfinalize.status,
    }).toEqual({
      finalize: role === 'owner' ? 200 : 404,
      unfinalize: writerStatus(role, 200),
    });
  });

  it.each(roles)('%s retains the explicit PDF export exception', async (role) => {
    const report = await seedReport({ authorId: actorIds[role] });
    const res = await createApp().request(
      `/projects/${projectId}/reports/${report.number}/pdf`,
      {
        method: 'POST',
        headers: headers(role),
      },
    );
    expect(res.status).toBe(200);
  });
});
