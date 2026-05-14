/**
 * Journey: login → /files/presign → register → GET /files/:id/url.
 * Verifies the default-wiring storage path (FixtureStorage in tests)
 * round-trips a real OTP-issued token through the full upload contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../../app.js';
import { bootJourneyPg, teardownJourneyPg, login, type JourneyFixture } from './_login.js';

let j: JourneyFixture;
beforeAll(async () => { j = await bootJourneyPg(); }, 240_000);
afterAll(async () => { await teardownJourneyPg(j); }, 60_000);

describe('journey: files upload round-trip', () => {
  it('presign → register → signed GET URL', async () => {
    const app = createApp();
    const me = await login(app, '+15550199501');

    const presign = await app.request('/files/presign', {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ kind: 'image', contentType: 'image/jpeg', sizeBytes: 4096 }),
    });
    expect(presign.status).toBe(200);
    const ps = (await presign.json()) as { uploadUrl: string; fileKey: string };
    expect(ps.fileKey.startsWith(`users/${me.userId}/image/`)).toBe(true);

    const reg = await app.request('/files', {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ kind: 'image', fileKey: ps.fileKey, sizeBytes: 4096, contentType: 'image/jpeg' }),
    });
    expect(reg.status).toBe(201);
    const file = (await reg.json()) as { id: string; fileKey: string };
    expect(file.fileKey).toBe(ps.fileKey);

    const url = await app.request(`/files/${file.id}/url`, { headers: me.headers });
    expect(url.status).toBe(200);
    const body = (await url.json()) as { url: string; expiresAt: string };
    expect(body.url).toMatch(/^https?:\/\//);
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now() - 1000);

    const dup = await app.request('/files', {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ kind: 'image', fileKey: ps.fileKey, sizeBytes: 4096, contentType: 'image/jpeg' }),
    });
    expect(dup.status).toBe(409);

    const bad = await app.request('/files', {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({
        kind: 'image',
        fileKey: 'users/00000000-0000-0000-0000-000000000000/image/x.jpg',
        sizeBytes: 1, contentType: 'image/jpeg',
      }),
    });
    expect(bad.status).toBe(400);
  });
});
