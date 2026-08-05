/**
 * Real Node HTTP adapter coverage for report finalization.
 *
 * `app.request()` constructs body-less POST requests with `Request.body ===
 * null`. `@hono/node-server` represents the same zero-byte HTTP request as an
 * empty stream, so this suite must go through an actual listening socket.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serve, type ServerType } from '@hono/node-server';
import pg from 'pg';
import { createApp } from '../app.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeProjectId, makeReportId, makeSessionId, makeUserId } from './factories/index.js';
import { seedAuthUsers, startPg, type PgFixture } from './setup-pg.js';

let fx: PgFixture;
let server: ServerType;
let origin: string;
let ownerToken: string;
let outsiderToken: string;
let projectSlug: string;
let reportVersions: string[];

const reportBody = {
  meta: {
    title: 'Node HTTP finalize regression',
    summary: 'Exercises zero-byte JSON requests through the deployed adapter.',
    visitDate: null,
  },
  weather: null,
  workers: [],
  materials: [],
  issues: [],
  nextSteps: [],
  summarySections: [],
};

async function startNodeServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server = serve(
      {
        fetch: createApp().fetch,
        hostname: '127.0.0.1',
        port: 0,
      },
      (info) => {
        origin = `http://127.0.0.1:${info.port}`;
        resolve();
      },
    );
    server.once('error', reject);
  });
}

async function stopNodeServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function finalizePath(reportNumber: number): string {
  return `/projects/${projectSlug}/reports/${reportNumber}/finalize`;
}

function jsonHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

async function reportStatus(reportNumber: number): Promise<string> {
  const result = await getPool().query<{ status: string }>(
    `SELECT status::text AS status
       FROM app.reports
      WHERE project_id = $1 AND number = $2`,
    [projectSlug, reportNumber],
  );
  return result.rows[0]?.status ?? 'missing';
}

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  delete process.env.AI_LIVE;
  await resetPool();
  getPool(fx.url);

  const ownerId = makeUserId();
  const outsiderId = makeUserId();
  projectSlug = makeProjectId();
  await seedAuthUsers(fx.url, [{ id: ownerId }, { id: outsiderId }]);

  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO app.projects(id, name, owner_id)
       VALUES ($1, 'Node HTTP finalize project', $2)`,
      [projectSlug, ownerId],
    );
    await admin.query(
      `INSERT INTO app.project_members(project_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [projectSlug, ownerId],
    );

    const versions: string[] = [];
    for (let number = 1; number <= 5; number += 1) {
      const result = await admin.query<{ updated_at: Date }>(
        `INSERT INTO app.reports(id, project_id, author_id, number, body)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING updated_at`,
        [makeReportId(), projectSlug, ownerId, number, JSON.stringify(reportBody)],
      );
      const updatedAt = result.rows[0]?.updated_at;
      if (!updatedAt) throw new Error(`Report ${number} was not seeded.`);
      versions.push(updatedAt.toISOString());
    }
    await admin.query(
      `UPDATE app.reports
          SET status = 'finalized', finalized_at = now()
        WHERE project_id = $1 AND number = 5`,
      [projectSlug],
    );
    reportVersions = versions;
  } finally {
    await admin.end();
  }

  ownerToken = await signTestToken(ownerId, makeSessionId());
  outsiderToken = await signTestToken(outsiderId, makeSessionId());
  await startNodeServer();
}, 120_000);

afterAll(async () => {
  await stopNodeServer();
  await fx?.stop();
}, 60_000);

describe('report finalize through @hono/node-server', () => {
  it('accepts an owner JSON POST with zero body bytes', async () => {
    const response = await fetch(`${origin}${finalizePath(1)}`, {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: '',
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      report: { status: string; finalizedAt: string | null };
    };
    expect(payload.report.status).toBe('finalized');
    expect(payload.report.finalizedAt).not.toBeNull();
  });

  it('preserves resource-hiding 404 for a cross-user zero-byte JSON POST', async () => {
    const response = await fetch(`${origin}${finalizePath(2)}`, {
      method: 'POST',
      headers: jsonHeaders(outsiderToken),
      body: '',
    });

    expect(response.status).toBe(404);
    expect(await reportStatus(2)).toBe('draft');
  });

  it('keeps a non-empty optimistic-concurrency body valid', async () => {
    const response = await fetch(`${origin}${finalizePath(3)}`, {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ expectedUpdatedAt: reportVersions[2] }),
    });

    expect(response.status).toBe(200);
    expect(await reportStatus(3)).toBe('finalized');
  });

  it('continues to reject malformed non-empty JSON without mutating the report', async () => {
    const response = await fetch(`${origin}${finalizePath(4)}`, {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(await reportStatus(4)).toBe('draft');
  });

  it('accepts a zero-byte JSON POST when an owner reopens a finalized report', async () => {
    const response = await fetch(`${origin}/projects/${projectSlug}/reports/5/unfinalize`, {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: '',
    });

    expect(response.status).toBe(200);
    expect(await reportStatus(5)).toBe('draft');
  });
});
