/**
 * Pitfall 13 (default-wiring) integration test for be-2 LLM token
 * accounting. Exercises the full chokepoint without stubs: hits
 * /voice/summarize and /voice/transcribe through the real route ->
 * services/ai.ts -> @harpa/ai-fixtures -> recordLlmUsage -> Postgres,
 * then asserts an `app.llm_usage_events` row exists with the expected
 * shape for the authenticated user.
 *
 * The fixture-replay vendor for the summarize chokepoint records a
 * `usage` block; we assert input/output tokens > 0 to prove the wiring
 * threads usage data end to end (a stubbed default would zero them).
 *
 * Refs: docs/v4/pitfalls.md §13, plan-p3 §P3.15.5.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../app.js';
import { startPg, type PgFixture } from './setup-pg.js';
import { resetPool, getPool } from '../db/client.js';
import { signTestToken } from '../middleware/auth.js';
import { makeUserId, makeSessionId, makeFileId } from './factories/index.js';

let fx: PgFixture;
let alice: string;
let aliceSid: string;
let aliceFile: string;

beforeAll(async () => {
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  process.env.R2_FIXTURE_MODE = 'replay';
  delete process.env.AI_LIVE;
  await resetPool();
  getPool(fx.url);
  alice = makeUserId();
  aliceSid = makeSessionId();
  aliceFile = makeFileId();
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  await admin.query(
    `INSERT INTO auth.users(id, phone) VALUES ($1, $2)`,
    [alice, '+15551400090'],
  );
  await admin.query(
    `INSERT INTO auth.sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
    [aliceSid, alice],
  );
  await admin.query(
    `INSERT INTO app.files(id, owner_id, kind, file_key, size_bytes, content_type)
     VALUES ($1, $2, 'voice', $3, 1024, 'audio/m4a')`,
    [aliceFile, alice, `users/${alice}/voice/usage-voice.m4a`],
  );
  await admin.end();
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

const headers = (tok: string) => ({
  authorization: `Bearer ${tok}`,
  'content-type': 'application/json',
});

interface UsageRow {
  id: string;
  user_id: string;
  vendor: string;
  model: string;
  operation: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number | null;
  fixture_mode: string;
  status: string;
}

async function selectUsage(userId: string, operation: string): Promise<UsageRow[]> {
  const admin = new pg.Client({ connectionString: fx.url });
  await admin.connect();
  try {
    const res = await admin.query<UsageRow>(
      `SELECT id, user_id, vendor, model, operation,
              input_tokens, output_tokens, total_tokens,
              latency_ms, fixture_mode, status
       FROM app.llm_usage_events
       WHERE user_id = $1 AND operation = $2
       ORDER BY created_at DESC`,
      [userId, operation],
    );
    return res.rows;
  } finally {
    await admin.end();
  }
}

describe('llm_usage_events default wiring (Pitfall 13)', () => {
  it('summarize records a chat row with non-zero token counts', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/summarize', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ transcript: 'anything — replay normalises the prompt.' }),
    });
    expect(res.status).toBe(200);

    const rows = await selectUsage(alice, 'chat');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[0]!;
    expect(row.user_id).toBe(alice);
    expect(row.vendor).toBe('openai');
    expect(row.operation).toBe('chat');
    expect(row.status).toBe('ok');
    expect(row.fixture_mode).toBe('replay');
    // The summarize.voice-1 fixture carries a recorded usage block — if
    // these are zero the chokepoint is no longer threading usage data
    // (likely a stubbed factory).
    expect(row.input_tokens).toBeGreaterThan(0);
    expect(row.output_tokens).toBeGreaterThan(0);
    expect(row.total_tokens).toBe(row.input_tokens + row.output_tokens);
    expect(row.latency_ms).not.toBeNull();
    expect(row.latency_ms!).toBeGreaterThanOrEqual(0);
  });

  it('transcribe records a transcribe row (zero tokens is OK — whisper class)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/voice/transcribe', {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fileId: aliceFile }),
    });
    expect(res.status).toBe(200);

    const rows = await selectUsage(alice, 'transcribe');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[0]!;
    expect(row.user_id).toBe(alice);
    expect(row.operation).toBe('transcribe');
    expect(row.vendor).toBe('openai');
    expect(row.model).toBe('whisper-1');
    expect(row.status).toBe('ok');
    expect(row.fixture_mode).toBe('replay');
  });

  it('/me/usage reflects recorded LLM events (be-3 aggregation)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/me/usage', { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      byModel: Array<{
        vendor: string;
        model: string;
        operation: string;
        calls: number;
        tokens: { input: number; output: number; total: number };
      }>;
      totals: {
        calls: number;
        tokens: { input: number; output: number; total: number };
      };
    };
    // At minimum: the chat row from the summarize test above.
    expect(body.totals.calls).toBeGreaterThanOrEqual(2);
    expect(body.totals.tokens.input).toBeGreaterThan(0);
    expect(body.totals.tokens.output).toBeGreaterThan(0);
    expect(body.totals.tokens.total).toBe(
      body.totals.tokens.input + body.totals.tokens.output,
    );
    const chatRow = body.byModel.find((m) => m.operation === 'chat');
    expect(chatRow).toBeTruthy();
    expect(chatRow!.tokens.total).toBeGreaterThan(0);
    const transcribeRow = body.byModel.find((m) => m.operation === 'transcribe');
    expect(transcribeRow).toBeTruthy();
    expect(transcribeRow!.calls).toBeGreaterThanOrEqual(1);
  });
});
