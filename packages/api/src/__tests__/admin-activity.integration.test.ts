import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { activity as activitySchemas } from '@harpa/api-contract';
import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { signTestToken } from '../middleware/auth.js';
import {
  makeProjectId,
  makeReportId,
  makeSessionId,
  makeUserId,
} from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;
let db: pg.Client;
let adminId: string;
let adminSessionId: string;
let regularId: string;
let regularSessionId: string;
let actorId: string;
let projectId: string;
let reportId: string;
let deletedProjectId: string;
let reportEventId: string;
let projectEventId: string;
let signupEventId: string;
let deletedProjectEventId: string;
let deletedUserEventId: string;

async function adminHeaders(): Promise<Record<string, string>> {
  const token = await signTestToken(adminId, adminSessionId);
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  adminId = makeUserId();
  regularId = makeUserId();
  actorId = makeUserId();
  adminSessionId = makeSessionId();
  regularSessionId = makeSessionId();
  projectId = makeProjectId();
  reportId = makeReportId();
  deletedProjectId = makeProjectId();
  reportEventId = newId('aud');
  projectEventId = newId('aud');
  signupEventId = newId('aud');
  deletedProjectEventId = newId('aud');
  deletedUserEventId = newId('aud');

  await seedAuthUsers(fx.url, [
    {
      id: adminId,
      email: 'admin-activity@example.com',
      displayName: 'Activity Admin',
      isAdmin: true,
    },
    {
      id: regularId,
      email: 'regular-activity@example.com',
      displayName: 'Regular Person',
    },
    {
      id: actorId,
      email: 'alice-activity@example.com',
      displayName: 'Alice Activity',
    },
  ]);

  db = new pg.Client({ connectionString: fx.url });
  await db.connect();
  await db.query(
    `INSERT INTO app.projects(id, name, owner_id)
     VALUES ($1, 'Tower Refurbishment', $2)`,
    [projectId, actorId],
  );
  await db.query(
    `INSERT INTO app.project_members(project_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [projectId, actorId],
  );
  await db.query(
    `INSERT INTO app.reports(id, project_id, author_id, number)
     VALUES ($1, $2, $3, 7)`,
    [reportId, projectId, actorId],
  );
  await db.query(
    `INSERT INTO app.activity_events
       (id, occurred_at, event_type, actor_user_id, subject_type, subject_id,
        project_id, request_id, dedupe_key, metadata)
     VALUES
       ($1, '2026-07-29T03:00:00Z', 'report.created', $6, 'report', $7, $8,
        'request-report-1', $9, '{"reportNumber":7}'),
       ($2, '2026-07-29T02:00:00Z', 'project.created', $10, 'project', $11, $12,
        'request-project-1', $13, '{}'),
       ($3, '2026-07-29T01:00:00Z', 'user.signed_up', $14, 'user', $15, NULL,
        NULL, $16, '{"method":"email_otp"}'),
       ($4, '2026-07-29T00:30:00Z', 'project.created', $17, 'project', $18, $19,
        NULL, $20, '{}'),
       ($5, '2026-07-29T00:00:00Z', 'user.signed_up', NULL, 'user', NULL, NULL,
        NULL, 'user.signed_up:deleted', '{"method":"email_otp"}')`,
    [
      reportEventId,
      projectEventId,
      signupEventId,
      deletedProjectEventId,
      deletedUserEventId,
      actorId,
      reportId,
      projectId,
      `report.created:${reportId}`,
      actorId,
      projectId,
      projectId,
      `project.created:${projectId}`,
      actorId,
      actorId,
      `user.signed_up:${actorId}`,
      actorId,
      deletedProjectId,
      deletedProjectId,
      `project.created:${deletedProjectId}`,
    ],
  );
}, 120_000);

afterAll(async () => {
  await db?.end();
  await fx?.stop();
}, 60_000);

describe('GET /admin/activity', () => {
  it('requires an authenticated admin', async () => {
    const app = createApp();
    const anonymous = await app.request('/admin/activity');
    expect(anonymous.status).toBe(401);

    const token = await signTestToken(regularId, regularSessionId);
    const regular = await app.request('/admin/activity', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(regular.status).toBe(403);
  });

  it('returns display-ready events newest first without caching', async () => {
    const response = await createApp().request('/admin/activity?limit=2', {
      headers: await adminHeaders(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = activitySchemas.listResponse.parse(await response.json());
    expect(body.items.map((item) => item.id)).toEqual([
      reportEventId,
      projectEventId,
    ]);
    expect(body.nextCursor).toBeTruthy();
    expect(body.items[0]).toMatchObject({
      occurredAt: '2026-07-29T03:00:00.000Z',
      eventType: 'report.created',
      actorUserId: actorId,
      actorLabel: 'Alice Activity',
      actorEmail: 'alice-activity@example.com',
      subjectId: reportId,
      subjectLabel: 'Report #7',
      projectId,
      projectLabel: 'Tower Refurbishment',
      requestId: 'request-report-1',
      metadata: { reportNumber: 7 },
    });
  });

  it('uses a stable cursor and deleted-entity fallbacks', async () => {
    const first = activitySchemas.listResponse.parse(
      await (
        await createApp().request('/admin/activity?limit=3', {
          headers: await adminHeaders(),
        })
      ).json(),
    );
    const secondResponse = await createApp().request(
      `/admin/activity?limit=3&cursor=${encodeURIComponent(first.nextCursor!)}`,
      { headers: await adminHeaders() },
    );
    expect(secondResponse.status).toBe(200);
    const second = activitySchemas.listResponse.parse(
      await secondResponse.json(),
    );

    expect(first.items.map((item) => item.id)).toEqual([
      reportEventId,
      projectEventId,
      signupEventId,
    ]);
    expect(second.items.map((item) => item.id)).toEqual([
      deletedProjectEventId,
      deletedUserEventId,
    ]);
    expect(second.nextCursor).toBeNull();
    expect(second.items[0]).toMatchObject({
      subjectId: deletedProjectId,
      subjectLabel: 'Deleted project',
      projectId: deletedProjectId,
      projectLabel: 'Deleted project',
    });
    expect(second.items[1]).toMatchObject({
      actorUserId: null,
      actorLabel: 'Deleted user',
      actorEmail: null,
      subjectId: null,
      subjectLabel: 'Deleted user',
    });
  });

  it('applies event, actor, project, and time filters', async () => {
    const headers = await adminHeaders();
    const queries = [
      `eventType=report.created`,
      `actorUserId=${actorId}`,
      `projectId=${projectId}`,
      `from=2026-07-29T01%3A30%3A00Z&to=2026-07-29T02%3A30%3A00Z`,
    ];

    const ids: string[][] = [];
    for (const query of queries) {
      const response = await createApp().request(`/admin/activity?${query}`, {
        headers,
      });
      expect(response.status).toBe(200);
      const body = activitySchemas.listResponse.parse(await response.json());
      ids.push(body.items.map((item) => item.id));
    }

    expect(ids).toEqual([
      [reportEventId],
      [
        reportEventId,
        projectEventId,
        signupEventId,
        deletedProjectEventId,
      ],
      [reportEventId, projectEventId],
      [projectEventId],
    ]);
  });

  it('rejects a malformed cursor', async () => {
    const response = await createApp().request(
      '/admin/activity?cursor=not-a-valid-cursor',
      { headers: await adminHeaders() },
    );
    expect(response.status).toBe(400);
  });
});
