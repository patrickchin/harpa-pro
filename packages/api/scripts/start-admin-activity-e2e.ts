import { serve, type ServerType } from '@hono/node-server';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { migrate } from '../src/db/migrate.js';

const API_PORT = 8787;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const SITE_ORIGIN = 'http://localhost:3002';
const ADMIN_EMAIL = 'admin-activity@e2e.harpapro.com';
const ADMIN_PASSWORD = 'admin-activity-e2e-password';

let container: StartedPostgreSqlContainer | undefined;
let server: ServerType | undefined;
let resetPool: (() => Promise<void>) | undefined;
let stopping = false;

function configureEnvironment(databaseUrl: string): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: 'admin-activity-e2e-secret',
    BETTER_AUTH_URL: API_BASE_URL,
    TEST_ACCOUNT_EMAILS: ADMIN_EMAIL,
    TEST_ACCOUNT_PASSWORD: ADMIN_PASSWORD,
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
  delete process.env.MIGRATIONS_REQUIRED_HEAD;
  delete process.env.SENTRY_DSN;
}

async function seedAdminActivity(databaseUrl: string): Promise<void> {
  const [{ auth }, { newId }] = await Promise.all([
    import('../src/auth/auth.js'),
    import('../src/lib/ids.js'),
  ]);
  const authContext = await auth.$context;
  const passwordHash = await authContext.password.hash(ADMIN_PASSWORD);
  const existing = await authContext.internalAdapter.findUserByEmail(ADMIN_EMAIL);
  const user =
    existing?.user ??
    (await authContext.internalAdapter.createUser({
      email: ADMIN_EMAIL,
      name: ADMIN_EMAIL,
      emailVerified: true,
    }));
  if (!user) throw new Error(`unable to create ${ADMIN_EMAIL}`);

  await authContext.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: passwordHash,
  });

  const projectId = newId('prj');
  const reportId = newId('rpt');
  const eventId = newId('aud');
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE public."user"
       SET name = $2, display_name = $2, email_verified = true, is_admin = true
       WHERE id = $1`,
      [user.id, 'Admin Activity E2E'],
    );
    await client.query(
      `INSERT INTO app.projects (id, name, owner_id)
       VALUES ($1, $2, $3)`,
      [projectId, 'Admin Activity E2E Project', user.id],
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
      `INSERT INTO app.activity_events
         (id, occurred_at, event_type, actor_user_id, subject_type, subject_id,
          project_id, request_id, dedupe_key, metadata)
       VALUES
         ($1, '2026-07-29T04:00:00Z', 'report.created', $2, 'report', $3,
          $4, 'request-admin-activity-e2e', $5, '{"reportNumber":7}')`,
      [eventId, user.id, reportId, projectId, `report.created:${reportId}`],
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
    await container?.stop();
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
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_admin_activity_e2e')
    .withUsername('test')
    .withPassword('test')
    .start();

  const databaseUrl = container.getConnectionUri();
  configureEnvironment(databaseUrl);
  await migrate(databaseUrl);

  const dbClient = await import('../src/db/client.js');
  resetPool = dbClient.resetPool;
  dbClient.getPool(databaseUrl);
  await seedAdminActivity(databaseUrl);

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
