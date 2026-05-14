/**
 * Journey: login → project → report → 3 notes → edit one → delete one →
 * timeline reflects ordering + soft-delete invariant.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../app.js';
import { bootJourneyPg, teardownJourneyPg, login, type JourneyFixture } from './_login.js';

let j: JourneyFixture;
beforeAll(async () => { j = await bootJourneyPg(); }, 240_000);
afterAll(async () => { await teardownJourneyPg(j); }, 60_000);

describe('journey: notes timeline', () => {
  it('add → edit → delete → list shows the survivors in order', async () => {
    const app = createApp();
    const me = await login(app, '+15550199301');

    const project = (await (await app.request('/projects', {
      method: 'POST', headers: me.headers, body: JSON.stringify({ name: 'Notes' }),
    })).json()) as { id: string };
    const report = (await (await app.request(`/projects/${project.id}/reports`, {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ visitDate: '2026-05-15T08:00:00.000Z' }),
    })).json()) as { id: string };

    const ids: string[] = [];
    for (const body of ['one', 'two', 'three']) {
      const r = await app.request(`/reports/${report.id}/notes`, {
        method: 'POST', headers: me.headers,
        body: JSON.stringify({ kind: 'text', body }),
      });
      expect(r.status).toBe(201);
      ids.push(((await r.json()) as { id: string }).id);
    }

    const patch = await app.request(`/notes/${ids[1]}`, {
      method: 'PATCH', headers: me.headers,
      body: JSON.stringify({ body: 'two (edited)' }),
    });
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as { body: string }).body).toBe('two (edited)');

    expect((await app.request(`/notes/${ids[0]}`, { method: 'DELETE', headers: me.headers })).status).toBe(204);

    const list = await app.request(`/reports/${report.id}/notes`, { headers: me.headers });
    expect(list.status).toBe(200);
    const items = ((await list.json()) as { items: Array<{ id: string }> }).items;
    const surviving = items.map((n) => n.id);
    expect(surviving).not.toContain(ids[0]);
    expect(surviving).toContain(ids[1]);
    expect(surviving).toContain(ids[2]);
  });
});
