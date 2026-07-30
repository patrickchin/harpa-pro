import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminPool } from '../db/admin-client.js';
import { listAdminMigrationFiles, migrateAdmin } from '../db/admin-migrate.js';
import {
  authenticateAdmin,
  hashAdminPassword,
  readAdminSession,
  setAdminPassword,
} from '../services/admin-auth.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';

const PASSWORD = 'integration admin password is deliberately long';

let adminFx: AdminPgFixture;
let validPasswordHash: string;

beforeAll(async () => {
  adminFx = await startAdminPg();
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  getAdminPool(adminFx.url);
  validPasswordHash = await hashAdminPassword(PASSWORD);
}, 120_000);

afterAll(async () => {
  await adminFx?.stop();
}, 60_000);

async function createSession(email: string) {
  await setAdminPassword(email, PASSWORD);
  const session = await authenticateAdmin(email, PASSWORD);
  if (!session) throw new Error(`expected an admin session for ${email}`);
  return session;
}

describe('separate admin authentication database', () => {
  it('can rerun the isolated admin migration without changing its ledger', async () => {
    const rerun = await migrateAdmin(adminFx.url);
    const ledger = await getAdminPool().query<{ name: string }>(
      'SELECT name FROM admin._migrations ORDER BY name',
    );

    expect(rerun.applied).toEqual([]);
    expect(ledger.rows.map((row) => row.name)).toEqual(listAdminMigrationFiles());
  });

  it('rejects a disabled identity and invalidates its existing session', async () => {
    const email = 'disabled-integration@harpapro.com';
    const session = await createSession(email);

    await getAdminPool().query(
      `UPDATE admin.identities
       SET disabled_at = now()
       WHERE id = $1`,
      [session.identityId],
    );

    await expect(authenticateAdmin(email, PASSWORD)).resolves.toBeNull();
    await expect(readAdminSession(session.token)).resolves.toBeNull();
  });

  it('rejects a session after its idle window expires', async () => {
    const session = await createSession('idle-expiry@harpapro.com');
    await expect(readAdminSession(session.token)).resolves.toMatchObject({
      sessionId: session.sessionId,
    });

    await getAdminPool().query(
      `UPDATE admin.sessions
       SET idle_expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [session.sessionId],
    );

    await expect(readAdminSession(session.token)).resolves.toBeNull();
  });

  it('throttles idle-window touches and clamps them to absolute expiry', async () => {
    const session = await createSession('idle-touch@harpapro.com');
    await getAdminPool().query(
      `UPDATE admin.sessions
       SET
         expires_at = now() + interval '30 minutes',
         idle_expires_at = now() + interval '1 minute',
         last_seen_at = now() - interval '6 minutes'
       WHERE id = $1`,
      [session.sessionId],
    );
    const before = await getAdminPool().query<{
      expires_at: Date;
      idle_expires_at: Date;
      last_seen_at: Date;
    }>(
      `SELECT expires_at, idle_expires_at, last_seen_at
       FROM admin.sessions
       WHERE id = $1`,
      [session.sessionId],
    );

    await expect(readAdminSession(session.token)).resolves.toMatchObject({
      sessionId: session.sessionId,
    });
    const afterTouch = await getAdminPool().query<{
      expires_at: Date;
      idle_expires_at: Date;
      last_seen_at: Date;
    }>(
      `SELECT expires_at, idle_expires_at, last_seen_at
       FROM admin.sessions
       WHERE id = $1`,
      [session.sessionId],
    );
    const beforeRow = before.rows[0]!;
    const touchedRow = afterTouch.rows[0]!;
    expect(touchedRow.last_seen_at.getTime()).toBeGreaterThan(beforeRow.last_seen_at.getTime());
    expect(touchedRow.idle_expires_at.getTime()).toBeGreaterThan(
      beforeRow.idle_expires_at.getTime(),
    );
    expect(touchedRow.idle_expires_at.getTime()).toBe(touchedRow.expires_at.getTime());

    await expect(readAdminSession(session.token)).resolves.toMatchObject({
      sessionId: session.sessionId,
    });
    const afterImmediateRead = await getAdminPool().query<{
      expires_at: Date;
      idle_expires_at: Date;
      last_seen_at: Date;
    }>(
      `SELECT expires_at, idle_expires_at, last_seen_at
       FROM admin.sessions
       WHERE id = $1`,
      [session.sessionId],
    );
    expect(afterImmediateRead.rows).toEqual(afterTouch.rows);
  });

  it('rejects a session after its absolute window expires', async () => {
    const session = await createSession('absolute-expiry@harpapro.com');
    await expect(readAdminSession(session.token)).resolves.toMatchObject({
      sessionId: session.sessionId,
    });

    await getAdminPool().query(
      `UPDATE admin.sessions
       SET
         expires_at = now() - interval '1 second',
         idle_expires_at = now() - interval '2 seconds'
       WHERE id = $1`,
      [session.sessionId],
    );

    await expect(readAdminSession(session.token)).resolves.toBeNull();
  });

  it('rotates a password and revokes sessions issued for the old password', async () => {
    const email = 'password-rotation@harpapro.com';
    const oldPassword = 'old integration admin password is long enough';
    const newPassword = 'new integration admin password is long enough';
    await setAdminPassword(email, oldPassword);
    const oldSession = await authenticateAdmin(email, oldPassword);
    if (!oldSession) throw new Error('expected a session before password rotation');

    const rotatedIdentity = await setAdminPassword(email, newPassword);
    const persistedSession = await getAdminPool().query<{ revoked: boolean }>(
      `SELECT revoked_at IS NOT NULL AS revoked
       FROM admin.sessions
       WHERE id = $1`,
      [oldSession.sessionId],
    );

    expect(rotatedIdentity.id).toBe(oldSession.identityId);
    expect(persistedSession.rows).toEqual([{ revoked: true }]);
    await expect(readAdminSession(oldSession.token)).resolves.toBeNull();
    await expect(authenticateAdmin(email, oldPassword)).resolves.toBeNull();
    await expect(authenticateAdmin(email, newPassword)).resolves.toMatchObject({
      identityId: oldSession.identityId,
      email,
    });
  });

  it('enforces identity and session constraints in Postgres', async () => {
    await expect(
      getAdminPool().query(
        `INSERT INTO admin.identities (id, email, password_hash)
         VALUES ('usr_11111111', 'invalid-id@harpapro.com', $1)`,
        [validPasswordHash],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      getAdminPool().query(
        `INSERT INTO admin.identities (id, email, password_hash)
         VALUES ('adm_11111111', 'Uppercase@harpapro.com', $1)`,
        [validPasswordHash],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      getAdminPool().query(
        `INSERT INTO admin.identities (id, email, password_hash)
         VALUES ('adm_33333333', 'wrong-domain@example.com', $1)`,
        [validPasswordHash],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      getAdminPool().query(
        `INSERT INTO admin.identities (id, email, password_hash)
         VALUES ('adm_22222222', 'invalid-hash@harpapro.com', 'not-a-hash')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const identity = await setAdminPassword('constraint-owner@harpapro.com', PASSWORD);
    await expect(
      getAdminPool().query(
        `INSERT INTO admin.sessions (
           id,
           admin_identity_id,
           token_hash,
           expires_at,
           idle_expires_at
         )
         VALUES (
           'ses_11111111',
           $1,
           $2,
           now() + interval '1 hour',
           now() + interval '30 minutes'
         )`,
        [identity.id, 'b'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      getAdminPool().query(
        `INSERT INTO admin.sessions (
           id,
           admin_identity_id,
           token_hash,
           expires_at,
           idle_expires_at
         )
         VALUES (
           'ads_11111111',
           $1,
           'not-a-token-hash',
           now() + interval '1 hour',
           now() + interval '30 minutes'
         )`,
        [identity.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      getAdminPool().query(
        `INSERT INTO admin.sessions (
           id,
           admin_identity_id,
           token_hash,
           expires_at,
           idle_expires_at
         )
         VALUES (
           'ads_22222222',
           $1,
           $2,
           now() + interval '1 hour',
           now() + interval '2 hours'
         )`,
        [identity.id, 'a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps row-level security enabled on both admin-auth tables', async () => {
    const tables = await getAdminPool().query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      `SELECT class.relname, class.relrowsecurity
       FROM pg_class AS class
       JOIN pg_namespace AS namespace
         ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'admin'
         AND class.relname IN ('identities', 'sessions')
       ORDER BY class.relname`,
    );

    expect(tables.rows).toEqual([
      { relname: 'identities', relrowsecurity: true },
      { relname: 'sessions', relrowsecurity: true },
    ]);
  });

  it('denies an unprivileged role access to the admin schema and tables', async () => {
    await getAdminPool().query('CREATE ROLE admin_auth_integration_probe NOLOGIN');
    const privileges = await getAdminPool().query<{
      identities_select: boolean;
      schema_usage: boolean;
      sessions_select: boolean;
    }>(
      `SELECT
         has_schema_privilege(
           'admin_auth_integration_probe',
           'admin',
           'USAGE'
         ) AS schema_usage,
         has_table_privilege(
           'admin_auth_integration_probe',
           'admin.identities',
           'SELECT'
         ) AS identities_select,
         has_table_privilege(
           'admin_auth_integration_probe',
           'admin.sessions',
           'SELECT'
         ) AS sessions_select`,
    );
    expect(privileges.rows).toEqual([
      {
        schema_usage: false,
        identities_select: false,
        sessions_select: false,
      },
    ]);

    const client = await getAdminPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE admin_auth_integration_probe');
      await expect(client.query('SELECT id FROM admin.identities')).rejects.toMatchObject({
        code: '42501',
      });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
