import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import {
  makeFileId,
  makeProjectId,
  makeReportId,
  makeSessionId,
  makeUserId,
} from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;
let admin: pg.Client;
let actorUserId: string;
let actorSessionId: string;
let seededProjectId: string;
let seededReportId: string;
let seededImageFileId: string;
let seededDocumentFileId: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  actorUserId = makeUserId();
  actorSessionId = makeSessionId();
  seededProjectId = makeProjectId();
  seededReportId = makeReportId();
  seededImageFileId = makeFileId();
  seededDocumentFileId = makeFileId();

  await seedAuthUsers(fx.url, [
    {
      id: actorUserId,
      email: 'activity-writer@example.com',
      displayName: 'Activity Writer',
    },
  ]);

  admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id)
     VALUES ($1, 'Seeded activity project', $2)`,
    [seededProjectId, actorUserId],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [seededProjectId, actorUserId],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number)
     VALUES ($1, $2, $3, 99)`,
    [seededReportId, seededProjectId, actorUserId],
  );
  await admin.query(
    `INSERT INTO app.files(
       id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id
     ) VALUES
       ($1, $3, 'image', $4, 1024, 'image/jpeg', $5, $6),
       ($2, $3, 'document', $7, 2048, 'application/pdf', $5, $6)`,
    [
      seededImageFileId,
      seededDocumentFileId,
      actorUserId,
      `activity-writer/${seededImageFileId}.jpg`,
      seededProjectId,
      seededReportId,
      `activity-writer/${seededDocumentFileId}.pdf`,
    ],
  );
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await fx?.stop();
}, 60_000);

async function headers(requestId: string): Promise<Record<string, string>> {
  const token = await signTestToken(actorUserId, actorSessionId);
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-request-id': requestId,
  };
}

