import { z } from 'zod';
import { cursor, isoDateTime } from './_shared.js';
import { activityEventId, noteId, projectId, reportId, userId } from './ids.js';

export const eventTypes = [
  'user.signed_up',
  'project.created',
  'report.created',
  'note.text_created',
  'note.voice_created',
  'note.image_created',
  'note.document_created',
] as const;

export const eventType = z.enum(eventTypes);
export const eventLevel = z.enum(['milestone', 'detail']);
export const listLevel = eventLevel.or(z.literal('all'));

export type EventType = z.infer<typeof eventType>;
export type EventLevel = z.infer<typeof eventLevel>;

export const eventRegistry = {
  'user.signed_up': { level: 'milestone', subjectType: 'user' },
  'project.created': { level: 'milestone', subjectType: 'project' },
  'report.created': { level: 'milestone', subjectType: 'report' },
  'note.text_created': { level: 'detail', subjectType: 'note' },
  'note.voice_created': { level: 'detail', subjectType: 'note' },
  'note.image_created': { level: 'detail', subjectType: 'note' },
  'note.document_created': { level: 'detail', subjectType: 'note' },
} as const satisfies Record<
  EventType,
  { level: EventLevel; subjectType: 'user' | 'project' | 'report' | 'note' }
>;

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
      level: z.literal('milestone'),
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
      level: z.literal('milestone'),
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
      level: z.literal('milestone'),
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
  z
    .object({
      ...displayFields,
      level: z.literal('detail'),
      eventType: z.literal('note.text_created'),
      subjectType: z.literal('note'),
      subjectId: noteId,
      projectId,
      metadata: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...displayFields,
      level: z.literal('detail'),
      eventType: z.literal('note.voice_created'),
      subjectType: z.literal('note'),
      subjectId: noteId,
      projectId,
      metadata: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...displayFields,
      level: z.literal('detail'),
      eventType: z.literal('note.image_created'),
      subjectType: z.literal('note'),
      subjectId: noteId,
      projectId,
      metadata: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...displayFields,
      level: z.literal('detail'),
      eventType: z.literal('note.document_created'),
      subjectType: z.literal('note'),
      subjectId: noteId,
      projectId,
      metadata: z.object({}).strict(),
    })
    .strict(),
]);

const actorExclusions = z
  .string()
  .max(512)
  .transform((value, ctx) => {
    const candidates = value.split(',').map((candidate) => candidate.trim());
    if (candidates.some((candidate) => candidate.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'actor exclusions must be comma-separated user IDs',
      });
      return z.NEVER;
    }

    const parsed: string[] = [];
    for (const candidate of candidates) {
      const result = userId.safeParse(candidate);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'actor exclusions must contain valid user IDs',
        });
        return z.NEVER;
      }
      parsed.push(result.data);
    }

    const unique = [...new Set(parsed)];
    if (unique.length > 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'actor exclusions cannot contain more than 20 user IDs',
      });
      return z.NEVER;
    }
    return unique;
  });

export const listQuery = z
  .object({
    cursor: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    level: listLevel.default('milestone'),
    eventType: eventType.optional(),
    actorUserId: userId.optional(),
    excludeActorUserIds: actorExclusions.optional(),
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

export type Event = z.infer<typeof event>;
export type ListQuery = z.infer<typeof listQuery>;
export type ListResponse = z.infer<typeof listResponse>;
