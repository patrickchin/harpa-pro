/**
 * User helpers for reading/writing the `public.user` table through the
 * scoped DB handle. Replaces the phone-based equivalents from
 * auth/service.ts. The RLS policy `user_self_update` (migration 0014)
 * limits UPDATE to the caller's own row.
 */
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';

type Db = NodePgDatabase<typeof schema>;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  companyName: string | null;
  createdAt: string;
}

export interface UpdateUserInput {
  displayName?: string;
  companyName?: string;
}

function toPublicUser(u: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName ?? null,
    companyName: u.companyName ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function fetchUser(db: Db, userId: string): Promise<PublicUser | null> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const u = rows[0];
  return u ? toPublicUser(u) : null;
}

export async function updateUser(
  db: Db,
  userId: string,
  input: UpdateUserInput,
): Promise<PublicUser | null> {
  await db.execute(sql`
    UPDATE "user"
    SET
      display_name = COALESCE(${input.displayName ?? null}, display_name),
      company_name = COALESCE(${input.companyName ?? null}, company_name),
      updated_at = now()
    WHERE id = ${userId}
  `);
  return fetchUser(db, userId);
}
