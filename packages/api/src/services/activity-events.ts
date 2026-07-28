import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { projectId, reportId, userId } from '@harpa/api-contract';
import type { ScopedDb } from '../db/scope.js';
import { newId } from '../lib/ids.js';

const requestId = z
  .string()
  .regex(/^[\w-]{6,128}$/)
  .nullable();

const common = {
  actorUserId: userId,
  requestId,
  dedupeKey: z.string().min(1).max(256),
};

const inputSchema = z
  .discriminatedUnion('eventType', [
    z
      .object({
        ...common,
        eventType: z.literal('user.signed_up'),
        subjectId: userId,
        projectId: z.null().optional(),
        metadata: z
          .object({
            method: z.literal('email_otp'),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...common,
        eventType: z.literal('project.created'),
        subjectId: projectId,
        projectId,
        metadata: z.object({}).strict(),
      })
      .strict(),
    z
      .object({
        ...common,
        eventType: z.literal('report.created'),
        subjectId: reportId,
        projectId,
        metadata: z
          .object({
            reportNumber: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.dedupeKey !== `${value.eventType}:${value.subjectId}`) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dedupeKey'],
        message: 'dedupe key must match event type and subject',
      });
    }
    if (value.eventType === 'user.signed_up' && value.actorUserId !== value.subjectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subjectId'],
        message: 'signup actor and subject must match',
      });
    }
    if (value.eventType === 'project.created' && value.projectId !== value.subjectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectId'],
        message: 'project context and subject must match',
      });
    }
  });

export type ActivityEventInput = z.input<typeof inputSchema>;

const SUBJECT_TYPES = {
  'user.signed_up': 'user',
  'project.created': 'project',
  'report.created': 'report',
} as const;

/**
 * Record one curated activity event. Callers pass their existing scoped
 * Drizzle handle so entity creation and its event can share one transaction.
 */
export async function recordActivityEvent(db: ScopedDb, input: ActivityEventInput): Promise<void> {
  const event = inputSchema.parse(input);
  const metadata = JSON.stringify(event.metadata);
  const id = newId('aud');

  // Targetless DO NOTHING needs INSERT privilege only. Naming the partial
  // dedupe index would make Postgres require SELECT on the otherwise
  // write-only activity table.
  await db.execute(sql`
    INSERT INTO app.activity_events (
      id,
      event_type,
      actor_user_id,
      subject_type,
      subject_id,
      project_id,
      request_id,
      dedupe_key,
      metadata
    ) VALUES (
      ${id},
      ${event.eventType},
      ${event.actorUserId},
      ${SUBJECT_TYPES[event.eventType]},
      ${event.subjectId},
      ${event.projectId ?? null},
      ${event.requestId},
      ${event.dedupeKey},
      ${metadata}::jsonb
    )
    ON CONFLICT DO NOTHING
  `);
}
