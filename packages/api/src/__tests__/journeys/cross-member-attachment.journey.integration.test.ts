/**
 * Journey: alice creates a project + invites bob + creates a report,
 * alice uploads a `scope='project'` voice file, bob (different bearer)
 * can read it but cannot transcribe it because he is not the uploader.
 * Carol (no membership) cannot do either — all denials surface as 404.
 *
 * End-to-end coverage that migration-0011 grants cross-member reads while
 * the standalone transcription route's uploader guard rejects the same
 * member-visible file. Uses real OTP-issued tokens, not test-signed ones.
 * Mirrors `files-upload.journey.integration.test.ts` for shape.
 */
import { FixtureStore } from '@harpa/ai-fixtures';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createApp } from '../../app.js';
import { getPool } from '../../db/client.js';
import { FixtureStorage } from '../../services/storage.js';
import { bootJourneyPg, teardownJourneyPg, login, type JourneyFixture } from './_login.js';

let j: JourneyFixture;
beforeAll(async () => { j = await bootJourneyPg(); }, 240_000);
afterAll(async () => { await teardownJourneyPg(j); }, 60_000);
afterEach(() => { vi.restoreAllMocks(); });

async function countUsageEvents(userId: string): Promise<number> {
  const result = await getPool().query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM app.llm_usage_events
      WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

describe('journey: cross-member project file attachment', () => {
  it('owner uploads, member reads but cannot transcribe, outsider 404s', async () => {
    // Observational spies retain the default fixture implementations: this
    // journey still exercises the normal route wiring while proving the
    // ownership rejection happens before URL minting or fixture-provider IO.
    const signGetSpy = vi.spyOn(FixtureStorage.prototype, 'signGet');
    const fixtureReadSpy = vi.spyOn(FixtureStore.prototype, 'read');
    const app = createApp();
    const alice = await login(app, '+15550199601');
    const bob = await login(app, '+15550199602');
    const carol = await login(app, '+15550199603');

    const project = (await (await app.request('/projects', {
      method: 'POST', headers: alice.headers, body: JSON.stringify({ name: 'Shared site' }),
    })).json()) as { id: string };

    expect((await app.request(`/projects/${project.id}/members`, {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ email: bob.email, role: 'editor' }),
    })).status).toBe(201);

    const report = (await (await app.request(`/projects/${project.id}/reports`, {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ visitDate: '2026-06-01T08:00:00.000Z' }),
    })).json()) as { id: string };

    const presign = await app.request('/files/presign', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({
        scope: 'project',
        projectId: project.id,
        reportId: report.id,
        kind: 'voice',
        contentType: 'audio/m4a',
        sizeBytes: 2048,
      }),
    });
    expect(presign.status).toBe(200);
    const ps = (await presign.json()) as { fileKey: string };
    expect(ps.fileKey.startsWith(`projects/${project.id}/reports/${report.id}/`)).toBe(true);

    const reg = await app.request('/files', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({
        scope: 'project',
        projectId: project.id,
        reportId: report.id,
        kind: 'voice',
        fileKey: ps.fileKey,
        sizeBytes: 2048,
        contentType: 'audio/m4a',
      }),
    });
    expect(reg.status).toBe(201);
    const file = (await reg.json()) as { id: string };

    // Project membership grants attachment visibility, not permission to
    // submit another uploader's recording to the transcription provider.
    const bobUrl = await app.request(`/files/${file.id}/url`, { headers: bob.headers });
    expect(bobUrl.status).toBe(200);

    const signedUrlCallsBefore = signGetSpy.mock.calls.length;
    const fixtureReadsBefore = fixtureReadSpy.mock.calls.length;
    const bobUsageBefore = await countUsageEvents(bob.userId);
    const bobTr = await app.request('/voice/transcribe', {
      method: 'POST', headers: bob.headers,
      body: JSON.stringify({ fileId: file.id }),
    });
    expect(bobTr.status).toBe(404);
    expect(await bobTr.json()).toEqual(
      expect.objectContaining({
        error: { code: 'not_found', message: 'File not found.' },
      }),
    );
    expect(signGetSpy).toHaveBeenCalledTimes(signedUrlCallsBefore);
    expect(fixtureReadSpy).toHaveBeenCalledTimes(fixtureReadsBefore);
    expect(await countUsageEvents(bob.userId)).toBe(bobUsageBefore);

    // Non-member carol — both surfaces 404.
    const carolUrl = await app.request(`/files/${file.id}/url`, { headers: carol.headers });
    expect(carolUrl.status).toBe(404);

    const carolTr = await app.request('/voice/transcribe', {
      method: 'POST', headers: carol.headers,
      body: JSON.stringify({ fileId: file.id }),
    });
    expect(carolTr.status).toBe(404);
    expect(signGetSpy).toHaveBeenCalledTimes(signedUrlCallsBefore);
    expect(fixtureReadSpy).toHaveBeenCalledTimes(fixtureReadsBefore);
    expect(await countUsageEvents(carol.userId)).toBe(0);
  });
});
