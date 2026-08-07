import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { activity as activitySchemas } from '@harpa/api-contract';
import { createApp } from '../app.js';
import { getAdminPool, resetAdminPool } from '../db/admin-client.js';
import { getPool, resetPool } from '../db/client.js';
import { ADMIN_SESSION_COOKIE_NAME } from '../lib/admin-cookie.js';
import { resetAdminRateLimiter, setAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { newId } from '../lib/ids.js';
import {
  MemoryRateLimiter,
  resetRateLimiter,
  setRateLimiter,
  type RateLimiter,
  type RateLimiterResult,
} from '../lib/rateLimiter.js';
import { signTestToken } from '../middleware/auth.js';
import { setAdminPassword } from '../services/admin-auth.js';
import {
  makeNoteId,
  makeProjectId,
  makeReportId,
  makeSessionId,
  makeUserId,
} from './factories/index.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3102';
const ADMIN_EMAIL = 'activity-list@harpapro.com';
const ADMIN_PASSWORD = 'activity list admin password deliberately long';

let fx: PgFixture;
let adminFx: AdminPgFixture;
let db: pg.Client;
let adminCookie: string;
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

class RecordingRateLimiter implements RateLimiter {
  readonly calls: Array<{
    key: string;
    limit: number;
    windowMs: number;
  }> = [];

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimiterResult> {
    this.calls.push({ key, limit, windowMs });
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - 1),
      reset: Date.now() + windowMs,
    };
  }
}

class FailingAppRateLimiter implements RateLimiter {
  calls = 0;

  async consume(): Promise<RateLimiterResult> {
    this.calls += 1;
    throw new Error('application database limiter must not run');
  }
}

class OneActivityRequestRateLimiter extends MemoryRateLimiter {
  override consume(key: string, _limit: number, windowMs: number) {
    const limit = key.startsWith('admin.activity.read.1m:') ? 1 : 120;
    return super.consume(key, limit, windowMs);
  }
}

class OneRequestRateLimiter extends MemoryRateLimiter {
  override consume(key: string, _limit: number, windowMs: number) {
    return super.consume(key, 1, windowMs);
  }
}

async function adminHeaders(): Promise<Record<string, string>> {
  return {
    cookie: adminCookie,
    origin: ADMIN_ORIGIN,
  };
}

beforeAll(async () => {
  [fx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = fx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  await resetAdminPool();
  getPool(fx.url);
  getAdminPool(adminFx.url);
  resetRateLimiter();

  regularId = makeUserId();
  actorId = makeUserId();
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

  await setAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  const login = await createApp().request('/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ADMIN_ORIGIN,
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });
  if (login.status !== 200) {
    throw new Error(`dedicated admin login failed with ${login.status}`);
  }
  const setCookie = login.headers.get('set-cookie');
  if (!setCookie) throw new Error('dedicated admin login did not set a cookie');
  adminCookie = setCookie.split(';')[0]!;
}, 120_000);

afterAll(async () => {
  await db?.end();
  await Promise.all([fx?.stop(), adminFx?.stop()]);
}, 60_000);

beforeEach(() => {
  resetRateLimiter();
  resetAdminRateLimiter();
});

