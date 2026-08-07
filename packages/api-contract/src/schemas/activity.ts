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
export const entityState = z.enum(['available', 'deleted']);
export const projectState = z.enum(['none', 'available', 'deleted']);

export type EventType = z.infer<typeof eventType>;
export type EventLevel = z.infer<typeof eventLevel>;
export type EntityState = z.infer<typeof entityState>;
export type ProjectState = z.infer<typeof projectState>;

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
  actorLabel: z.string().min(1).nullable(),
  actorEmail: z.string().email().nullable(),
  actorState: entityState,
  subjectLabel: z.string().min(1).nullable(),
  subjectState: entityState,
  projectLabel: z.string().min(1).nullable(),
  projectState,
  requestId: z.string().min(6).max(128).nullable(),
};

const eventShape = z.discriminatedUnion('eventType', [
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

function requireEntityLabel(
  state: EntityState,
  label: string | null,
  path: 'actorLabel' | 'subjectLabel',
  ctx: z.RefinementCtx,
): void {
  if ((state === 'available') === (label !== null)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${path} must be present exactly when the entity is available`,
    path: [path],
  });
}

export const event = eventShape.superRefine((value, ctx) => {
  requireEntityLabel(value.actorState, value.actorLabel, 'actorLabel', ctx);
  requireEntityLabel(value.subjectState, value.subjectLabel, 'subjectLabel', ctx);
  if (value.actorState === 'deleted' && value.actorEmail !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'actorEmail must be null when the actor is deleted',
      path: ['actorEmail'],
    });
  }

  const hasProjectId = value.projectId !== null;
  const hasProjectLabel = value.projectLabel !== null;
  const validProjectState =
    (value.projectState === 'none' && !hasProjectId && !hasProjectLabel) ||
    (value.projectState === 'available' && hasProjectId && hasProjectLabel) ||
    (value.projectState === 'deleted' && hasProjectId && !hasProjectLabel);
  if (!validProjectState) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'projectState must agree with projectId and projectLabel',
      path: ['projectState'],
    });
  }
});

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
