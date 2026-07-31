import { sql } from 'drizzle-orm';
import { check, index, integer, pgSchema, text, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * Authentication data for the admin console.
 *
 * These tables live in a separate Postgres database reached through
 * ADMIN_DATABASE_URL. Do not join them to application or Better Auth tables.
 */
export const adminSchema = pgSchema('admin');

export const adminIdentities = adminSchema.table(
  'identities',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailUnique: unique('admin_identities_email_key').on(t.email),
    emailCheck: check(
      'admin_identities_email_check',
      sql`${t.email} = lower(${t.email})
        AND length(${t.email}) <= 320
        AND ${t.email} ~ '^[^@[:space:]]+@harpapro[.]com$'`,
    ),
    passwordHashCheck: check(
      'admin_identities_password_hash_check',
      sql`${t.passwordHash} ~
        '^scrypt-v1[$]16384[$]8[$]5[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{86}$'`,
    ),
  }),
);

export const adminSessions = adminSchema.table(
  'sessions',
  {
    id: text('id').primaryKey(),
    adminIdentityId: text('admin_identity_id')
      .notNull()
      .references(() => adminIdentities.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp('idle_expires_at', {
      withTimezone: true,
    }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenHashUnique: unique('admin_sessions_token_hash_key').on(t.tokenHash),
    identityIdx: index('admin_sessions_identity_idx').on(t.adminIdentityId),
    activeExpiryIdx: index('admin_sessions_active_expiry_idx')
      .on(t.expiresAt, t.idleExpiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
    tokenHashCheck: check(
      'admin_sessions_token_hash_check',
      sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    expiryOrderCheck: check(
      'admin_sessions_expiry_order_check',
      sql`${t.idleExpiresAt} <= ${t.expiresAt}`,
    ),
  }),
);

/**
 * Cross-machine counters for admin login protection. Kept in the dedicated
 * database so admin authentication never depends on the application DB.
 */
export const adminRateLimitBuckets = adminSchema.table(
  'rate_limit_buckets',
  {
    bucketKey: text('bucket_key').primaryKey(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    count: integer('count').notNull(),
  },
  (t) => ({
    windowEndIdx: index('admin_rate_limit_buckets_window_end_idx').on(t.windowEnd),
    countCheck: check('admin_rate_limit_buckets_count_check', sql`${t.count} >= 0`),
  }),
);
