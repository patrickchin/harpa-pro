import { z } from 'zod';
import { isoDateTime, phone, projectSlug, uuid } from './_shared.js';

export const projectRole = z.enum(['owner', 'editor', 'viewer']);
export type ProjectRole = z.infer<typeof projectRole>;

export const project = z.object({
  id: uuid,
  slug: projectSlug,
  name: z.string().min(1).max(200),
  clientName: z.string().nullable(),
  address: z.string().nullable(),
  ownerId: uuid,
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
  userId: uuid,
  displayName: z.string().nullable(),
  phone,
  role: projectRole,
  joinedAt: isoDateTime,
});

export const inviteMemberRequest = z.object({
  phone,
  role: projectRole.default('editor'),
});
