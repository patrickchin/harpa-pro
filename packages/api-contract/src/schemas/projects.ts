import { z } from 'zod';
import { isoDateTime } from './_shared.js';
import { projectId, userId } from './ids.js';

export const projectRole = z.enum(['owner', 'editor', 'viewer']);
export type ProjectRole = z.infer<typeof projectRole>;

export const project = z.object({
  id: projectId,
  name: z.string().min(1).max(200),
  clientName: z.string().nullable(),
  address: z.string().nullable(),
  ownerId: userId,
  myRole: projectRole,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  stats: z
    .object({
      totalReports: z.number().int().nonnegative(),
      drafts: z.number().int().nonnegative(),
      lastReportAt: isoDateTime.nullable(),
    })
    .optional(),
});
export type Project = z.infer<typeof project>;

export const createProjectRequest = z.object({
  name: z.string().min(1).max(200),
  clientName: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
});

export const updateProjectRequest = createProjectRequest.partial();

export const projectMember = z.object({
  userId: userId,
  displayName: z.string().nullable(),
  email: z.string().email(),
  role: projectRole,
  joinedAt: isoDateTime,
});

export const inviteMemberRequest = z.object({
  email: z.string().email(),
  role: projectRole.default('editor'),
});

export const updateMemberRoleRequest = z.object({
  role: projectRole,
});
