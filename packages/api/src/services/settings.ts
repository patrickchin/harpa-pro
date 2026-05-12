/**
 * Settings service — per-user AI provider preference.
 * Self-only RLS in app.user_settings is the access control;
 * upsert keys on user_id which is always the caller.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';

type Db = NodePgDatabase<typeof schema>;

export type AiVendor = 'kimi' | 'openai' | 'anthropic' | 'google' | 'zai' | 'deepseek';
export interface AiSettings {
  vendor: AiVendor;
  model: string;
}

const DEFAULTS: AiSettings = { vendor: 'openai', model: 'gpt-4o-mini' };

export async function getAiSettings(db: Db, userId: string): Promise<AiSettings> {
  const r = await db.execute<{ ai_vendor: AiVendor; ai_model: string }>(sql`
    SELECT ai_vendor, ai_model FROM app.user_settings WHERE user_id = ${userId}::uuid LIMIT 1
  `);
  const row = r.rows[0];
  return row ? { vendor: row.ai_vendor, model: row.ai_model } : DEFAULTS;
}

export async function updateAiSettings(
  db: Db,
  userId: string,
  patch: Partial<AiSettings>,
): Promise<AiSettings> {
  const next: AiSettings = {
    vendor: patch.vendor ?? (await getAiSettings(db, userId)).vendor,
    model: patch.model ?? (await getAiSettings(db, userId)).model,
  };
  await db.execute(sql`
    INSERT INTO app.user_settings(user_id, ai_vendor, ai_model)
    VALUES (${userId}::uuid, ${next.vendor}, ${next.model})
    ON CONFLICT (user_id) DO UPDATE SET
      ai_vendor = EXCLUDED.ai_vendor,
      ai_model = EXCLUDED.ai_model,
      updated_at = now()
  `);
  return next;
}
