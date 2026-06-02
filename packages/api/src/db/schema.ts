import { sql } from 'drizzle-orm';
import {
  pgSchema,
  text,
  timestamp,
  varchar,
  integer,
  pgEnum,
  primaryKey,
  jsonb,
  index,
  bigint,
  unique,
  numeric,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * better-auth tables (`public.user`, `public.session`, `public.account`,
 * `public.verification`). The CLI-generated definitions live in
 * `./auth-schema.ts` and are re-exported here so drizzle introspection
 * (and any cross-table query) sees them as part of the project schema.
 *
 * Regenerate with:
 *   DATABASE_URL='postgres://stub@localhost/stub' \
 *   pnpm exec better-auth generate \
 *     --output src/db/auth-schema.ts \
 *     --config src/auth/auth.ts -y
 *
 * Slug IDs (`usr_*`, `ses_*`, `vrf_*`, `idn_*`) are minted by
 * better-auth's `advanced.database.generateId({model})` hook; the DB
 * does not enforce the slug regex on the better-auth tables. The
 * `app.usr_id` DOMAIN CHECK at the FK boundary (`app.* → public.user`)
 * is the on-write guard. See docs/v4/arch-auth-and-rls.md.
 */
export * from './auth-schema.js';
import { user as users } from './auth-schema.js';
export { users };

/**
 * `app` schema — application data. RLS enforced via per-request scope.
 */
export const appSchema = pgSchema('app');

export const projectRoleEnum = pgEnum('project_role', ['owner', 'editor', 'viewer']);

export const projects = appSchema.table('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  clientName: text('client_name'),
  address: text('address'),
  ownerId: text('owner_id').notNull(),
  nextReportNumber: integer('next_report_number').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectMembers = appSchema.table(
  'project_members',
  {
    projectId: text('project_id')
      
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: projectRoleEnum('role').notNull().default('editor'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] }),
    userIdx: index('project_members_user_idx').on(t.userId),
  }),
);

export const reportStatusEnum = pgEnum('report_status', ['draft', 'finalized']);

export const reports = appSchema.table(
  'reports',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    authorId: text('author_id').notNull(),
    number: integer('number').notNull(),
    status: reportStatusEnum('status').notNull().default('draft'),
    visitDate: timestamp('visit_date', { withTimezone: true }),
    body: jsonb('body'),
    notesSinceLastGeneration: integer('notes_since_last_generation').notNull().default(0),
    notesChangedAt: timestamp('notes_changed_at', { withTimezone: true }),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    pdfFileId: text('pdf_file_id'),
    // Persisted by `runGenerate` — surfaced via GET /reports/{n}/debug.
    // See migration 0003 for value shape.
    lastGeneration: jsonb('last_generation'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    numberUnique: unique('reports_number_unique').on(t.projectId, t.number),
  }),
);

export const noteKindEnum = pgEnum('note_kind', ['text', 'voice', 'image', 'document']);

