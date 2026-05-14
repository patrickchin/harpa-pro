/**
 * Projects + members service. All DB calls take a scoped drizzle handle
 * (`db`) so the per-request scope wrapper is what enforces RLS;
 * SECURITY DEFINER helpers (see migrations/202605120003_projects_helpers.sql)
 * own the cross-table reads that would otherwise be blocked.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { generateSlug } from '../lib/slug.js';

type Db = NodePgDatabase<typeof schema>;

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  clientName: string | null;
  address: string | null;
  ownerId: string;
  myRole: ProjectRole;
  createdAt: string;
  updatedAt: string;
  stats?: { totalReports: number; drafts: number; lastReportAt: string | null };
}

export interface ProjectMemberRow {
  userId: string;
  displayName: string | null;
  phone: string;
  role: ProjectRole;
  joinedAt: string;
}

export interface ListInput {
  cursor?: string;
  limit: number;
}

export interface ListOutput {
  items: ProjectRow[];
  nextCursor: string | null;
}

/** Cursor is base64(`<iso created_at>|<uuid>`). Stable + opaque. */
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}
function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const [createdAt, id] = raw.split('|');
  if (!createdAt || !id) throw new Error('invalid cursor');
  return { createdAt, id };
}

export async function listProjects(db: Db, userId: string, input: ListInput): Promise<ListOutput> {
  const { cursor, limit } = input;
  const overFetch = limit + 1;
  const result = cursor
    ? await (async () => {
        const { createdAt, id } = decodeCursor(cursor);
        return db.execute<{
          id: string;
          slug: string;
          name: string;
          client_name: string | null;
          address: string | null;
          owner_id: string;
          my_role: ProjectRole;
          created_at: Date;
          updated_at: Date;
        }>(sql`
          SELECT p.id, p.slug, p.name, p.client_name, p.address, p.owner_id, pm.role AS my_role,
                 p.created_at, p.updated_at
          FROM app.projects p
          JOIN app.project_members pm
            ON pm.project_id = p.id AND pm.user_id = ${userId}::uuid
          WHERE (p.created_at, p.id) < (${createdAt}::timestamptz, ${id}::uuid)
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT ${overFetch}
        `);
      })()
    : await db.execute<{
        id: string;
        slug: string;
        name: string;
        client_name: string | null;
        address: string | null;
        owner_id: string;
        my_role: ProjectRole;
        created_at: Date;
        updated_at: Date;
      }>(sql`
        SELECT p.id, p.slug, p.name, p.client_name, p.address, p.owner_id, pm.role AS my_role,
               p.created_at, p.updated_at
        FROM app.projects p
        JOIN app.project_members pm
          ON pm.project_id = p.id AND pm.user_id = ${userId}::uuid
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${overFetch}
      `);

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return {
    items: slice.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      clientName: r.client_name,
      address: r.address,
      ownerId: r.owner_id,
      myRole: r.my_role,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    })),
    nextCursor: hasMore && last ? encodeCursor(new Date(last.created_at).toISOString(), last.id) : null,
  };
}

/**
 * Create a project with the caller as owner. Generates a public slug
 * (`prj_xxxxxx`) and retries on the (vanishingly unlikely)
 * `projects_slug_unique` collision. The SECURITY DEFINER helper
 * (see migration 202605130004) writes the slug + bootstraps the
 * owner membership in a single transaction.
 */
export async function createProject(
  db: Db,
  input: { name: string; clientName?: string; address?: string },
): Promise<string> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = generateSlug('prj');
    try {
      const r = await db.execute<{ id: string }>(sql`
        SELECT app.create_project_with_owner(
          ${input.name}, ${input.clientName ?? null}, ${input.address ?? null}, ${slug}
        ) AS id
      `);
      const row = r.rows[0];
      if (!row) throw new Error('create_project_with_owner returned no row');
      return row.id;
    } catch (err) {
      if (isSlugCollision(err, 'projects_slug_unique') && attempt < maxAttempts - 1) {
        continue;
      }
      throw err;
    }
  }
  // Unreachable — the loop either returns or throws.
  throw new Error('slug collision retry exhausted (projects)');
}

function isSlugCollision(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint?: string; cause?: unknown };
  if (e.code === '23505' && e.constraint === constraint) return true;
  // Drizzle/pg sometimes nests the error.
  if (e.cause && isSlugCollision(e.cause, constraint)) return true;
  return false;
}

