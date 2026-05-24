/**
 * LLM usage observability sink.
 *
 * One row per call routed through `services/ai.ts`. Read path lives in
 * `auth/service.ts::fetchUsage`; the chokepoint write path is
 * `withUsageAccounting` in `services/ai.ts`.
 *
 * RLS (`llm_usage_events_self_insert`) enforces `user_id =
 * current_setting('app.user_id')` independently of the chokepoint —
 * the recorder receives a scoped db handle from the route via
 * `LlmUsageContext.db`, so an INSERT routed under a forged user_id
 * never lands (Pitfall 6).
 */
import { sql } from 'drizzle-orm';
import type { ScopedDb } from '../db/scope.js';
import { newId } from '../lib/ids.js';

export type LlmOperation = 'chat' | 'transcribe' | 'generate_report';
export type LlmFixtureMode = 'live' | 'replay' | 'record';
export type LlmUsageStatus = 'ok' | 'error';

/**
 * Token-count convention by operation:
 *   chat / generate_report
 *     - `input_tokens`  = prompt tokens (incl. cached portion)
 *     - `output_tokens` = completion tokens
 *     - `cached_tokens` = subset of `input_tokens` that hit the
 *                         provider's prompt cache (0 if vendor does
 *                         not report it).
 *   transcribe
 *     - `input_tokens`  = ceil(audio seconds)  ← Whisper-class
 *                         endpoints bill by audio duration, not
 *                         tokens; storing seconds here keeps the
 *                         column non-zero so dashboards/aggregations
 *                         pick the call up. Conversion is set by
 *                         `services/ai.ts::transcribe`.
 *     - `output_tokens` = 0
 *     - `cached_tokens` = 0
 */
export interface RecordLlmUsageParams {
  userId: string;
  projectId?: string | null;
  reportId?: string | null;
  vendor: string;
  model: string;
  operation: LlmOperation;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  fixtureMode: LlmFixtureMode;
  status: LlmUsageStatus;
}

/**
 * Insert one usage event. Uses raw SQL (rather than `db.insert(...)`)
 * to keep the call cheap and avoid coupling the recorder to the
 * drizzle schema object — the route's scoped db handle is what
 * enforces RLS user_id, not the column list.
 */
export async function recordLlmUsage(
  db: ScopedDb,
  params: RecordLlmUsageParams,
): Promise<void> {
  const id = newId('lue');
  await db.execute(sql`
    INSERT INTO app.llm_usage_events (
      id, user_id, project_id, report_id,
      vendor, model, operation,
      input_tokens, output_tokens, cached_tokens,
      latency_ms, fixture_mode, status
    ) VALUES (
      ${id}, ${params.userId}, ${params.projectId ?? null}, ${params.reportId ?? null},
      ${params.vendor}, ${params.model}, ${params.operation}::app.llm_operation,
      ${params.inputTokens}, ${params.outputTokens}, ${params.cachedTokens},
      ${params.latencyMs}, ${params.fixtureMode}::app.llm_fixture_mode,
      ${params.status}::app.llm_usage_status
    )
  `);
}
