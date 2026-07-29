import { z } from 'zod';
import { cursor, isoDateTime } from './_shared.js';
import { activityEventId, projectId, reportId, userId } from './ids.js';

export const eventType = z.enum(['user.signed_up', 'project.created', 'report.created']);

const displayFields = {
  id: activityEventId,
  occurredAt: isoDateTime,
  actorUserId: userId.nullable(),
  actorLabel: z.string().min(1),
  actorEmail: z.string().email().nullable(),
  subjectLabel: z.string().min(1),
  projectLabel: z.string().min(1).nullable(),
  requestId: z.string().min(6).max(128).nullable(),
};

export const event = z.discriminatedUnion('eventType', [
  z
    .object({
      ...displayFields,
      eventType: z.literal('user.signed_up'),
      subjectType: z.literal('user'),
      subjectId: userId.nullable(),
      projectId: z.null(),
      metadata: z
        .object({
          method: z.literal('email_otp'),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...displayFields,
      eventType: z.literal('project.created'),
      subjectType: z.literal('project'),
      subjectId: projectId,
      projectId,
      metadata: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...displayFields,
      eventType: z.literal('report.created'),
      subjectType: z.literal('report'),
      subjectId: reportId,
      projectId,
      metadata: z
        .object({
          reportNumber: z.number().int().positive(),
        })
        .strict(),
    })
    .strict(),
]);

export const listQuery = z
  .object({
    cursor: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    eventType: eventType.optional(),
    actorUserId: userId.optional(),
    projectId: projectId.optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
  })
  .strict();

export const listResponse = z
  .object({
    items: z.array(event),
    nextCursor: cursor.nullable(),
  })
  .strict();

export type EventType = z.infer<typeof eventType>;
export type Event = z.infer<typeof event>;
export type ListQuery = z.infer<typeof listQuery>;
export type ListResponse = z.infer<typeof listResponse>;
