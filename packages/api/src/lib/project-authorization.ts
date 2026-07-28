import { HTTPException } from 'hono/http-exception';

import type { ScopedDbAccessor } from '../app.js';
import {
  getProjectBySlug,
  type ProjectRole,
  type ProjectRow,
} from '../services/projects.js';

const writerRoles: readonly ProjectRole[] = ['owner', 'editor'];
const ownerRoles: readonly ProjectRole[] = ['owner'];

async function requireProjectRole(
  db: ScopedDbAccessor,
  userId: string,
  projectId: string,
  allowedRoles: readonly ProjectRole[],
): Promise<ProjectRow> {
  const project = await db((d) =>
    getProjectBySlug(d, userId, projectId, false),
  );
  if (!project || !allowedRoles.includes(project.myRole)) {
    // Keep missing projects, non-members, and insufficient roles
    // indistinguishable at content-mutation boundaries.
    throw new HTTPException(404, { message: 'Project not found.' });
  }
  return project;
}

export function requireProjectWriter(
  db: ScopedDbAccessor,
  userId: string,
  projectId: string,
): Promise<ProjectRow> {
  return requireProjectRole(db, userId, projectId, writerRoles);
}

export function requireProjectOwner(
  db: ScopedDbAccessor,
  userId: string,
  projectId: string,
): Promise<ProjectRow> {
  return requireProjectRole(db, userId, projectId, ownerRoles);
}
