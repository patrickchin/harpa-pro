/**
 * LLM token accounting service (be-2 / plan-p3 §P3.15.5).
 *
 * Single sink for every chat / transcribe / generate_report call. The
 * `recordLlmUsage` helper is called from services/ai.ts after every
 * provider invocation (including ones that returned an error — we want
 * to capture vendor latency + the model that was attempted for cost
 * postmortems). Errors from this writer must never bubble out: usage
 * accounting is observability, not a business invariant. Log + swallow.
 *
 * RLS: the underlying table forces `user_id = current_setting('app.user_id')`
 * via `llm_usage_events_self_insert`, so callers cannot accidentally
 * record a row against another user even with a bug in the chokepoint.
 *
 * Read paths (/me/usage in be-3) consume this table directly; we don't
 * eagerly aggregate. The `(user_id, created_at desc)` index keeps
 * monthly window queries cheap up to the volumes a single user ships.
 */
import { sql } from 'drizzle-orm';
import type { Vendor } from '@harpa/ai-fixtures';
import type { ScopedDb } from '../db/scope.js';
import { newId } from '../lib/ids.js';

type Db = ScopedDb;

export type LlmOperation = 'chat' | 'transcribe' | 'generate_report';
export type LlmFixtureMode = 'replay' | 'record' | 'live';
export type LlmCallStatus = 'ok' | 'error';

export interface LlmUsageRecord {
  userId: string;
  projectId?: string | null;
  reportId?: string | null;
  vendor: Vendor;
  model: string;
  operation: LlmOperation;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  latencyMs?: number;
  fixtureMode: LlmFixtureMode;
  status?: LlmCallStatus;
}

/**
 * Persist one usage row. Returns the new row id on success, null on
 * failure (the writer never throws — token accounting must not break
 * the user-facing request that produced it).
 *
 * The Pitfall 13 integration test exercises the default wiring end to
 * end (chat → ai.ts → recordLlmUsage → SELECT row) so a regression
 * here surfaces as a hard test failure, not a silent zeroing of usage.
 */
export async function recordLlmUsage(
  db: Db,
  record: LlmUsageRecord,
): Promise<string | null> {
  const id = newId('lue');
  try {
    await db.execute(sql`
      INSERT INTO app.llm_usage_events (
        id, user_id, project_id, report_id,
        vendor, model, operation,
        input_tokens, output_tokens, cached_tokens,
        latency_ms, fixture_mode, status
      ) VALUES (
        ${id},
        ${record.userId},
        ${record.projectId ?? null},
        ${record.reportId ?? null},
        ${record.vendor},
        ${record.model},
        ${record.operation},
        ${record.inputTokens ?? 0},
        ${record.outputTokens ?? 0},
        ${record.cachedTokens ?? 0},
        ${record.latencyMs ?? null},
        ${record.fixtureMode},
        ${record.status ?? 'ok'}
      )
    `);
    return id;
  } catch (err) {
    // Observability sink — never break the call site. A logged failure
    // is recoverable (re-run accounting query against vendor logs); a
    // thrown error here would mask the success of the user's request.
    console.error('[ai-usage] recordLlmUsage failed', {
      userId: record.userId,
      vendor: record.vendor,
      operation: record.operation,
      err,
    });
    return null;
  }
}
