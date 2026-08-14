import { serve, type ServerType } from '@hono/node-server';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrateAdmin } from '../src/db/admin-migrate.js';
import { migrate } from '../src/db/migrate.js';

function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

const API_PORT = portFromEnv('ADMIN_E2E_API_PORT', 8787);
const SITE_PORT = portFromEnv('ADMIN_E2E_SITE_PORT', 3102);
const API_BASE_URL = `http://localhost:${API_PORT}`;
const SITE_ORIGIN = `http://localhost:${SITE_PORT}`;
const ACTOR_EMAIL = 'activity-actor@e2e.harpapro.com';
const RESERVED_LABEL_ACTOR_EMAIL = 'deleted-label-live@e2e.harpapro.com';
const ADMIN_EMAIL = 'admin-activity@harpapro.com';
const ADMIN_PASSWORD = 'admin-activity-e2e-password';

let appContainer: StartedPostgreSqlContainer | undefined;
let adminContainer: StartedPostgreSqlContainer | undefined;
let server: ServerType | undefined;
let resetPool: (() => Promise<void>) | undefined;
let resetAdminPool: (() => Promise<void>) | undefined;
let stopping = false;

function configureEnvironment(appDatabaseUrl: string, adminDatabaseUrl: string): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    DATABASE_URL: appDatabaseUrl,
    ADMIN_DATABASE_URL: adminDatabaseUrl,
    BETTER_AUTH_SECRET: 'admin-activity-e2e-secret',
    BETTER_AUTH_URL: API_BASE_URL,
    EMAIL_OTP_LIVE: '0',
    ADMIN_CORS_ORIGINS: SITE_ORIGIN,
    RATE_LIMIT_BACKEND: 'memory',
    REQUEST_LOG: 'false',
    AI_FIXTURE_MODE: 'replay',
    AI_LIVE: '0',
    R2_FIXTURE_MODE: 'replay',
    TURNSTILE_LIVE: '0',
    RESEND_LIVE: '0',
  });

  delete process.env.DEMO_ACCOUNT_EMAILS;
  delete process.env.DEMO_ACCOUNT_PASSWORD;
  delete process.env.TEST_ACCOUNT_EMAILS;
  delete process.env.TEST_ACCOUNT_PASSWORD;
  delete process.env.MIGRATIONS_REQUIRED_HEAD;
  delete process.env.ADMIN_MIGRATIONS_REQUIRED_HEAD;
  delete process.env.SENTRY_DSN;
}

