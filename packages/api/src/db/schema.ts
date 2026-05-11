import { sql } from 'drizzle-orm';
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  varchar,
  integer,
  pgEnum,
  primaryKey,
  jsonb,
  index,
  bigint,
} from 'drizzle-orm/pg-core';

/**
 * `auth` schema — better-auth-style users + sessions.
 * Hand-managed via Drizzle (not better-auth's CLI) per docs/v4/arch-auth-and-rls.md.
 */
export const authSchema = pgSchema('auth');

export const users = authSchema.table('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 32 }).notNull().unique(),
  displayName: text('display_name'),
  companyName: text('company_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = authSchema.table('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const verifications = authSchema.table('verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 32 }).notNull(),
  twilioVerificationSid: text('twilio_verification_sid'),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * `app` schema — application data. RLS enforced via per-request scope.
 */
export const appSchema = pgSchema('app');

export const projectRoleEnum = pgEnum('project_role', ['owner', 'editor', 'viewer']);

export const projects = appSchema.table('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  clientName: text('client_name'),
  address: text('address'),
  ownerId: uuid('owner_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectMembers = appSchema.table(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: projectRoleEnum('role').notNull().default('editor'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] }),
    userIdx: index('project_members_user_idx').on(t.userId),
  }),
);

export const reportStatusEnum = pgEnum('report_status', ['draft', 'finalized']);

export const reports = appSchema.table('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull(),
  status: reportStatusEnum('status').notNull().default('draft'),
  visitDate: timestamp('visit_date', { withTimezone: true }),
  body: jsonb('body'),
  notesSinceLastGeneration: integer('notes_since_last_generation').notNull().default(0),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  pdfFileId: uuid('pdf_file_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const noteKindEnum = pgEnum('note_kind', ['text', 'voice', 'image', 'document']);

export const notes = appSchema.table('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportId: uuid('report_id')
    .notNull()
    .references(() => reports.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull(),
  kind: noteKindEnum('kind').notNull(),
  body: text('body'),
  fileId: uuid('file_id'),
  transcript: text('transcript'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const fileKindEnum = pgEnum('file_kind', ['voice', 'image', 'document', 'pdf']);

export const files = appSchema.table('files', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  kind: fileKindEnum('kind').notNull(),
  fileKey: text('file_key').notNull().unique(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  contentType: text('content_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userSettings = appSchema.table('user_settings', {
  userId: uuid('user_id').primaryKey(),
  aiVendor: varchar('ai_vendor', { length: 32 }).notNull().default('openai'),
  aiModel: varchar('ai_model', { length: 64 }).notNull().default('gpt-4o-mini'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Re-export the SQL helper for use in raw policies / migrations. */
export { sql };
