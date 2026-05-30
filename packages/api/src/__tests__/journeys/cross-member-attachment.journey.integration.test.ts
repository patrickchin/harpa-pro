/**
 * Journey: alice creates a project + invites bob + creates a report,
 * alice uploads a `scope='project'` voice file, bob (different bearer)
 * can read it AND can transcribe it. Carol (no membership) cannot do
 * either — both surfaces 404.
 *
 * End-to-end coverage that the migration-0011 cross-member read /
 * voice-transcribe RLS holds through real OTP-issued tokens, not just
 * test-signed ones. Mirrors `files-upload.journey.integration.test.ts`
 * for shape.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../app.js';
import { bootJourneyPg, teardownJourneyPg, login, type JourneyFixture } from './_login.js';

let j: JourneyFixture;
beforeAll(async () => { j = await bootJourneyPg(); }, 240_000);
afterAll(async () => { await teardownJourneyPg(j); }, 60_000);

describe('journey: cross-member project file attachment', () => {
  it('owner uploads, member reads + transcribes, outsider 404s', async () => {
    const app = createApp();
    const alice = await login(app, '+15550199601');
    const bob = await login(app, '+15550199602');
    const carol = await login(app, '+15550199603');

    const project = (await (await app.request('/projects', {
      method: 'POST', headers: alice.headers, body: JSON.stringify({ name: 'Shared site' }),
    })).json()) as { id: string };

    expect((await app.request(`/projects/${project.id}/members`, {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ phone: bob.phone, role: 'editor' }),
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

    // Member bob reads the signed URL + can transcribe.
    const bobUrl = await app.request(`/files/${file.id}/url`, { headers: bob.headers });
    expect(bobUrl.status).toBe(200);

    const bobTr = await app.request('/voice/transcribe', {
      method: 'POST', headers: bob.headers,
      body: JSON.stringify({ fileId: file.id }),
    });
    expect(bobTr.status).toBe(200);

    // Non-member carol — both surfaces 404.
    const carolUrl = await app.request(`/files/${file.id}/url`, { headers: carol.headers });
    expect(carolUrl.status).toBe(404);

    const carolTr = await app.request('/voice/transcribe', {
      method: 'POST', headers: carol.headers,
      body: JSON.stringify({ fileId: file.id }),
    });
    expect(carolTr.status).toBe(404);
  });
});
