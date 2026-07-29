import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { rawDb, getPool, resetPool } from '../db/client.js';
import { withScopedConnection } from '../db/scope.js';
import { recordActivityEvent } from '../services/activity-events.js';
import { makeSessionId, makeUserId } from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;
let actorUserId: string;
let otherUserId: string;
let actorSessionId: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  actorUserId = makeUserId();
  otherUserId = makeUserId();
  actorSessionId = makeSessionId();
  await seedAuthUsers(fx.url, [
    { id: actorUserId, displayName: 'Activity Actor' },
    { id: otherUserId, displayName: 'Other Actor' },
  ]);
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

describe('activity event storage', () => {
  it('records only curated metadata and deduplicates creation events', async () => {
    const projectId = 'prj_01234567';
    const input = {
      eventType: 'project.created' as const,
      actorUserId,
      subjectId: projectId,
      projectId,
      requestId: 'req-project-created',
      dedupeKey: `project.created:${projectId}`,
      metadata: {},
    };

    await recordActivityEvent(rawDb(), input);
    await recordActivityEvent(rawDb(), input);

    const result = await rawDb().execute<{
      id: string;
      event_type: string;
      actor_user_id: string;
      subject_type: string;
      subject_id: string;
      project_id: string;
      request_id: string;
      metadata: Record<string, unknown>;
    }>(sql`
      SELECT id, event_type, actor_user_id, subject_type, subject_id,
             project_id, request_id, metadata
      FROM app.activity_events
      WHERE dedupe_key = ${input.dedupeKey}
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      event_type: 'project.created',
      actor_user_id: actorUserId,
      subject_type: 'project',
      subject_id: projectId,
      project_id: projectId,
      request_id: 'req-project-created',
      metadata: {},
    });
    expect(result.rows[0]?.id).toMatch(/^aud_[0-9a-hjkmnp-tv-z]{12}$/);
  });

  it('lets a scoped actor insert their own event but not read the table', async () => {
    const projectId = 'prj_12345678';

    await withScopedConnection({ sub: actorUserId, sid: actorSessionId }, async (db) => {
      await recordActivityEvent(db, {
        eventType: 'project.created',
        actorUserId,
        subjectId: projectId,
        projectId,
        requestId: null,
        dedupeKey: `project.created:${projectId}`,
        metadata: {},
      });
    });

    await expect(
      withScopedConnection({ sub: actorUserId, sid: actorSessionId }, async (db) => {
        await db.execute(sql`SELECT id FROM app.activity_events`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects a scoped insert attributed to another user', async () => {
    const projectId = 'prj_23456789';

    await expect(
      withScopedConnection({ sub: actorUserId, sid: actorSessionId }, async (db) => {
        await recordActivityEvent(db, {
          eventType: 'project.created',
          actorUserId: otherUserId,
          subjectId: projectId,
          projectId,
          requestId: null,
          dedupeKey: `project.created:${projectId}`,
          metadata: {},
        });
      }),
    ).rejects.toThrow(/row-level security|permission denied/i);
  });

  it('rejects metadata outside the event-specific schema', async () => {
    await expect(
      recordActivityEvent(rawDb(), {
        eventType: 'report.created',
        actorUserId,
        subjectId: 'rpt_01234567',
        projectId: 'prj_3456789a',
        requestId: null,
        dedupeKey: 'report.created:rpt_01234567',
        metadata: { reportNumber: 0 },
      }),
    ).rejects.toThrow();
  });
});
