/**
 * Settings service — per-user AI provider preference.
 *
 * Two states are representable:
 *   - {vendor: null, model: null}   → user has not picked; live calls
 *                                     use LIVE_DEFAULT_MODELS (see
 *                                     services/ai.ts).
 *   - {vendor: 'openai', model: …}  → user picked; live calls use it.
 *
 * Replay-mode hashes are unaffected — they always use FIXTURE_CANONICALS
 * regardless of this row.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { HTTPException } from 'hono/http-exception';
import { settings as settingsSchemas } from '@harpa/api-contract';
import * as schema from '../db/schema.js';

type Db = NodePgDatabase<typeof schema>;

export type AiVendor = settingsSchemas.AiVendor;

export interface AiSettings {
  vendor: AiVendor | null;
  model: string | null;
}

export async function getAiSettings(db: Db, userId: string): Promise<AiSettings> {
  const r = await db.execute<{ ai_vendor: AiVendor | null; ai_model: string | null }>(sql`
    SELECT ai_vendor, ai_model FROM app.user_settings WHERE user_id = ${userId} LIMIT 1
  `);
  const row = r.rows[0];
  if (!row) return { vendor: null, model: null };
  // Tolerate legacy values: any vendor not in the current whitelist
  // (e.g. an old kimi row) is reported as null so callers fall back
  // to the live default. We deliberately don't auto-rewrite the row.
  if (!settingsSchemas.isValidAiSelection({ vendor: row.ai_vendor as AiVendor | null, model: row.ai_model })) {
    return { vendor: null, model: null };
  }
  return { vendor: row.ai_vendor, model: row.ai_model };
}

export async function updateAiSettings(
  db: Db,
  userId: string,
  patch: AiSettings,
): Promise<AiSettings> {
  if (!settingsSchemas.isValidAiSelection(patch)) {
    throw new HTTPException(400, { message: 'invalid_model' });
  }
  await db.execute(sql`
    INSERT INTO app.user_settings(user_id, ai_vendor, ai_model)
    VALUES (${userId}, ${patch.vendor}, ${patch.model})
    ON CONFLICT (user_id) DO UPDATE SET
      ai_vendor = EXCLUDED.ai_vendor,
      ai_model = EXCLUDED.ai_model,
      updated_at = now()
  `);
  return patch;
}