describe('business activity writers', () => {
  it('records project.created through the real project route', async () => {
    const app = createApp();
    const response = await app.request('/projects', {
      method: 'POST',
      headers: await headers('rid-project-activity'),
      body: JSON.stringify({ name: 'Activity project' }),
    });

    expect(response.status).toBe(201);
    const project = (await response.json()) as { id: string };
    const event = await admin.query<{
      event_type: string;
      actor_user_id: string;
      subject_id: string;
      project_id: string;
      request_id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT event_type, actor_user_id, subject_id, project_id,
              request_id, metadata
       FROM app.activity_events
       WHERE dedupe_key = $1`,
      [`project.created:${project.id}`],
    );

    expect(event.rows).toEqual([
      {
        event_type: 'project.created',
        actor_user_id: actorUserId,
        subject_id: project.id,
        project_id: project.id,
        request_id: 'rid-project-activity',
        metadata: {},
      },
    ]);
  });

  it('rolls back project creation when activity recording fails', async () => {
    const app = createApp();
    await admin.query('REVOKE INSERT ON app.activity_events FROM app_authenticated');
    try {
      const response = await app.request('/projects', {
        method: 'POST',
        headers: await headers('rid-project-rollback'),
        body: JSON.stringify({ name: 'Must roll back' }),
      });
      expect(response.status).toBe(500);
    } finally {
      await admin.query('GRANT INSERT ON app.activity_events TO app_authenticated');
    }

    const project = await admin.query(`SELECT id FROM app.projects WHERE name = 'Must roll back'`);
    expect(project.rowCount).toBe(0);
  });

  it('records report.created through the real report route', async () => {
    const app = createApp();
    const response = await app.request(`/projects/${seededProjectId}/reports`, {
      method: 'POST',
      headers: await headers('rid-report-activity'),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(201);
    const report = (await response.json()) as {
      id: string;
      number: number;
    };
    const event = await admin.query<{
      event_type: string;
      actor_user_id: string;
      subject_id: string;
      project_id: string;
      request_id: string;
      metadata: { reportNumber: number };
    }>(
      `SELECT event_type, actor_user_id, subject_id, project_id,
              request_id, metadata
       FROM app.activity_events
       WHERE dedupe_key = $1`,
      [`report.created:${report.id}`],
    );

    expect(event.rows).toEqual([
      {
        event_type: 'report.created',
        actor_user_id: actorUserId,
        subject_id: report.id,
        project_id: seededProjectId,
        request_id: 'rid-report-activity',
        metadata: { reportNumber: report.number },
      },
    ]);
  });

  it('rolls back report creation and numbering when activity recording fails', async () => {
    const before = await admin.query<{
      next_report_number: number;
      report_count: string;
    }>(
      `SELECT p.next_report_number,
              (SELECT count(*) FROM app.reports r
               WHERE r.project_id = p.id) AS report_count
       FROM app.projects p
       WHERE p.id = $1`,
      [seededProjectId],
    );

    const app = createApp();
    await admin.query('REVOKE INSERT ON app.activity_events FROM app_authenticated');
    try {
      const response = await app.request(`/projects/${seededProjectId}/reports`, {
        method: 'POST',
        headers: await headers('rid-report-rollback'),
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(500);
    } finally {
      await admin.query('GRANT INSERT ON app.activity_events TO app_authenticated');
    }

    const after = await admin.query<{
      next_report_number: number;
      report_count: string;
    }>(
      `SELECT p.next_report_number,
              (SELECT count(*) FROM app.reports r
               WHERE r.project_id = p.id) AS report_count
       FROM app.projects p
       WHERE p.id = $1`,
      [seededProjectId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it.each([
    {
      kind: 'text',
      eventType: 'note.text_created',
      makeBody: () => ({
        kind: 'text',
        body: 'Private customer observation must not enter activity metadata.',
      }),
    },
    {
      kind: 'image',
      eventType: 'note.image_created',
      makeBody: () => ({
        kind: 'image',
        files: [{ fileId: seededImageFileId }],
        title: 'Restricted site photo',
      }),
    },
    {
      kind: 'document',
      eventType: 'note.document_created',
      makeBody: () => ({
        kind: 'document',
        fileId: seededDocumentFileId,
        title: 'Confidential variation.pdf',
      }),
    },
  ])(
    'records $eventType through the real $kind note route with minimal metadata',
    async ({ eventType, makeBody }) => {
      const body = makeBody();
      const requestId = `rid-${body.kind}-note-activity`;
      const app = createApp();
      const response = await app.request(`/reports/${seededReportId}/notes`, {
        method: 'POST',
        headers: await headers(requestId),
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(201);
      const note = (await response.json()) as { id: string };
      const event = await admin.query<{
        event_type: string;
        actor_user_id: string;
        subject_type: string;
        subject_id: string;
        project_id: string;
        request_id: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT event_type, actor_user_id, subject_type, subject_id,
                project_id, request_id, metadata
         FROM app.activity_events
         WHERE dedupe_key = $1`,
        [`${eventType}:${note.id}`],
      );

      expect(event.rows).toEqual([
        {
          event_type: eventType,
          actor_user_id: actorUserId,
          subject_type: 'note',
          subject_id: note.id,
          project_id: seededProjectId,
          request_id: requestId,
          metadata: {},
        },
      ]);
    },
  );

  it('rolls back note creation and report counters when activity recording fails', async () => {
    const uniqueBody = 'Must roll back with its activity event';
    const before = await admin.query<{
      note_count: string;
      notes_since_last_generation: number;
      notes_changed_at: Date | null;
    }>(
      `SELECT
         (SELECT count(*) FROM app.notes WHERE report_id = r.id) AS note_count,
         notes_since_last_generation,
         notes_changed_at
       FROM app.reports r
       WHERE id = $1`,
      [seededReportId],
    );

    const app = createApp();
    await admin.query('REVOKE INSERT ON app.activity_events FROM app_authenticated');
    let response: Response;
    try {
      response = await app.request(`/reports/${seededReportId}/notes`, {
        method: 'POST',
        headers: await headers('rid-note-rollback'),
        body: JSON.stringify({ kind: 'text', body: uniqueBody }),
      });
    } finally {
      await admin.query('GRANT INSERT ON app.activity_events TO app_authenticated');
    }

    const after = await admin.query<{
      note_count: string;
      notes_since_last_generation: number;
      notes_changed_at: Date | null;
    }>(
      `SELECT
         (SELECT count(*) FROM app.notes WHERE report_id = r.id) AS note_count,
         notes_since_last_generation,
         notes_changed_at
       FROM app.reports r
       WHERE id = $1`,
      [seededReportId],
    );

    expect(response!.status).toBe(500);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
