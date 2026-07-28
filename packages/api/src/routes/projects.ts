/**
 * /projects + /projects/:project/members routes. All DB access
 * goes through `c.get('db')(fn)` (the per-request scoped accessor).
 * Cross-table reads and the create-with-owner bootstrap go through
 * SECURITY DEFINER helpers defined in
 * migrations/0001_init.sql.
 *
 * Path params are slug-native (P3.1): `:project` is a `prj_…` slug
 * (Crockford base32, see `Id<'prj'>`). The slug IS the primary key —
 * no parallel uuid column. See docs/v4/design-p31-slug-only-ids.md.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import {
  projects as projectSchemas,
  paginated,
  errorEnvelope,
  cursor,
  limit,
  projectId,
  userId,
} from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { withAuth } from '../middleware/auth.js';
import {
  addMemberByEmail,
  createProject,
  deleteProject,
  getProject,
  getProjectBySlug,
  listMembers,
  listProjects,
  mapPgError,
  removeMember,
  updateMemberRole,
  updateProject,
} from '../services/projects.js';
import { recordActivityEvent } from '../services/activity-events.js';

const projectParam = z.object({
  project: projectId.openapi({ param: { name: 'project', in: 'path' } }),
});
const memberPathParams = z.object({
  project: projectId.openapi({ param: { name: 'project', in: 'path' } }),
  user: userId.openapi({ param: { name: 'user', in: 'path' } }),
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
    const requestId = c.get('requestId');
    const id = await db(async (d) => {
      const projectId = await createProject(d, body);
      await recordActivityEvent(d, {
        eventType: 'project.created',
        actorUserId: userId,
        subjectId: projectId,
        projectId,
        requestId,
        dedupeKey: `project.created:${projectId}`,
        metadata: {},
      });
      return projectId;
    });
    const project = await db((d) => getProject(d, userId, id));
    if (!project) throw new HTTPException(500, { message: 'created project not found' });
    return c.json(project, 201);
  },
);

// --------- get ----------
projectRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{project}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: projectParam },
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
    const { project: slug } = c.req.valid('param');
    const project = await db((d) => getProjectBySlug(d, userId, slug));
    if (!project) throw new HTTPException(404, { message: 'Project not found.' });
    return c.json(project, 200);
  },
);

// --------- patch ----------
projectRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/projects/{project}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectParam,
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
    const { project: slug } = c.req.valid('param');
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
    path: '/projects/{project}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: projectParam },
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
    const { project: slug } = c.req.valid('param');
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
    path: '/projects/{project}/members',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: { params: projectParam },
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
    const { project: slug } = c.req.valid('param');
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
    path: '/projects/{project}/members',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: projectParam,
      body: { content: { 'application/json': { schema: projectSchemas.inviteMemberRequest } } },
    },
    responses: {
      201: { description: 'Member added.', content: { 'application/json': { schema: projectSchemas.projectMember } } },
      400: { description: 'Bad request.', content: { 'application/json': { schema: errorEnvelope } } },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      403: { description: 'Not an owner.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'User not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Already a member.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { project: slug } = c.req.valid('param');
    const { email, role } = c.req.valid('json');
    const existing = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!existing) throw new HTTPException(404, { message: 'Project not found.' });
    try {
      const member = await db((d) => addMemberByEmail(d, existing.id, email, role));
      return c.json(member, 201);
    } catch (err) {
      const cat = mapPgError(err);
      if (cat === 'forbidden') throw new HTTPException(403, { message: 'Owner only.' });
      if (cat === 'not_found') throw new HTTPException(404, { message: 'User not found.' });
      if (cat === 'conflict') throw new HTTPException(409, { message: 'User is already a member of this project.' });
      throw err;
    }
  },
);

// --------- update member role ----------
projectRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/projects/{project}/members/{user}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: memberPathParams,
      body: {
        content: {
          'application/json': { schema: projectSchemas.updateMemberRoleRequest },
        },
      },
    },
    responses: {
      200: {
        description: 'Member role updated (or unchanged if already correct).',
        content: { 'application/json': { schema: projectSchemas.projectMember } },
      },
      401: { description: 'Unauthorized.', content: { 'application/json': { schema: errorEnvelope } } },
      403: { description: 'Not an owner.', content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Member not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Last owner.', content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId = c.get('userId');
    const db = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { project: slug, user: target } = c.req.valid('param');
    const { role } = c.req.valid('json');
    const existing = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!existing) throw new HTTPException(404, { message: 'Project not found.' });
    try {
      const member = await db((d) => updateMemberRole(d, existing.id, target, role));
      return c.json(member, 200);
    } catch (err) {
      const cat = mapPgError(err);
      if (cat === 'forbidden') throw new HTTPException(403, { message: 'Owner only.' });
      if (cat === 'not_found') throw new HTTPException(404, { message: 'Member not found.' });
      if (cat === 'conflict') throw new HTTPException(409, { message: 'Cannot demote the last owner.' });
      throw err;
    }
  },
);

// --------- remove member ----------
projectRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/projects/{project}/members/{user}',
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
    const { project: slug, user: target } = c.req.valid('param');
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
