import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { activity as activitySchemas, activityEventId } from '@harpa/api-contract';
import { rawDb } from '../db/client.js';

type ListQuery = z.infer<typeof activitySchemas.listQuery>;
type ListResponse = z.infer<typeof activitySchemas.listResponse>;

interface ActivityRow extends Record<string, unknown> {
  id: string;
  occurred_at: string;
  event_type: 'user.signed_up' | 'project.created' | 'report.created';
  actor_user_id: string | null;
  actor_label: string;
  actor_email: string | null;
  subject_type: 'user' | 'project' | 'report';
  subject_id: string | null;
  subject_label: string;
  project_id: string | null;
  project_label: string | null;
  request_id: string | null;
  metadata: unknown;
}

interface DecodedCursor {
  occurredAt: string;
  id: string;
}

function encodeCursor(occurredAt: string, id: string): string {
  return Buffer.from(`${occurredAt}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): DecodedCursor {
  const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (parts.length !== 2) throw new Error('invalid cursor');
  const [occurredAt, id] = parts;
  if (
    !occurredAt ||
    Number.isNaN(Date.parse(occurredAt)) ||
    !id ||
    !activityEventId.safeParse(id).success
  ) {
    throw new Error('invalid cursor');
  }
  return { occurredAt: new Date(occurredAt).toISOString(), id };
}

export async function listAdminActivity(input: ListQuery): Promise<ListResponse> {
  const filters = [sql`TRUE`];

  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    filters.push(sql`(e.occurred_at, e.id) < (${cursor.occurredAt}::timestamptz, ${cursor.id})`);
  }
  if (input.eventType) {
    filters.push(sql`e.event_type = ${input.eventType}`);
  }
  if (input.actorUserId) {
    filters.push(sql`e.actor_user_id = ${input.actorUserId}`);
  }
  if (input.projectId) {
    filters.push(sql`e.project_id = ${input.projectId}`);
  }
  if (input.from) {
    filters.push(sql`e.occurred_at >= ${input.from}::timestamptz`);
  }
  if (input.to) {
    filters.push(sql`e.occurred_at <= ${input.to}::timestamptz`);
  }

  const overFetch = input.limit + 1;
  const result = await rawDb().execute<ActivityRow>(sql`
    SELECT
      e.id,
      e.occurred_at,
      e.event_type,
      e.actor_user_id,
      COALESCE(
        NULLIF(actor.display_name, ''),
        NULLIF(actor.name, ''),
        actor.email,
        'Deleted user'
      ) AS actor_label,
      actor.email AS actor_email,
      e.subject_type,
      e.subject_id,
      CASE e.subject_type
        WHEN 'user' THEN COALESCE(
          NULLIF(subject_user.display_name, ''),
          NULLIF(subject_user.name, ''),
          subject_user.email,
          'Deleted user'
        )
        WHEN 'project' THEN COALESCE(subject_project.name, 'Deleted project')
        WHEN 'report' THEN CASE
          WHEN subject_report.id IS NULL THEN 'Deleted report'
          ELSE 'Report #' || subject_report.number::text
        END
      END AS subject_label,
      e.project_id,
      CASE
        WHEN e.project_id IS NULL THEN NULL
        ELSE COALESCE(project.name, 'Deleted project')
      END AS project_label,
      e.request_id,
      e.metadata
    FROM app.activity_events e
    LEFT JOIN public."user" actor
      ON actor.id = e.actor_user_id
    LEFT JOIN public."user" subject_user
      ON e.subject_type = 'user'
     AND subject_user.id::text = e.subject_id
    LEFT JOIN app.projects subject_project
      ON e.subject_type = 'project'
     AND subject_project.id::text = e.subject_id
    LEFT JOIN app.reports subject_report
      ON e.subject_type = 'report'
     AND subject_report.id::text = e.subject_id
    LEFT JOIN app.projects project
      ON project.id = e.project_id
    WHERE ${sql.join(filters, sql` AND `)}
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT ${overFetch}
  `);

  const hasMore = result.rows.length > input.limit;
  const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  const items = rows.map((row) => ({
    id: row.id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    actorLabel: row.actor_label,
    actorEmail: row.actor_email,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectLabel: row.subject_label,
    projectId: row.project_id,
    projectLabel: row.project_label,
    requestId: row.request_id,
    metadata: row.metadata,
  }));
  const last = items[items.length - 1];

  return activitySchemas.listResponse.parse({
    items,
    nextCursor: hasMore && last ? encodeCursor(last.occurredAt, last.id) : null,
  });
}