async function seedAppActivity(databaseUrl: string): Promise<void> {
  const [{ auth }, { newId }] = await Promise.all([
    import('../src/auth/auth.js'),
    import('../src/lib/ids.js'),
  ]);
  const authContext = await auth.$context;
  const existing = await authContext.internalAdapter.findUserByEmail(ACTOR_EMAIL);
  const user =
    existing?.user ??
    (await authContext.internalAdapter.createUser({
      email: ACTOR_EMAIL,
      name: ACTOR_EMAIL,
      emailVerified: true,
    }));
  if (!user) throw new Error(`unable to create ${ACTOR_EMAIL}`);
  const reservedLabelExisting = await authContext.internalAdapter.findUserByEmail(
    RESERVED_LABEL_ACTOR_EMAIL,
  );
  const reservedLabelUser =
    reservedLabelExisting?.user ??
    (await authContext.internalAdapter.createUser({
      email: RESERVED_LABEL_ACTOR_EMAIL,
      name: RESERVED_LABEL_ACTOR_EMAIL,
      emailVerified: true,
    }));
  if (!reservedLabelUser) {
    throw new Error(`unable to create ${RESERVED_LABEL_ACTOR_EMAIL}`);
  }

  const projectId = newId('prj');
  const reservedLabelProjectId = newId('prj');
  const reportId = newId('rpt');
  const reportEventId = newId('aud');
  const reservedLabelEventId = newId('aud');
  const deletedProjectId = newId('prj');
  const deletedReportId = newId('rpt');
  const deletedNoteId = newId('not');
  const deletedEventIds = {
    project: newId('aud'),
    report: newId('aud'),
    user: newId('aud'),
    note: newId('aud'),
  };
  const noteIds = {
    text: newId('not'),
    voice: newId('not'),
    image: newId('not'),
    document: newId('not'),
  };
  const noteEventIds = {
    text: newId('aud'),
    voice: newId('aud'),
    image: newId('aud'),
    document: newId('aud'),
  };
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE public."user"
       SET name = $2, display_name = $2, email_verified = true, is_admin = false
       WHERE id = $1`,
      [user.id, 'Admin Activity E2E'],
    );
    await client.query(
      `UPDATE public."user"
       SET name = $2, display_name = $2, email_verified = true, is_admin = false
       WHERE id = $1`,
      [reservedLabelUser.id, 'Deleted user'],
    );
    await client.query(
      `INSERT INTO app.projects (id, name, owner_id)
       VALUES ($1, $2, $3)`,
      [projectId, 'Admin Activity E2E Project', user.id],
    );
    await client.query(
      `INSERT INTO app.projects (id, name, owner_id)
       VALUES ($1, $2, $3)`,
      [reservedLabelProjectId, 'Deleted project', reservedLabelUser.id],
    );
    await client.query(
      `INSERT INTO app.project_members (project_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [projectId, user.id],
    );
    await client.query(
      `INSERT INTO app.reports (id, project_id, author_id, number)
       VALUES ($1, $2, $3, 7)`,
      [reportId, projectId, user.id],
    );
    await client.query(
      `INSERT INTO app.notes (id, report_id, author_id, kind, body)
       VALUES
         ($1, $5, $6, 'text', 'Completed the north elevation inspection.'),
         ($2, $5, $6, 'voice', NULL),
         ($3, $5, $6, 'image', NULL),
         ($4, $5, $6, 'document', NULL)`,
      [noteIds.text, noteIds.voice, noteIds.image, noteIds.document, reportId, user.id],
    );
    await client.query(
      `INSERT INTO app.activity_events
         (id, occurred_at, event_type, actor_user_id, subject_type, subject_id,
          project_id, request_id, dedupe_key, metadata)
       VALUES
         ($1, CURRENT_TIMESTAMP - INTERVAL '5 minutes', 'report.created', $2, 'report', $3,
          $4, 'request-admin-activity-e2e', $5, '{"reportNumber":7}'),
         ($6, CURRENT_TIMESTAMP - INTERVAL '1 minute', 'note.text_created', $2, 'note', $10,
          $4, 'request-note-text-e2e', $14, '{}'),
         ($7, CURRENT_TIMESTAMP - INTERVAL '2 minutes', 'note.voice_created', $2, 'note', $11,
          $4, 'request-note-voice-e2e', $15, '{}'),
         ($8, CURRENT_TIMESTAMP - INTERVAL '3 minutes', 'note.image_created', $2, 'note', $12,
          $4, 'request-note-image-e2e', $16, '{}'),
         ($9, CURRENT_TIMESTAMP - INTERVAL '4 minutes', 'note.document_created', $2, 'note', $13,
          $4, 'request-note-document-e2e', $17, '{}')`,
      [
        reportEventId,
        user.id,
        reportId,
        projectId,
        `report.created:${reportId}`,
        noteEventIds.text,
        noteEventIds.voice,
        noteEventIds.image,
        noteEventIds.document,
        noteIds.text,
        noteIds.voice,
        noteIds.image,
        noteIds.document,
        `note.text_created:${noteIds.text}`,
        `note.voice_created:${noteIds.voice}`,
        `note.image_created:${noteIds.image}`,
        `note.document_created:${noteIds.document}`,
      ],
    );
    await client.query(
      `INSERT INTO app.activity_events
         (id, occurred_at, event_type, actor_user_id, subject_type, subject_id,
          project_id, request_id, dedupe_key, metadata)
       VALUES
         ($1, CURRENT_TIMESTAMP - INTERVAL '5 minutes 30 seconds', 'project.created', $2,
          'project', $3::text, $3, 'request-live-reserved-labels-e2e', $4, '{}')`,
      [
        reservedLabelEventId,
        reservedLabelUser.id,
        reservedLabelProjectId,
        `project.created:${reservedLabelProjectId}`,
      ],
    );
    await client.query(
      `INSERT INTO app.activity_events
         (id, occurred_at, event_type, actor_user_id, subject_type, subject_id,
          project_id, request_id, dedupe_key, metadata)
       VALUES
         ($1, CURRENT_TIMESTAMP - INTERVAL '6 minutes', 'project.created', $2, 'project', $3,
          $4, 'request-deleted-project-e2e', $5, '{}'),
         ($6, CURRENT_TIMESTAMP - INTERVAL '7 minutes', 'report.created', $2, 'report', $7,
          $8, 'request-deleted-report-e2e', $9, '{"reportNumber":8}'),
         ($10, CURRENT_TIMESTAMP - INTERVAL '8 minutes', 'user.signed_up', NULL, 'user', NULL,
          NULL, 'request-deleted-user-e2e', $11, '{"method":"email_otp"}'),
         ($12, CURRENT_TIMESTAMP - INTERVAL '5 minutes', 'note.text_created', $2, 'note', $13,
          $8, 'request-deleted-note-e2e', $14, '{}')`,
      [
        deletedEventIds.project,
        user.id,
        deletedProjectId,
        deletedProjectId,
        `project.created:${deletedProjectId}`,
        deletedEventIds.report,
        deletedReportId,
        projectId,
        `report.created:${deletedReportId}`,
        deletedEventIds.user,
        `redacted:${deletedEventIds.user}`,
        deletedEventIds.note,
        deletedNoteId,
        `note.text_created:${deletedNoteId}`,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function closeServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  server = undefined;
}

async function shutdown(exitCode: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    await closeServer();
    await resetPool?.();
    await resetAdminPool?.();
    await Promise.all([appContainer?.stop(), adminContainer?.stop()]);
  } catch (error) {
    console.error('[admin-activity-e2e] cleanup failed', error);
    process.exitCode = 1;
    return;
  }
  process.exitCode = exitCode;
}

process.once('SIGINT', () => {
  void shutdown(0);
});
process.once('SIGTERM', () => {
  void shutdown(0);
});

async function main(): Promise<void> {
  delete process.env.TESTCONTAINERS_RYUK_DISABLED;
  appContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_admin_activity_app_e2e')
    .withUsername('test')
    .withPassword('test')
    .start();
  adminContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_admin_activity_auth_e2e')
    .withUsername('test')
    .withPassword('test')
    .start();

  const appDatabaseUrl = appContainer.getConnectionUri();
  const adminDatabaseUrl = adminContainer.getConnectionUri();
  configureEnvironment(appDatabaseUrl, adminDatabaseUrl);

  await Promise.all([migrate(appDatabaseUrl), migrateAdmin(adminDatabaseUrl)]);

  const [dbClient, adminDbClient] = await Promise.all([
    import('../src/db/client.js'),
    import('../src/db/admin-client.js'),
  ]);
  resetPool = dbClient.resetPool;
  resetAdminPool = adminDbClient.resetAdminPool;
  dbClient.getPool(appDatabaseUrl);
  adminDbClient.getAdminPool(adminDatabaseUrl);

  await Promise.all([
    seedAppActivity(appDatabaseUrl),
    import('../src/services/admin-auth.js').then(({ setAdminPassword }) =>
      setAdminPassword(ADMIN_EMAIL, ADMIN_PASSWORD),
    ),
  ]);

  const { createApp } = await import('../src/app.js');
  server = serve(
    {
      fetch: createApp().fetch,
      hostname: 'localhost',
      port: API_PORT,
    },
    () => {
      console.log(`[admin-activity-e2e] API ready at ${API_BASE_URL}`);
    },
  );
}

main().catch(async (error) => {
  console.error('[admin-activity-e2e] startup failed', error);
  await shutdown(1);
});
