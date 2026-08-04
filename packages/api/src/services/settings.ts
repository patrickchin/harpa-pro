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
import { eq, sql } from 'drizzle-orm';
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
  const rows = await db
    .select({
      aiVendor: schema.userSettings.aiVendor,
      aiModel: schema.userSettings.aiModel,
    })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return { vendor: null, model: null };
  // Tolerate legacy values: any vendor not in the current whitelist
  // (e.g. an old kimi row) is reported as null so callers fall back
  // to the live default. We deliberately don't auto-rewrite the row.
  const vendor = row.aiVendor as AiVendor | null;
  if (!settingsSchemas.isValidAiSelection({ vendor, model: row.aiModel })) {
    return { vendor: null, model: null };
  }
  return { vendor, model: row.aiModel };
}

export async function updateAiSettings(
  db: Db,
  userId: string,
  patch: AiSettings,
): Promise<AiSettings> {
  if (!settingsSchemas.isValidAiSelection(patch)) {
    throw new HTTPException(400, { message: 'invalid_model' });
  }
  await db
    .insert(schema.userSettings)
    .values({
      userId,
      aiVendor: patch.vendor,
      aiModel: patch.model,
    })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: {
        aiVendor: patch.vendor,
        aiModel: patch.model,
        updatedAt: sql`now()`,
      },
    });
  return patch;
}
