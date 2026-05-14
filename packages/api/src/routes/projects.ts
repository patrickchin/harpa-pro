/**
 * /projects + /projects/:projectSlug/members routes. All DB access
 * goes through `c.get('db')(fn)` (the per-request scoped accessor).
 * Cross-table reads and the create-with-owner bootstrap go through
 * SECURITY DEFINER helpers defined in
 * migrations/202605120003_projects_helpers.sql and
 * migrations/202605130004_projects_helpers_v2_slugs_not_null.sql.
 *
 * Path params switched from `:id` (uuid) to `:projectSlug` (Crockford
 * base32 short token) in P3.0 Commit 3 — see
 * docs/v4/design-p30-ids-slugs.md §4. The UUID is still the canonical
 * internal id; slug→id resolution happens inside the service layer.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  projects as projectSchemas,
  paginated,
  errorEnvelope,
  cursor,
  limit,
  projectSlug,
  uuid,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import {
  addMemberByPhone,
  createProject,
  deleteProject,
  getProject,
  getProjectBySlug,
  listMembers,
  listProjects,
  mapPgError,
  removeMember,
  updateProject,
} from '../services/projects.js';

const projectSlugParam = z.object({
  projectSlug: projectSlug.openapi({ param: { name: 'projectSlug', in: 'path' } }),
});
const memberPathParams = z.object({
  projectSlug: projectSlug.openapi({ param: { name: 'projectSlug', in: 'path' } }),
  userId: uuid.openapi({ param: { name: 'userId', in: 'path' } }),
});

export const projectRoutes = new OpenAPIHono<AppEnv>();

// --------- list ----------
projectRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { query: z.object({ cursor: cursor.optional(), limit: limit.optional() }) },
    responses: {
      200: { description: 'Page of projects.', content: { 'application/json': { schema: paginated(projectSchemas.project) } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const q = c.req.valid('query');
    const result = await db((d) => listProjects(d, userId, { cursor: q.cursor, limit: q.limit ?? 20 }));
    return c.json(result, 200);
  },
);

// --------- create ----------
projectRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { body: { content: { 'application/json': { schema: projectSchemas.createProjectRequest } } } },
    responses: {
      201: { description: 'Created.', content: { 'application/json': { schema: projectSchemas.project } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const body = c.req.valid('json');
    const id = await db((d) => createProject(d, body));
    const project = await db((d) => getProject(d, userId, id));
    if (!project) throw new HTTPException(500, { message: 'created project not found' });
    return c.json(project, 201);
  },
);

// --------- get ----------
projectRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{projectSlug}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: projectSlugParam },
    responses: {
      200: { description: 'Project.', content: { 'application/json': { schema: projectSchemas.project } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { projectSlug: slug } = c.req.valid('param');
    const project = await db((d) => getProjectBySlug(d, userId, slug));
    if (!project) throw new HTTPException(404, { message: 'Project not found.' });
    return c.json(project, 200);
  },
);

// --------- patch ----------
projectRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/projects/{projectSlug}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectSlugParam,
      body: { content: { 'application/json': { schema: projectSchemas.updateProjectRequest } } },
    },
    responses: {
      200: { description: 'Updated.', content: { 'application/json': { schema: projectSchemas.project } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { projectSlug: slug } = c.req.valid('param');
    const body = c.req.valid('json');
    // Resolve slug → row under the caller's scope first (so the UPDATE
    // never touches a row the caller can't see).
    const existing = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!existing) throw new HTTPException(404, { message: 'Project not found.' });
    const ok = await db((d) => updateProject(d, existing.id, body));
    if (!ok) throw new HTTPException(404, { message: 'Project not found.' });
    const project = await db((d) => getProject(d, userId, existing.id));
    if (!project) throw new HTTPException(404, { message: 'Project not found.' });
    return c.json(project, 200);
  },
);

// --------- delete (owner-only via RLS) ----------
projectRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/projects/{projectSlug}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: projectSlugParam },
    responses: {
      204: { description: 'Deleted.' },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found or not owner.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { projectSlug: slug } = c.req.valid('param');
    const existing = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!existing) throw new HTTPException(404, { message: 'Project not found or not owner.' });
    const ok = await db((d) => deleteProject(d, existing.id));
    if (!ok) throw new HTTPException(404, { message: 'Project not found or not owner.' });
    return c.body(null, 204);
  },
);

// --------- members list ----------
projectRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{projectSlug}/members',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: projectSlugParam },
    responses: {
      200: {
        description: 'Members.',
        content: { 'application/json': { schema: z.object({ items: z.array(projectSchemas.projectMember) }) } },
      },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not a member.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { projectSlug: slug } = c.req.valid('param');
    const existing = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!existing) throw new HTTPException(404, { message: 'Project not found.' });
    try {
      const items = await db((d) => listMembers(d, existing.id));
      return c.json({ items }, 200);
    } catch (err) {
      if (mapPgError(err) === 'forbidden') {
        throw new HTTPException(404, { message: 'Project not found.' });
      }
      throw err;
    }
  },
);

// --------- invite member ----------
projectRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/projects/{projectSlug}/members',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectSlugParam,
      body: { content: { 'application/json': { schema: projectSchemas.inviteMemberRequest } } },
    },
    responses: {
      201: { description: 'Member added.', content: { 'application/json': { schema: projectSchemas.projectMember } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      403: { description: 'Not an owner.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'User not found.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { projectSlug: slug } = c.req.valid('param');
    const { phone, role } = c.req.valid('json');
    const existing = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!existing) throw new HTTPException(404, { message: 'Project not found.' });
    try {
      const member = await db((d) => addMemberByPhone(d, existing.id, phone, role));
      return c.json(member, 201);
    } catch (err) {
      const cat = mapPgError(err);
      if (cat === 'forbidden') throw new HTTPException(403, { message: 'Owner only.' });
      if (cat === 'not_found') throw new HTTPException(404, { message: 'User not found.' });
      throw err;
    }
  },
);

// --------- remove member ----------
projectRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/projects/{projectSlug}/members/{userId}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: memberPathParams },
    responses: {
      204: { description: 'Removed.' },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      403: { description: 'Not an owner.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Last owner.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { projectSlug: slug, userId: target } = c.req.valid('param');
    const existing = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!existing) throw new HTTPException(404, { message: 'Project not found.' });
    try {
      const ok = await db((d) => removeMember(d, existing.id, target));
      if (!ok) throw new HTTPException(404, { message: 'Member not found.' });
      return c.body(null, 204);
    } catch (err) {
      const cat = mapPgError(err);
      if (cat === 'forbidden') throw new HTTPException(403, { message: 'Owner only.' });
      if (cat === 'conflict') throw new HTTPException(409, { message: 'Cannot remove the last owner.' });
      throw err;
    }
  },
);