describe('GET /admin/activity', () => {
  it('requires a dedicated authenticated admin', async () => {
    const app = createApp();
    const anonymous = await app.request('/admin/activity');
    expect(anonymous.status).toBe(401);

    const token = await signTestToken(regularId, regularSessionId);
    const regular = await app.request('/admin/activity', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(regular.status).toBe(401);
  });

  it('returns display-ready events newest first without caching', async () => {
    const response = await createApp().request('/admin/activity?limit=2', {
      headers: await adminHeaders(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = activitySchemas.listResponse.parse(await response.json());
    expect(body.items.map((item) => item.id)).toEqual([reportEventId, projectEventId]);
    expect(body.nextCursor).toBeTruthy();
    expect(body.items[0]).toMatchObject({
      occurredAt: '2026-07-29T03:00:00.000Z',
      level: 'milestone',
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

  it('reports live entities named like deleted fallbacks as available', async () => {
    const liveUserId = makeUserId();
    const liveProjectId = makeProjectId();
    const liveEventId = newId('aud');

    await seedAuthUsers(fx.url, [
      {
        id: liveUserId,
        email: 'deleted-label-live@example.com',
        displayName: 'Deleted user',
      },
    ]);

    try {
      await db.query(
        `INSERT INTO app.projects(id, name, owner_id)
         VALUES ($1, 'Deleted project', $2)`,
        [liveProjectId, liveUserId],
      );
      await db.query(
        `INSERT INTO app.activity_events
           (id, occurred_at, event_type, actor_user_id, subject_type, subject_id,
            project_id, request_id, dedupe_key, metadata)
         VALUES
           ($1, '2026-07-29T03:30:00Z', 'project.created', $2, 'project', $3::text, $3,
            'request-live-reserved-labels', $4, '{}')`,
        [liveEventId, liveUserId, liveProjectId, `project.created:${liveProjectId}`],
      );

      const response = await createApp().request(
        `/admin/activity?actorUserId=${liveUserId}`,
        { headers: await adminHeaders() },
      );
      expect(response.status).toBe(200);
      const rawBody = (await response.json()) as {
        items: Array<Record<string, unknown>>;
        nextCursor: string | null;
      };

      expect(rawBody.items).toHaveLength(1);
      expect(rawBody.items[0]).toMatchObject({
        id: liveEventId,
        actorLabel: 'Deleted user',
        actorState: 'available',
        subjectLabel: 'Deleted project',
        subjectState: 'available',
        projectLabel: 'Deleted project',
        projectState: 'available',
      });
    } finally {
      await db.query(`DELETE FROM app.activity_events WHERE id = $1`, [liveEventId]);
      await db.query(`DELETE FROM app.projects WHERE id = $1`, [liveProjectId]);
      await db.query(`DELETE FROM public."user" WHERE id = $1`, [liveUserId]);
    }
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
    const second = activitySchemas.listResponse.parse(await secondResponse.json());

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
      [reportEventId, projectEventId, signupEventId, deletedProjectEventId],
      [reportEventId, projectEventId],
      [projectEventId],
    ]);
  });

  it('filters milestone, detail, and all activity and returns curated note shapes', async () => {
    const noteIds = {
      text: makeNoteId(),
      voice: makeNoteId(),
      image: makeNoteId(),
      document: makeNoteId(),
    };
    const eventIds = {
      text: newId('aud'),
      voice: newId('aud'),
      image: newId('aud'),
      document: newId('aud'),
    };

    try {
      await db.query(
        `INSERT INTO app.notes (id, report_id, author_id, kind, body)
         VALUES
           ($1, $5, $6, 'text', 'Daily progress'),
           ($2, $5, $6, 'voice', NULL),
           ($3, $5, $6, 'image', NULL),
           ($4, $5, $6, 'document', NULL)`,
        [noteIds.text, noteIds.voice, noteIds.image, noteIds.document, reportId, actorId],
      );
      await db.query(
        `INSERT INTO app.activity_events
           (id, occurred_at, event_type, actor_user_id, subject_type, subject_id,
            project_id, request_id, dedupe_key, metadata)
         VALUES
           ($1, '2026-07-29T07:00:00Z', 'note.text_created', $9, 'note', $5, $10,
            'request-note-text', $11, '{}'),
           ($2, '2026-07-29T06:00:00Z', 'note.voice_created', $9, 'note', $6, $10,
            'request-note-voice', $12, '{}'),
           ($3, '2026-07-29T05:00:00Z', 'note.image_created', $9, 'note', $7, $10,
            'request-note-image', $13, '{}'),
           ($4, '2026-07-29T04:00:00Z', 'note.document_created', $9, 'note', $8, $10,
            'request-note-document', $14, '{}')`,
        [
          eventIds.text,
          eventIds.voice,
          eventIds.image,
          eventIds.document,
          noteIds.text,
          noteIds.voice,
          noteIds.image,
          noteIds.document,
          actorId,
          projectId,
          `note.text_created:${noteIds.text}`,
          `note.voice_created:${noteIds.voice}`,
          `note.image_created:${noteIds.image}`,
          `note.document_created:${noteIds.document}`,
        ],
      );

      const headers = await adminHeaders();
      const milestoneResponse = await createApp().request('/admin/activity?level=milestone', {
        headers,
      });
      const detailResponse = await createApp().request('/admin/activity?level=detail', {
        headers,
      });
      const allResponse = await createApp().request('/admin/activity?level=all', {
        headers,
      });
      const exactVoiceResponse = await createApp().request(
        '/admin/activity?eventType=note.voice_created',
        { headers },
      );

      expect([
        milestoneResponse.status,
        detailResponse.status,
        allResponse.status,
        exactVoiceResponse.status,
      ]).toEqual([200, 200, 200, 200]);

      const milestone = activitySchemas.listResponse.parse(await milestoneResponse.json());
      const detail = activitySchemas.listResponse.parse(await detailResponse.json());
      const all = activitySchemas.listResponse.parse(await allResponse.json());
      const exactVoice = activitySchemas.listResponse.parse(await exactVoiceResponse.json());

      expect(milestone.items.map((item) => item.id)).toEqual([
        reportEventId,
        projectEventId,
        signupEventId,
        deletedProjectEventId,
        deletedUserEventId,
      ]);
      expect(detail.items).toMatchObject([
        {
          id: eventIds.text,
          level: 'detail',
          eventType: 'note.text_created',
          subjectType: 'note',
          subjectId: noteIds.text,
          subjectLabel: 'Text note',
          projectId,
          projectLabel: 'Tower Refurbishment',
          metadata: {},
        },
        {
          id: eventIds.voice,
          level: 'detail',
          eventType: 'note.voice_created',
          subjectType: 'note',
          subjectId: noteIds.voice,
          subjectLabel: 'Voice note',
          metadata: {},
        },
        {
          id: eventIds.image,
          level: 'detail',
          eventType: 'note.image_created',
          subjectType: 'note',
          subjectId: noteIds.image,
          subjectLabel: 'Image note',
          metadata: {},
        },
        {
          id: eventIds.document,
          level: 'detail',
          eventType: 'note.document_created',
          subjectType: 'note',
          subjectId: noteIds.document,
          subjectLabel: 'Document note',
          metadata: {},
        },
      ]);
      expect(all.items.map((item) => item.id)).toEqual([
        eventIds.text,
        eventIds.voice,
        eventIds.image,
        eventIds.document,
        reportEventId,
        projectEventId,
        signupEventId,
        deletedProjectEventId,
        deletedUserEventId,
      ]);
      expect(exactVoice.items).toHaveLength(1);
      expect(exactVoice.items[0]).toMatchObject({
        id: eventIds.voice,
        level: 'detail',
        eventType: 'note.voice_created',
      });
    } finally {
      await db.query(
        `DELETE FROM app.activity_events
          WHERE id IN ($1, $2, $3, $4)`,
        [eventIds.text, eventIds.voice, eventIds.image, eventIds.document],
      );
      await db.query(
        `DELETE FROM app.notes
          WHERE id IN ($1, $2, $3, $4)`,
        [noteIds.text, noteIds.voice, noteIds.image, noteIds.document],
      );
    }
  });

  it('excludes multiple actors while retaining redacted null actors', async () => {
    const regularEventId = newId('aud');
    try {
      await db.query(
        `INSERT INTO app.activity_events
           (id, occurred_at, event_type, actor_user_id, subject_type, subject_id,
            project_id, request_id, dedupe_key, metadata)
         VALUES
           ($1, '2026-07-29T04:00:00Z', 'user.signed_up', $2, 'user', $3,
            NULL, 'request-regular-signup', $4, '{"method":"email_otp"}')`,
        [regularEventId, regularId, regularId, `user.signed_up:${regularId}`],
      );

      const exclusions = encodeURIComponent(`${actorId},${regularId}`);
      const response = await createApp().request(
        `/admin/activity?excludeActorUserIds=${exclusions}`,
        { headers: await adminHeaders() },
      );

      expect(response.status).toBe(200);
      const body = activitySchemas.listResponse.parse(await response.json());
      expect(body.items.map((item) => item.id)).toEqual([deletedUserEventId]);
      expect(body.items[0]).toMatchObject({
        level: 'milestone',
        actorUserId: null,
        actorLabel: 'Deleted user',
      });
    } finally {
      await db.query(`DELETE FROM app.activity_events WHERE id = $1`, [regularEventId]);
    }
  });

  it('rejects a malformed cursor', async () => {
    const response = await createApp().request('/admin/activity?cursor=not-a-valid-cursor', {
      headers: await adminHeaders(),
    });
    expect(response.status).toBe(400);
  });

  it('authenticates before consuming the dedicated activity bucket', async () => {
    const appLimiter = new FailingAppRateLimiter();
    const adminLimiter = new RecordingRateLimiter();
    setRateLimiter(appLimiter);
    setAdminRateLimiter(adminLimiter);

    const anonymous = await Promise.all(
      Array.from({ length: 3 }, () =>
        createApp().request('/admin/activity', {
          headers: { 'fly-client-ip': '203.0.113.90' },
        }),
      ),
    );
    expect(anonymous.map((response) => response.status)).toEqual([401, 401, 401]);
    expect(adminLimiter.calls).toHaveLength(3);
    expect(
      adminLimiter.calls.filter((call) => call.key.startsWith('admin.activity.read.1m:')),
    ).toEqual([]);

    const authenticated = await createApp().request('/admin/activity', {
      headers: {
        ...(await adminHeaders()),
        'fly-client-ip': '203.0.113.90',
      },
    });
    expect(authenticated.status).toBe(200);
    expect(appLimiter.calls).toBe(0);
    expect(adminLimiter.calls).toHaveLength(5);
    expect(adminLimiter.calls[3]).toMatchObject({
      key: 'admin.auth.ip.1m:fn:203.0.113.90',
      limit: 120,
      windowMs: 60_000,
    });
    expect(adminLimiter.calls[4]).toMatchObject({
      limit: 120,
      windowMs: 60_000,
    });
    expect(adminLimiter.calls[4]?.key).toMatch(
      /^admin[.]activity[.]read[.]1m:fn:adm_[^:]+:ads_[^:]+$/,
    );
  });

  it('rate limits repeated invalid-cookie database probes by trusted Fly IP', async () => {
    const appLimiter = new FailingAppRateLimiter();
    setRateLimiter(appLimiter);
    setAdminRateLimiter(new OneRequestRateLimiter());
    const headers = {
      cookie: `${ADMIN_SESSION_COOKIE_NAME}=${'a'.repeat(43)}`,
      'fly-client-ip': '203.0.113.91',
    };

    const rejected = await createApp().request('/admin/activity', { headers });
    const limited = await createApp().request('/admin/activity', { headers });

    expect(rejected.status).toBe(401);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('x-ratelimit-limit')).toBe('1');
    expect(appLimiter.calls).toBe(0);
  });

  it('returns 429 after the authenticated activity bucket is exhausted', async () => {
    const appLimiter = new FailingAppRateLimiter();
    setRateLimiter(appLimiter);
    setAdminRateLimiter(new OneActivityRequestRateLimiter());
    const headers = await adminHeaders();

    const first = await createApp().request('/admin/activity', {
      headers,
    });
    const limited = await createApp().request('/admin/activity', {
      headers,
    });

    expect(first.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('x-ratelimit-limit')).toBe('1');
    expect(appLimiter.calls).toBe(0);
  });
});
