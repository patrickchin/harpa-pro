/**
 * Journey: login → project → report → add note → generate → finalize →
 * pdf → delete. Exercises the report state machine + AI fixture replay
 * + PDF storage round-trip end-to-end on a real OTP-issued token.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../app.js';
import { bootJourneyPg, teardownJourneyPg, login, type JourneyFixture } from './_login.js';

let j: JourneyFixture;
beforeAll(async () => { j = await bootJourneyPg(); }, 240_000);
afterAll(async () => { await teardownJourneyPg(j); }, 60_000);

describe('journey: report AI lifecycle', () => {
  it('generate → finalize → pdf signed url, then 409 on regenerate', async () => {
    const app = createApp();
    const me = await login(app, '+15550199201');

    const project = (await (await app.request('/projects', {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ name: 'AI lifecycle' }),
    })).json()) as { id: string };

    const report = (await (await app.request(`/projects/${project.id}/reports`, {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ visitDate: '2026-05-15T08:00:00.000Z' }),
    })).json()) as { id: string };

    await app.request(`/reports/${report.id}/notes`, {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ kind: 'text', body: 'foundation poured at 8am' }),
    });

    const gen = await app.request(`/reports/${report.id}/generate`, {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ fixtureName: 'generate-report.full' }),
    });
    expect(gen.status).toBe(200);
    const genBody = (await gen.json()) as { report: { status: string; body: unknown } };
    expect(genBody.report.body).toBeTruthy();

    const fin = await app.request(`/reports/${report.id}/finalize`, { method: 'POST', headers: me.headers });
    expect(fin.status).toBe(200);
    const finBody = (await fin.json()) as { report: { status: string } };
    expect(finBody.report.status).toBe('finalized');

    const re = await app.request(`/reports/${report.id}/regenerate`, {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ fixtureName: 'generate-report.full' }),
    });
    expect(re.status).toBe(409);

    const pdf = await app.request(`/reports/${report.id}/pdf`, { method: 'POST', headers: me.headers });
    expect(pdf.status).toBe(200);
    const pdfBody = (await pdf.json()) as { url: string; expiresAt: string };
    expect(pdfBody.url).toMatch(/^https?:\/\//);
    expect(Date.parse(pdfBody.expiresAt)).toBeGreaterThan(Date.now() - 1000);

    expect((await app.request(`/reports/${report.id}`, { method: 'DELETE', headers: me.headers })).status).toBe(204);
    expect((await app.request(`/projects/${project.id}`, { method: 'DELETE', headers: me.headers })).status).toBe(204);
  });
});
