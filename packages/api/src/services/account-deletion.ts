/**
 * Current-account deletion helpers for `/me`. Preview uses scoped
 * reads so the caller only sees projects they already belong to.
 * The destructive path delegates to `app.delete_current_user()` so
 * project ownership transfer and auth-row deletion are atomic.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { auth as authSchemas } from '@harpa/api-contract';
import type { z } from 'zod';
import * as schema from '../db/schema.js';

type Db = NodePgDatabase<typeof schema>;
type AccountDeletionPreviewResponse = z.infer<
  typeof authSchemas.accountDeletionPreviewResponse
>;

interface MembershipRow extends Record<string, unknown> {
  id: string;
  name: string;
  owner_id: string;
  role: 'owner' | 'editor' | 'viewer';
  member_count: string;
  created_at: Date | string;
}

interface MemberRow extends Record<string, unknown> {
  user_id: string;
  display_name: string | null;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  joined_at: Date | string;
}

interface CountRow extends Record<string, unknown> {
  count: string;
}

export async function getAccountDeletionPreview(
  db: Db,
  userId: string,
): Promise<AccountDeletionPreviewResponse | null> {
  const user = await db.execute<{ email: string }>(sql`
    SELECT email
    FROM public."user"
    WHERE id = ${userId}
    LIMIT 1
  `);
  const email = user.rows[0]?.email;
  if (!email) return null;

  const memberships = await db.execute<MembershipRow>(sql`
    SELECT
      p.id,
      p.name,
      p.owner_id,
      pm.role,
      (
        SELECT count(*)::text
        FROM app.project_members pm_count
        WHERE pm_count.project_id = p.id
      ) AS member_count,
      p.created_at
    FROM app.projects p
    JOIN app.project_members pm
      ON pm.project_id = p.id
     AND pm.user_id = ${userId}
    ORDER BY p.created_at ASC, p.id ASC
  `);

  const soloProjectsDeleted: AccountDeletionPreviewResponse['soloProjectsDeleted'] = [];
  const sharedProjectsTransferred: AccountDeletionPreviewResponse['sharedProjectsTransferred'] = [];
  const sharedProjectsLeft: AccountDeletionPreviewResponse['sharedProjectsLeft'] = [];

  for (const project of memberships.rows) {
    const memberCount = Number(project.member_count);
    if (memberCount <= 1) {
      soloProjectsDeleted.push({ id: project.id, name: project.name });
      continue;
    }

    if (project.owner_id === userId) {
      const members = await db.execute<MemberRow>(
        sql`SELECT * FROM app.list_project_members(${project.id})`,
      );
      const candidate = members.rows
        .filter((member) => member.user_id !== userId)
        .sort(compareOwnerCandidate)[0];
      if (candidate) {
        sharedProjectsTransferred.push({
          id: project.id,
          name: project.name,
          newOwnerId: candidate.user_id,
          newOwnerEmail: candidate.email,
        });
      }
      continue;
    }

    sharedProjectsLeft.push({ id: project.id, name: project.name });
  }

  const personalFiles = await db.execute<CountRow>(sql`
    SELECT count(*)::text AS count
    FROM app.files
    WHERE owner_id = ${userId}
  `);

  return {
    email,
    soloProjectsDeleted,
    sharedProjectsTransferred,
    sharedProjectsLeft,
    personalFilesDeleted: Number(personalFiles.rows[0]?.count ?? 0),
  };
}

export async function deleteCurrentAccount(db: Db): Promise<void> {
  await db.execute(sql`SELECT app.delete_current_user()`);
}

function compareOwnerCandidate(a: MemberRow, b: MemberRow): number {
  const aIsOwner = a.role === 'owner';
  const bIsOwner = b.role === 'owner';
  if (aIsOwner !== bIsOwner) return aIsOwner ? -1 : 1;
  const joined = toMillis(a.joined_at) - toMillis(b.joined_at);
  if (joined !== 0) return joined;
  return a.user_id.localeCompare(b.user_id);
}

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
