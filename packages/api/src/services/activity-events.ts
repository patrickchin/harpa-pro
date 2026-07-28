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
  occurredAt: z.date().optional(),
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

export interface SignupActivityReconciliation {
  userId: string;
  state: 'missing' | 'present' | 'not_found';
  inserted: boolean;
}

const SUBJECT_TYPES = {
  'user.signed_up': 'user',
  'project.created': 'project',
  'report.created': 'report',
} as const;

/**
 * Record one curated activity event. Callers pass their existing scoped
 * Drizzle handle so entity creation and its event can share one transaction.
 */
export async function recordActivityEvent(
  db: ScopedDb,
  input: ActivityEventInput,
): Promise<boolean> {
  const event = inputSchema.parse(input);
  const metadata = JSON.stringify(event.metadata);
  const id = newId('aud');
  const occurredAt = event.occurredAt ? sql`${event.occurredAt}` : sql`now()`;

  // Targetless DO NOTHING needs INSERT privilege only. A conflict target or
  // RETURNING clause would require SELECT on the otherwise write-only table.
  const result = await db.execute(sql`
    INSERT INTO app.activity_events (
      id,
      occurred_at,
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
      ${occurredAt},
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

  return result.rowCount === 1;
}

/**
 * Repair one explicitly selected signup event. The caller must supply a
 * concrete user ID; this deliberately cannot turn into an implicit historical
 * backfill. Dry-run is the default at the CLI boundary.
 */
export async function reconcileSignupActivity(
  db: ScopedDb,
  candidateUserId: string,
  apply: boolean,
): Promise<SignupActivityReconciliation> {
  const parsedUserId = userId.parse(candidateUserId);
  const dedupeKey = `user.signed_up:${parsedUserId}`;
  const result = await db.execute<{
    created_at: string;
    event_exists: boolean;
  }>(sql`
    SELECT
      u.created_at,
      EXISTS (
        SELECT 1
        FROM app.activity_events e
        WHERE e.dedupe_key = ${dedupeKey}
      ) AS event_exists
    FROM public."user" u
    WHERE u.id = ${parsedUserId}
  `);
  const row = result.rows[0];

  if (!row) {
    return { userId: parsedUserId, state: 'not_found', inserted: false };
  }
  if (row.event_exists) {
    return { userId: parsedUserId, state: 'present', inserted: false };
  }
  if (!apply) {
    return { userId: parsedUserId, state: 'missing', inserted: false };
  }

  const inserted = await recordActivityEvent(db, {
    eventType: 'user.signed_up',
    actorUserId: parsedUserId,
    subjectId: parsedUserId,
    projectId: null,
    requestId: null,
    dedupeKey,
    occurredAt: new Date(row.created_at),
    metadata: { method: 'email_otp' },
  });

  return {
    userId: parsedUserId,
    state: inserted ? 'missing' : 'present',
    inserted,
  };
}
