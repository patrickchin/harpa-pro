/**
 * Defense-in-depth role scope for project content writes.
 *
 * Route guards are the first authorization boundary. These tests exercise
 * Postgres directly so a missed guard still cannot turn viewer membership
 * into project-content write access.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import pg from 'pg';

import { getPool, resetPool } from '../../db/client.js';
import { withScopedConnection } from '../../db/scope.js';
import {
  makeFileId,
  makeNoteId,
  makeProjectId,
  makeReportId,
  makeSessionId,
  makeUserId,
} from '../factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from '../setup-pg.js';

let fx: PgFixture;
let viewerId: string;
let viewerSessionId: string;
let projectId: string;
let reportId: string;
let viewerNoteId: string;
let viewerProjectFileId: string;
let viewerPersonalFileId: string;

async function asViewer<T>(
  run: Parameters<typeof withScopedConnection<T>>[1],
): Promise<T> {
  return withScopedConnection(
    { sub: viewerId, sid: viewerSessionId },
    run,
  );
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  const ownerId = makeUserId();
  viewerId = makeUserId();
  viewerSessionId = makeSessionId();
  projectId = makeProjectId();
  reportId = makeReportId();
  viewerNoteId = makeNoteId();
  viewerProjectFileId = makeFileId();
  viewerPersonalFileId = makeFileId();

  await seedAuthUsers(fx.url, [{ id: ownerId }, { id: viewerId }]);

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO app.projects(id, name, owner_id)
       VALUES ($1, 'Viewer policy project', $2)`,
      [projectId, ownerId],
    );
    await admin.query(
      `INSERT INTO app.project_members(project_id, user_id, role)
       VALUES ($1, $2, 'owner'), ($1, $3, 'viewer')`,
      [projectId, ownerId, viewerId],
    );
    await admin.query(
      `INSERT INTO app.reports(id, project_id, author_id, number)
       VALUES ($1, $2, $3, 1)`,
      [reportId, projectId, ownerId],
    );
    await admin.query(
      `INSERT INTO app.notes(id, report_id, author_id, kind, body)
       VALUES ($1, $2, $3, 'text', 'legacy viewer note')`,
      [viewerNoteId, reportId, viewerId],
    );
    await admin.query(
      `INSERT INTO app.files(
         id, owner_id, kind, file_key, size_bytes, content_type,
         project_id, report_id
       )
       VALUES ($1, $2, 'image', $3, 128, 'image/jpeg', $4, $5)`,
      [
        viewerProjectFileId,
        viewerId,
        `projects/${projectId}/reports/${reportId}/${viewerProjectFileId}.jpg`,
        projectId,
        reportId,
      ],
    );
    await admin.query(
      `INSERT INTO app.files(
         id, owner_id, kind, file_key, size_bytes, content_type
       )
       VALUES ($1, $2, 'image', $3, 128, 'image/jpeg')`,
      [
        viewerPersonalFileId,
        viewerId,
        `users/${viewerId}/avatar/${viewerPersonalFileId}.jpg`,
      ],
    );
  } finally {
    await admin.end();
  }
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('scope: viewer project-content writes', () => {
  it('cannot update project metadata directly', async () => {
    const changed = await asViewer(async (db) => {
      const result = await db.execute<{ id: string }>(sql`
        UPDATE app.projects
        SET name = 'Viewer changed this'
        WHERE id = ${projectId}
        RETURNING id
      `);
      return result.rows.length;
    });

    expect(changed).toBe(0);
  });

  it('cannot insert, update, or delete reports directly', async () => {
    const insertedId = makeReportId();
    await expect(
      asViewer((db) =>
        db.execute(sql`
          INSERT INTO app.reports(id, project_id, author_id, number)
          VALUES (${insertedId}, ${projectId}, ${viewerId}, 99)
        `),
      ),
    ).rejects.toBeTruthy();

    const changed = await asViewer(async (db) => {
      const updated = await db.execute<{ id: string }>(sql`
        UPDATE app.reports
        SET visit_date = now()
        WHERE id = ${reportId}
        RETURNING id
      `);
      const deleted = await db.execute<{ id: string }>(sql`
        DELETE FROM app.reports
        WHERE id = ${reportId}
        RETURNING id
      `);
      return { updated: updated.rows.length, deleted: deleted.rows.length };
    });

    expect(changed).toEqual({ updated: 0, deleted: 0 });
  });

  it('cannot insert or mutate even their own legacy project note', async () => {
    const insertedId = makeNoteId();
    await expect(
      asViewer((db) =>
        db.execute(sql`
          INSERT INTO app.notes(id, report_id, author_id, kind, body)
          VALUES (
            ${insertedId},
            ${reportId},
            ${viewerId},
            'text',
            'viewer insert'
          )
        `),
      ),
    ).rejects.toBeTruthy();

    const changed = await asViewer(async (db) => {
      const updated = await db.execute<{ id: string }>(sql`
        UPDATE app.notes
        SET body = 'viewer update'
        WHERE id = ${viewerNoteId}
        RETURNING id
      `);
      const deleted = await db.execute<{ id: string }>(sql`
        DELETE FROM app.notes
        WHERE id = ${viewerNoteId}
        RETURNING id
      `);
      return { updated: updated.rows.length, deleted: deleted.rows.length };
    });

    expect(changed).toEqual({ updated: 0, deleted: 0 });
  });

  it('cannot attach a file to their own legacy project note', async () => {
    await expect(
      asViewer((db) =>
        db.execute(sql`
          INSERT INTO app.note_files(
            id, note_id, file_id, position
          )
          VALUES (
            'nfl_viewer_scope',
            ${viewerNoteId},
            ${viewerProjectFileId},
            0
          )
        `),
      ),
    ).rejects.toBeTruthy();
  });

  it('cannot insert or mutate project files, but retains personal-file ownership', async () => {
    const insertedId = makeFileId();
    await expect(
      asViewer((db) =>
        db.execute(sql`
          INSERT INTO app.files(
            id, owner_id, kind, file_key, size_bytes, content_type,
            project_id, report_id
          )
          VALUES (
            ${insertedId},
            ${viewerId},
            'image',
            ${`projects/${projectId}/reports/${reportId}/${insertedId}.jpg`},
            128,
            'image/jpeg',
            ${projectId},
            ${reportId}
          )
        `),
      ),
    ).rejects.toBeTruthy();

    const changed = await asViewer(async (db) => {
      const projectUpdate = await db.execute<{ id: string }>(sql`
        UPDATE app.files
        SET size_bytes = 256
        WHERE id = ${viewerProjectFileId}
        RETURNING id
      `);
      const projectDelete = await db.execute<{ id: string }>(sql`
        DELETE FROM app.files
        WHERE id = ${viewerProjectFileId}
        RETURNING id
      `);
      const personalUpdate = await db.execute<{ id: string }>(sql`
        UPDATE app.files
        SET size_bytes = 256
        WHERE id = ${viewerPersonalFileId}
        RETURNING id
      `);
      return {
        projectUpdate: projectUpdate.rows.length,
        projectDelete: projectDelete.rows.length,
        personalUpdate: personalUpdate.rows.length,
      };
    });

    expect(changed).toEqual({
      projectUpdate: 0,
      projectDelete: 0,
      personalUpdate: 1,
    });
  });
});
