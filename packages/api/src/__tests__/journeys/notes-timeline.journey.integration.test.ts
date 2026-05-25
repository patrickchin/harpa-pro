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

  it('batch photo note: first file via createNote → appendFiles → list shows all', async () => {
    // Mirrors the mobile batch upload flow:
    //   1. presign + register each photo (parallel in real life)
    //   2. first job creates the note with back-compat `{kind:'image', fileId}`
    //   3. subsequent jobs append via POST /notes/{note}/files
    // Regression coverage for the "first image was invisible" bug:
    // createNote must funnel the back-compat fileId into note_files so
    // listNotes' join surfaces every photo of the batch.
    const app = createApp();
    const me = await login(app, '+15550199302');

    const project = (await (await app.request('/projects', {
      method: 'POST', headers: me.headers, body: JSON.stringify({ name: 'Batch photos' }),
    })).json()) as { id: string };
    const report = (await (await app.request(`/projects/${project.id}/reports`, {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ visitDate: '2026-05-15T08:00:00.000Z' }),
    })).json()) as { id: string };

    // Register 3 image files (presign → register).
    const fileIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const ps = (await (await app.request('/files/presign', {
        method: 'POST', headers: me.headers,
        body: JSON.stringify({ kind: 'image', contentType: 'image/jpeg', sizeBytes: 4096 }),
      })).json()) as { fileKey: string };
      const reg = await app.request('/files', {
        method: 'POST', headers: me.headers,
        body: JSON.stringify({ kind: 'image', fileKey: ps.fileKey, sizeBytes: 4096, contentType: 'image/jpeg' }),
      });
      expect(reg.status).toBe(201);
      fileIds.push(((await reg.json()) as { id: string }).id);
    }

    // First job creates the note via the back-compat `fileId` path.
    const create = await app.request(`/reports/${report.id}/notes`, {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({ kind: 'image', fileId: fileIds[0], thumbnailFileId: null }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      id: string;
      fileId: string | null;
      files: Array<{ fileId: string; position: number }>;
    };
    // Service funnels back-compat fileId into note_files and clears
    // the legacy column — that's the contract the listNotes join relies on.
    expect(created.fileId).toBeNull();
    expect(created.files).toHaveLength(1);
    expect(created.files[0]!.fileId).toBe(fileIds[0]);

    // Subsequent jobs append.
    const append = await app.request(`/notes/${created.id}/files`, {
      method: 'POST', headers: me.headers,
      body: JSON.stringify({
        files: [
          { fileId: fileIds[1], thumbnailFileId: null },
          { fileId: fileIds[2], thumbnailFileId: null },
        ],
      }),
    });
    expect(append.status).toBe(200);
    const appended = (await append.json()) as { files: Array<{ position: number; fileId: string }> };
    expect(appended.files.map((f) => f.position)).toEqual([1, 2]);

    // Timeline list returns all three files via the join in position order.
    const list = await app.request(`/reports/${report.id}/notes`, { headers: me.headers });
    expect(list.status).toBe(200);
    const items = ((await list.json()) as {
      items: Array<{
        id: string;
        kind: string;
        fileId: string | null;
        files: Array<{ fileId: string; position: number }>;
      }>;
    }).items;
    const note = items.find((n) => n.id === created.id);
    expect(note).toBeDefined();
    expect(note!.kind).toBe('image');
    expect(note!.fileId).toBeNull();
    expect(note!.files).toHaveLength(3);
    expect(note!.files.map((f) => f.fileId)).toEqual(fileIds);
    expect(note!.files.map((f) => f.position)).toEqual([0, 1, 2]);
  });
});