export async function getProject(
  db: Db,
  userId: string,
  projectId: string,
  withStats = true,
): Promise<ProjectRow | null> {
  const r = await db.execute<{
    id: string;
    slug: string;
    name: string;
    client_name: string | null;
    address: string | null;
    owner_id: string;
    my_role: ProjectRole;
    created_at: Date;
    updated_at: Date;
  }>(sql`
    SELECT p.id, p.slug, p.name, p.client_name, p.address, p.owner_id, pm.role AS my_role,
           p.created_at, p.updated_at
    FROM app.projects p
    JOIN app.project_members pm
      ON pm.project_id = p.id AND pm.user_id = ${userId}::uuid
    WHERE p.id = ${projectId}::uuid
    LIMIT 1
  `);
  const row = r.rows[0];
  if (!row) return null;

  const out: ProjectRow = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    clientName: row.client_name,
    address: row.address,
    ownerId: row.owner_id,
    myRole: row.my_role,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };

  if (withStats) {
    const stats = await db.execute<{
      total_reports: string;
      drafts: string;
      last_report_at: Date | null;
    }>(sql`SELECT * FROM app.project_stats(${projectId}::uuid)`);
    const s = stats.rows[0];
    if (s) {
      out.stats = {
        totalReports: Number(s.total_reports),
        drafts: Number(s.drafts),
        lastReportAt: s.last_report_at ? new Date(s.last_report_at).toISOString() : null,
      };
    }
  }
  return out;
}

export async function updateProject(
  db: Db,
  projectId: string,
  patch: { name?: string; clientName?: string; address?: string },
): Promise<boolean> {
  const r = await db.execute<{ id: string }>(sql`
    UPDATE app.projects SET
      name = COALESCE(${patch.name ?? null}, name),
      client_name = COALESCE(${patch.clientName ?? null}, client_name),
      address = COALESCE(${patch.address ?? null}, address),
      updated_at = now()
    WHERE id = ${projectId}::uuid
    RETURNING id
  `);
  return r.rows.length > 0;
}

export async function deleteProject(db: Db, projectId: string): Promise<boolean> {
  const r = await db.execute<{ id: string }>(sql`
    DELETE FROM app.projects WHERE id = ${projectId}::uuid RETURNING id
  `);
  return r.rows.length > 0;
}

export async function listMembers(db: Db, projectId: string): Promise<ProjectMemberRow[]> {
  const r = await db.execute<{
    user_id: string;
    display_name: string | null;
    phone: string;
    role: ProjectRole;
    joined_at: Date;
  }>(sql`SELECT * FROM app.list_project_members(${projectId}::uuid)`);
  return r.rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    phone: row.phone,
    role: row.role,
    joinedAt: new Date(row.joined_at).toISOString(),
  }));
}

export async function addMemberByPhone(
  db: Db,
  projectId: string,
  phone: string,
  role: ProjectRole,
): Promise<ProjectMemberRow> {
  const r = await db.execute<{
    user_id: string;
    display_name: string | null;
    phone: string;
    role: ProjectRole;
    joined_at: Date;
  }>(sql`SELECT * FROM app.add_project_member_by_phone(${projectId}::uuid, ${phone}, ${role}::app.project_role)`);
  const row = r.rows[0];
  if (!row) throw new Error('add_project_member_by_phone returned no row');
  return {
    userId: row.user_id,
    displayName: row.display_name,
    phone: row.phone,
    role: row.role,
    joinedAt: new Date(row.joined_at).toISOString(),
  };
}

export async function removeMember(db: Db, projectId: string, userId: string): Promise<boolean> {
  const r = await db.execute<{ remove_project_member: boolean }>(sql`
    SELECT app.remove_project_member(${projectId}::uuid, ${userId}::uuid) AS remove_project_member
  `);
  return Boolean(r.rows[0]?.remove_project_member);
}

/**
 * Map a Postgres SQLSTATE thrown from a SECURITY DEFINER helper into
 * an HTTP-friendly category. Lets routes do
 *   try { ... } catch (e) { if (mapPgError(e) === 'forbidden') ... }
 */
export function mapPgError(err: unknown): 'forbidden' | 'not_found' | 'conflict' | 'unknown' {
  const e = err as { code?: string; message?: string };
  if (!e.code) return 'unknown';
  if (e.code === '42501') return 'forbidden'; // RAISE 'not_a_member' / 'not_an_owner'
  if (e.code === 'P0002') return 'not_found'; // RAISE 'user_not_found'
  if (e.code === '23505') return 'conflict'; // unique_violation
  if (e.code === '23514') return 'conflict'; // check_violation (last_owner)
  return 'unknown';
}