export const notes = appSchema.table('notes', {
  id: text('id').primaryKey(),
  reportId: text('report_id')
    
    .notNull()
    .references(() => reports.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),
  kind: noteKindEnum('kind').notNull(),
  body: text('body'),
  fileId: text('file_id'),
  // Thumbnail variant for image notes (migration 0009). Nullable;
  // legacy image notes fall back to `fileId` for grid rendering.
  thumbnailFileId: text('thumbnail_file_id').references((): AnyPgColumn => files.id, { onDelete: 'set null' }),
  transcript: text('transcript'),
  // Generic note-level fields (migration 0004). Nullable on every
  // kind. Today the voice aggregator is the only writer; text /
  // image / document notes may populate them in the future.
  title: text('title'),
  summary: text('summary'),
  // Voice-only diagnostics (migration 0004 / arch-voice-pipeline.md §D3).
  durationSec: integer('duration_sec'),
  language: text('language'),
  transcribeProvider: text('transcribe_provider'),
  transcribedAt: timestamp('transcribed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const fileKindEnum = pgEnum('file_kind', ['voice', 'image', 'document', 'pdf']);

export const files = appSchema.table('files', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  kind: fileKindEnum('kind').notNull(),
  fileKey: text('file_key').notNull().unique(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  contentType: text('content_type').notNull(),
  // Project-scope linkage (migration 0011). Both nullable: avatar +
  // scratch uploads carry NULL/NULL and stay owner-only via RLS.
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  reportId: text('report_id').references((): AnyPgColumn => reports.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userSettings = appSchema.table('user_settings', {
  userId: text('user_id').primaryKey(),
  aiVendor: varchar('ai_vendor', { length: 32 }),
  aiModel: varchar('ai_model', { length: 64 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Marketing waitlist signups (double opt-in). Reachable from the public
 * Astro site via POST /waitlist. The `email` column is `citext` in the
 * database for case-insensitive uniqueness; Drizzle's `text` is
 * wire-compatible.
 */
export const waitlistSignups = appSchema.table('waitlist_signups', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  company: text('company'),
  role: text('role'),
  source: text('source'),
  ipHash: text('ip_hash'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmTokenHash: text('confirm_token_hash'),
  confirmTokenExpiresAt: timestamp('confirm_token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * LLM usage observability sink — one row per call routed through the
 * `services/ai.ts` chokepoint. RLS pins read + insert on `app.user_id`
 * (see migration `0005_llm_usage_events.sql`).
 */
export const llmOperationEnum = pgEnum('llm_operation', [
  'chat',
  'transcribe',
  'generate_report',
]);

export const llmFixtureModeEnum = pgEnum('llm_fixture_mode', [
  'live',
  'replay',
  'record',
]);

export const llmUsageStatusEnum = pgEnum('llm_usage_status', ['ok', 'error']);

export const llmUsageEvents = appSchema.table('llm_usage_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  projectId: text('project_id'),
  reportId: text('report_id'),
  vendor: varchar('vendor', { length: 32 }).notNull(),
  model: varchar('model', { length: 128 }).notNull(),
  operation: llmOperationEnum('operation').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cachedTokens: integer('cached_tokens').notNull().default(0),
  // Audio duration (seconds) for `operation='transcribe'` rows. NULL
  // for chat / generate_report. See migration
  // `0008_llm_usage_input_seconds.sql`.
  inputSeconds: numeric('input_seconds', { precision: 10, scale: 3 }),
  latencyMs: integer('latency_ms').notNull().default(0),
  fixtureMode: llmFixtureModeEnum('fixture_mode').notNull(),
  status: llmUsageStatusEnum('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-user admin-granted limit override. NULL columns fall through to
 * the user's plan in `PLAN_LIMITS`; `-1` is the explicit "unbounded"
 * sentinel (serialised on the wire as `null`). See
 * docs/v4/arch-usage-limits.md §3.3.
 */
export const userLimitOverrides = appSchema.table('user_limit_overrides', {
  userId: text('user_id').primaryKey(),
  reportGenerate: integer('report_generate'),
  voiceTranscribe: integer('voice_transcribe'),
  voiceSummarize: integer('voice_summarize'),
  aiInputTokens: bigint('ai_input_tokens', { mode: 'number' }),
  aiOutputTokens: bigint('ai_output_tokens', { mode: 'number' }),
  reason: text('reason').notNull(),
  grantedBy: text('granted_by').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

/**
 * Rate-limit buckets (cross-machine counter store). See migration
 * 0007_rate_limit_buckets.sql and docs/v4/arch-rate-limiting.md §3.4.
 *
 * Drizzle declaration is included so the schema-introspection tooling
 * sees the table; the actual `consume()` query is hand-written SQL in
 * `lib/rateLimiter.ts` (one-round-trip upsert).
 */
export const rateLimitBuckets = appSchema.table('rate_limit_buckets', {
  bucketKey: text('bucket_key').primaryKey(),
  windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
});

/** Re-export the SQL helper for use in raw policies / migrations. */
export { sql };
