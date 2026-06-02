/**
 * Pitfall 13 (default-wiring) integration test for the voice-note
 * aggregator (`POST /reports/:report/notes/voice`).
 *
 * What this asserts that nothing else does:
 *   1. The route hits the REAL `services/ai.ts` chokepoint (no DI
 *      stub) end-to-end via fixture replay → records BOTH a
 *      `transcribe` and a `chat` row in `app.llm_usage_events`
 *      attributed to the same (projectId, reportId, userId).
 *      A stubbed default wiring would record zero or wrong-scope rows.
 *   2. The `app.notes` row is inserted with the joint
 *      `transcribe_provider` string, populated `transcribed_at`, and
 *      `body` mirrored from `summary` so legacy readers keep working.
 *   3. `Idempotency-Key: voice:<fileId>:<reportId>` deduplicates
 *      retries — same noteId returned and no new usage events created.
 *   4. RLS hides cross-project reports (404) and cross-owner files
 *      (404). Non-voice kinds are rejected with 400.
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D1, §D2, §D9 ; pitfalls §13.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, seedAuthUsers, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import {
  makeUserId,
  makeSessionId,
  makeFileId,
  makeProjectId,
  makeReportId,
} from './factories/index.js';

let fx: PgFixture;
let alice: string;
let aliceSid: string;
let bob: string;
let bobSid: string;
let aliceProject: string;
let aliceReport: string;
let aliceVoiceFile: string;
let aliceImageFile: string;
let bobProject: string;
let bobReport: string;
let bobVoiceFile: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  delete process.env.AI_LIVE;
  await resetPool();
  getPool(fx.url);

  alice = makeUserId();
  bob = makeUserId();
  aliceSid = makeSessionId();
  bobSid = makeSessionId();
  aliceProject = makeProjectId();
  bobProject = makeProjectId();
  aliceReport = makeReportId();
  bobReport = makeReportId();
  aliceVoiceFile = makeFileId();
  aliceImageFile = makeFileId();
  bobVoiceFile = makeFileId();

  await seedAuthUsers(fx.url, [{ id: alice }, { id: bob }]);
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO app.projects(id, name, owner_id) VALUES ($1, 'AliceProj', $2), ($3, 'BobProj', $4)`,
    [aliceProject, alice, bobProject, bob],
  );
  await admin.query(
    `INSERT INTO app.project_members(project_id, user_id, role) VALUES
       ($1, $2, 'owner'),
       ($3, $4, 'owner')`,
    [aliceProject, alice, bobProject, bob],
  );
  await admin.query(
    `INSERT INTO app.reports(id, project_id, author_id, number) VALUES
       ($1, $2, $3, 1),
       ($4, $5, $6, 1)`,
    [aliceReport, aliceProject, alice, bobReport, bobProject, bob],
  );
  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type) VALUES
       ($1, $2, 'voice', $3, 2048, 'audio/m4a'),
       ($4, $2, 'image', $5, 1024, 'image/jpeg'),
       ($6, $7, 'voice', $8, 2048, 'audio/m4a')`,
    [
      aliceVoiceFile,
      alice,
      `users/${alice}/voice/agg-alice.m4a`,
      aliceImageFile,
      `users/${alice}/image/agg-alice.jpg`,
      bobVoiceFile,
      bob,
      `users/${bob}/voice/agg-bob.m4a`,
    ],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string, idempKey?: string) => {
  const h: Record<string, string> = {
    authorization: `Bearer ${tok}`,
    'content-type': 'application/json',
  };
  if (idempKey) h['Idempotency-Key'] = idempKey;
  return h;
};

interface UsageRow {
  vendor: string;
  model: string;
  operation: string;
  project_id: string | null;
  report_id: string | null;
  user_id: string;
  input_tokens: number;
  output_tokens: number;
  input_seconds: string | null;
}

async function selectUsageForReport(reportId: string): Promise<UsageRow[]> {
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  try {
    const res = await admin.query<UsageRow>(
      `SELECT vendor, model, operation, project_id, report_id, user_id,
              input_tokens, output_tokens, input_seconds
       FROM app.llm_usage_events
       WHERE report_id = $1
       ORDER BY created_at ASC`,
      [reportId],
    );
    return res.rows;
  } finally {
    await admin.end();
  }
}

async function countNotes(reportId: string): Promise<number> {
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  try {
    const res = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM app.notes WHERE report_id = $1 AND kind = 'voice'`,
      [reportId],
    );
    return Number(res.rows[0]!.n);
  } finally {
    await admin.end();
  }
}

describe('POST /reports/:report/notes/voice — aggregator (Pitfall 13)', () => {
  let firstNoteId: string;

  it('happy path: transcribes, summarises, inserts note, records BOTH usage rows scoped to (projectId, reportId, userId)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const idem = `voice:${aliceVoiceFile}:${aliceReport}`;
    const res = await app.request(`/reports/${aliceReport}/notes/voice`, {
      method: 'POST',
      headers: headers(tok, idem),
      body: JSON.stringify({ fileId: aliceVoiceFile, durationSec: 12 }),
    });
    expect(res.status).toBe(201);
    const note = (await res.json()) as {
      id: string;
      kind: string;
      body: string | null;
      title: string | null;
      summary: string | null;
      transcript: string | null;
      transcribedAt: string | null;
      transcribeProvider: string | null;
      durationSec: number | null;
      fileId: string | null;
      authorId: string;
    };
    expect(note.kind).toBe('voice');
    expect(note.authorId).toBe(alice);
    expect(note.fileId).toBe(aliceVoiceFile);
    expect(note.summary).toBeTruthy();
    expect(note.transcript).toBeTruthy();
    // Title now comes from the LLM JSON envelope (or falls back to
    // the heuristic when parsing fails). Either path must yield a
    // non-empty string within the column's 200-char CHECK.
    expect(note.title).toBeTruthy();
    expect(note.title!.length).toBeLessThanOrEqual(200);
    // The replay fixture returns a JSON envelope with title +
    // summary; once parsed, neither field should look like raw JSON.
    expect(note.summary).not.toMatch(/^\s*\{/);
    expect(note.title).not.toMatch(/^\s*\{/);
    // Legacy `body` must mirror `summary` until P3.10 readers migrate.
    expect(note.body).toBe(note.summary);
    expect(note.transcribedAt).toBeTruthy();
    expect(note.durationSec).toBe(12);
    // Joint provider string: "<chatVendor>:<chatModel>+<transcribeVendor>:<transcribeModel>"
    expect(note.transcribeProvider).toMatch(/^[a-z0-9-]+:[\w.-]+\+[a-z0-9-]+:[\w.-]+$/);
    firstNoteId = note.id;

    const rows = await selectUsageForReport(aliceReport);
    expect(rows.length).toBe(2);
    const ops = rows.map((r) => r.operation).sort();
    expect(ops).toEqual(['chat', 'transcribe']);
    for (const r of rows) {
      expect(r.user_id).toBe(alice);
      expect(r.project_id).toBe(aliceProject);
      expect(r.report_id).toBe(aliceReport);
    }
    // P3.15.5 + token-unit fix: transcribe rows store the audio
    // duration in `input_seconds` (numeric), NOT in `input_tokens`.
    // voice-1 fixture is 315.2s → input_seconds ≈ 315.2.
    const transcribeRow = rows.find((r) => r.operation === 'transcribe')!;
    expect(transcribeRow.input_tokens).toBe(0);
    expect(transcribeRow.output_tokens).toBe(0);
    expect(transcribeRow.input_seconds).not.toBeNull();
    expect(Number(transcribeRow.input_seconds)).toBeGreaterThan(0);
  });

  it('Idempotency-Key dedupes retries: same noteId, no new usage rows', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const idem = `voice:${aliceVoiceFile}:${aliceReport}`;
    const before = await selectUsageForReport(aliceReport);
    const beforeNotes = await countNotes(aliceReport);

    const res = await app.request(`/reports/${aliceReport}/notes/voice`, {
      method: 'POST',
      headers: headers(tok, idem),
      body: JSON.stringify({ fileId: aliceVoiceFile, durationSec: 12 }),
    });
    expect(res.status).toBe(201);
    const note = (await res.json()) as { id: string };
    expect(note.id).toBe(firstNoteId);

    const after = await selectUsageForReport(aliceReport);
    const afterNotes = await countNotes(aliceReport);
    expect(after.length).toBe(before.length);
    expect(afterNotes).toBe(beforeNotes);
  });

  it('404 when caller cannot see the report (RLS, Pitfall 6)', async () => {
    const app = createApp();
    const tok = await signTestToken(bob, bobSid);
    // Bob attempting to attach his own file to Alice's report.
    const res = await app.request(`/reports/${aliceReport}/notes/voice`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: bobVoiceFile }),
    });
    expect(res.status).toBe(404);
  });

  it('404 when fileId belongs to another owner (files RLS)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${aliceReport}/notes/voice`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: bobVoiceFile }),
    });
    expect(res.status).toBe(404);
  });

  it('400 when file kind is not voice', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request(`/reports/${aliceReport}/notes/voice`, {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: aliceImageFile }),
    });
    expect(res.status).toBe(400);
  });

  it('401 without auth', async () => {
    const app = createApp();
    const res = await app.request(`/reports/${aliceReport}/notes/voice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileId: aliceVoiceFile }),
    });
    expect(res.status).toBe(401);
  });
});
