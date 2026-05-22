/**
 * LLM usage accounting.
 *
 * `recordUsage()` writes a single row to `app.llm_usage_events`
 * each time a provider call resolves successfully. Callers pass the
 * (project_id, report_id, user_id) scope so a single voice-note
 * aggregator invocation records two rows (`transcribe` + `chat`)
 * against the same tuple — closing the v3 spend-attribution blind
 * spot.
 *
 * Insertion happens under the per-request scoped Postgres role so
 * the RLS policy `llm_usage_events_self_insert` enforces
 * `user_id = current_setting('app.user_id')`.
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D9, docs/v4/pitfalls.md §13.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { newId } from '../lib/ids.js';

type Db = NodePgDatabase<typeof schema>;

export type UsageOperation = 'chat' | 'transcribe' | 'generate-report';

export interface UsageContext {
  userId: string;
  projectId?: string | null;
  reportId?: string | null;
}

export interface RecordUsageInput extends UsageContext {
  vendor: string;
  model: string;
  operation: UsageOperation;
}

export async function recordUsage(db: Db, input: RecordUsageInput): Promise<void> {
  const id = newId('lue');
  await db.execute(sql`
    INSERT INTO app.llm_usage_events
      (id, user_id, project_id, report_id, vendor, model, operation)
    VALUES
      (${id}, ${input.userId}, ${input.projectId ?? null},
       ${input.reportId ?? null}, ${input.vendor}, ${input.model},
       ${input.operation})
  `);
}
