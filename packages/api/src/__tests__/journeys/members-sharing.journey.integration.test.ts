/**
 * Journey: A and B both real-log-in → A creates project → A invites B by
 * phone → B can read project → A removes B → B now 404s.
 *
 * Closes the per-request-scope chain end-to-end: invite path resolves
 * B's userId from auth.users by phone, RLS on app.project_members lets B
 * see the project, removal flips RLS visibility back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../app.js';
import { bootJourneyPg, teardownJourneyPg, login, type JourneyFixture } from './_login.js';

let j: JourneyFixture;
beforeAll(async () => { j = await bootJourneyPg(); }, 240_000);
afterAll(async () => { await teardownJourneyPg(j); }, 60_000);

describe('journey: members sharing', () => {
  it('owner invites by phone, member reads, owner removes, member 404s', async () => {
    const app = createApp();
    const owner = await login(app, '+15550199401');
    const member = await login(app, '+15550199402');

    const project = (await (await app.request('/projects', {
      method: 'POST', headers: owner.headers, body: JSON.stringify({ name: 'Shared' }),
    })).json()) as { id: string };

    expect((await app.request(`/projects/${project.id}`, { headers: member.headers })).status).toBe(404);

    const inv = await app.request(`/projects/${project.id}/members`, {
      method: 'POST', headers: owner.headers,
      body: JSON.stringify({ phone: member.phone, role: 'editor' }),
    });
    expect(inv.status).toBe(201);
    const memberRow = (await inv.json()) as { userId: string; role: string };
    expect(memberRow.userId).toBe(member.userId);
    expect(memberRow.role).toBe('editor');

    const get = await app.request(`/projects/${project.id}`, { headers: member.headers });
    expect(get.status).toBe(200);

    const tryRemove = await app.request(`/projects/${project.id}/members/${owner.userId}`, {
      method: 'DELETE', headers: member.headers,
    });
    expect(tryRemove.status).toBe(403);

    expect((await app.request(`/projects/${project.id}/members/${member.userId}`, {
      method: 'DELETE', headers: owner.headers,
    })).status).toBe(204);

    expect((await app.request(`/projects/${project.id}`, { headers: member.headers })).status).toBe(404);
  });
});
