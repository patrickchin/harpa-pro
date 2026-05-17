/**
 * Negative-control journey: A and B both real-log-in. A creates a
 * project + report + note. B's token (issued by the same /auth/otp/verify
 * code path) must 404 on every one of A's resources, NOT 403, NOT 200.
 *
 * Belt-and-braces over the per-resource `*.scope.test.ts` suite: this
 * proves the full middleware chain (auth → withScopedConnection → RLS)
 * actually composes when tokens come from the real issuer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../app.js';
import { bootJourneyPg, teardownJourneyPg, login, type JourneyFixture } from './_login.js';

let j: JourneyFixture;
beforeAll(async () => { j = await bootJourneyPg(); }, 240_000);
afterAll(async () => { await teardownJourneyPg(j); }, 60_000);

describe('journey: cross-user scope is 404 everywhere', () => {
  it("B cannot read or mutate A's project/report/note", async () => {
    const app = createApp();
    const a = await login(app, '+15550199601');
    const b = await login(app, '+15550199602');

    const project = (await (await app.request('/projects', {
      method: 'POST', headers: a.headers, body: JSON.stringify({ name: 'Private' }),
    })).json()) as { id: string };
    const report = (await (await app.request(`/projects/${project.id}/reports`, {
      method: 'POST', headers: a.headers,
      body: JSON.stringify({ visitDate: '2026-05-15T08:00:00.000Z' }),
    })).json()) as { id: string };
    const note = (await (await app.request(`/reports/${report.id}/notes`, {
      method: 'POST', headers: a.headers, body: JSON.stringify({ kind: 'text', body: 'secret' }),
    })).json()) as { id: string };

    expect((await app.request(`/projects/${project.id}`, { headers: b.headers })).status).toBe(404);
    expect((await app.request(`/projects/${project.id}/reports`, { headers: b.headers })).status).toBe(404);
    expect((await app.request(`/reports/${report.id}`, { headers: b.headers })).status).toBe(404);
    expect((await app.request(`/reports/${report.id}/notes`, { headers: b.headers })).status).toBe(404);

    const list = await app.request('/projects', { headers: b.headers });
    expect(list.status).toBe(200);
    const items = ((await list.json()) as { items: Array<{ id: string }> }).items;
    expect(items.find((p) => p.id === project.id)).toBeUndefined();

    expect((await app.request(`/projects/${project.id}`, {
      method: 'PATCH', headers: b.headers, body: JSON.stringify({ name: 'pwn' }),
    })).status).toBe(404);
    expect((await app.request(`/reports/${report.id}`, { method: 'DELETE', headers: b.headers })).status).toBe(404);
    expect((await app.request(`/notes/${note.id}`, { method: 'DELETE', headers: b.headers })).status).toBe(404);
  });
});
