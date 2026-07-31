import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getAdminPool } from '../db/admin-client.js';
import { newId } from '../lib/ids.js';

const PASSWORD_MIN_LENGTH = 20;
const PASSWORD_MAX_LENGTH = 128;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 5;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PASSWORD_HASH_PREFIX = 'scrypt-v1';

const SESSION_TOKEN_BYTES = 32;
const SESSION_ABSOLUTE_HOURS = 12;
const SESSION_IDLE_HOURS = 2;
const SESSION_TOUCH_AFTER_MINUTES = 5;

/**
 * A real scrypt hash used when no usable identity hash is available. Keeping
 * this precomputed ensures unknown accounts pay the same password-work cost
 * without adding a second scrypt invocation on the first request.
 */
const DUMMY_PASSWORD_HASH =
  'scrypt-v1$16384$8$5$aGFycGEtYWRtaW4tdjEhIQ$EHMkxgNilTu8mb5UQIoyiLFU57_-X51qOMbAhgBdLUZ6pEKb0ES5os872XMyK2-TWfx4Gz1nhtWkPrOxLItsmA';

interface AdminIdentityRow {
  id: string;
  email: string;
  password_hash: string;
  disabled_at: Date | null;
}

export interface AdminSession {
  identityId: string;
  sessionId: string;
  email: string;
  expiresAt: Date;
}

export interface NewAdminSession extends AdminSession {
  token: string;
}

export interface ProvisionedAdminIdentity {
  id: string;
  email: string;
}

function passwordLength(password: string): number {
  return Array.from(password).length;
}

function passwordHasAllowedLength(password: string): boolean {
  const length = passwordLength(password);
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
}

function scrypt(password: string, salt: Buffer, keyLength = SCRYPT_KEY_LENGTH): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      keyLength,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

/**
 * Return the canonical email only for the exact corporate domain.
 *
 * The deliberately conservative local-part grammar covers normal corporate
 * addresses and excludes whitespace, multiple-at forms, and lookalike
 * domains before a query reaches the admin database.
 */
export function canonicalAdminEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;

  const at = email.lastIndexOf('@');
  if (at <= 0 || email.indexOf('@') !== at) return null;
  if (email.slice(at + 1) !== 'harpapro.com') return null;

  const localPart = email.slice(0, at);
  if (
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..') ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)
  ) {
    return null;
  }
  return email;
}

export async function hashAdminPassword(password: string): Promise<string> {
  if (!passwordHasAllowedLength(password)) {
    throw new Error(
      `Admin passwords must contain between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }

  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt);
  return [
    PASSWORD_HASH_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyAdminPassword(password: string, storedHash: string): Promise<boolean> {
  if (!passwordHasAllowedLength(password)) return false;

  const parts = storedHash.split('$');
  if (
    parts.length !== 6 ||
    parts[0] !== PASSWORD_HASH_PREFIX ||
    parts[1] !== String(SCRYPT_N) ||
    parts[2] !== String(SCRYPT_R) ||
    parts[3] !== String(SCRYPT_P) ||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[4] ?? '') ||
    !/^[A-Za-z0-9_-]{86}$/.test(parts[5] ?? '')
  ) {
    return false;
  }

  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

  const actual = await scrypt(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function isSessionToken(token: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  return Buffer.from(token, 'base64url').length === SESSION_TOKEN_BYTES;
}

/**
 * Create or rotate an explicitly provisioned admin credential.
 *
 * Password rotation revokes every existing session in the same transaction.
 * It intentionally does not re-enable a disabled identity.
 */
export async function setAdminPassword(
  emailInput: string,
  password: string,
): Promise<ProvisionedAdminIdentity> {
  const email = canonicalAdminEmail(emailInput);
  if (!email) {
    throw new Error('Admin email must use the exact @harpapro.com domain.');
  }
  const passwordHash = await hashAdminPassword(password);
  const proposedId = newId('adm');
  const client = await getAdminPool().connect();

  try {
    await client.query('BEGIN');
    const identityResult = await client.query<{ id: string; email: string }>(
      `INSERT INTO admin.identities (id, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         password_changed_at = now(),
         updated_at = now()
       RETURNING id::text AS id, email`,
      [proposedId, email, passwordHash],
    );
    const identity = identityResult.rows[0];
    if (!identity) throw new Error('Admin identity provisioning returned no row.');

    await client.query(
      `UPDATE admin.sessions
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE admin_identity_id = $1
         AND revoked_at IS NULL`,
      [identity.id],
    );
    await client.query('COMMIT');
    return identity;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validate a dedicated admin credential and create a revocable opaque
 * session. Every credential-shaped rejection performs one scrypt check.
 */
export async function authenticateAdmin(
  emailInput: string,
  password: string,
  options: {
    /**
     * Deterministic race-test seam. Production callers must omit this.
     * It pauses after verification but before the hash-bound session write.
     */
    testOnlyAfterPasswordVerified?: () => Promise<void>;
  } = {},
): Promise<NewAdminSession | null> {
  const email = canonicalAdminEmail(emailInput);
  const identity = email
    ? ((
        await getAdminPool().query<AdminIdentityRow>(
          `SELECT id::text AS id, email, password_hash, disabled_at
         FROM admin.identities
         WHERE email = $1`,
          [email],
        )
      ).rows[0] ?? null)
    : null;

  const candidatePassword = passwordHasAllowedLength(password)
    ? password
    : 'admin dummy password value only';
  const passwordMatches = await verifyAdminPassword(
    candidatePassword,
    identity?.password_hash ?? DUMMY_PASSWORD_HASH,
  );
  if (
    !email ||
    !identity ||
    identity.disabled_at !== null ||
    !passwordHasAllowedLength(password) ||
    !passwordMatches
  ) {
    return null;
  }

  await options.testOnlyAfterPasswordVerified?.();
  return createAdminSession(identity);
}

async function createAdminSession(identity: AdminIdentityRow): Promise<NewAdminSession | null> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const sessionId = newId('ads');
  const client = await getAdminPool().connect();

  try {
    await client.query('BEGIN');
    const activeIdentity = await client.query<{ id: string; email: string }>(
      `UPDATE admin.identities
       SET last_login_at = now(), updated_at = now()
       WHERE id = $1
         AND password_hash = $2
         AND disabled_at IS NULL
       RETURNING id::text AS id, email`,
      [identity.id, identity.password_hash],
    );
    const active = activeIdentity.rows[0];
    if (!active) {
      await client.query('ROLLBACK');
      return null;
    }

    const sessionResult = await client.query<{ expires_at: Date }>(
      `INSERT INTO admin.sessions (
         id,
         admin_identity_id,
         token_hash,
         expires_at,
         idle_expires_at,
         last_seen_at
       )
       VALUES (
         $1,
         $2,
         $3,
         now() + make_interval(hours => $4),
         now() + make_interval(hours => $5),
         now()
       )
       RETURNING expires_at`,
      [sessionId, active.id, tokenHash, SESSION_ABSOLUTE_HOURS, SESSION_IDLE_HOURS],
    );
    const session = sessionResult.rows[0];
    if (!session) throw new Error('Admin session creation returned no row.');

    await client.query('COMMIT');
    return {
      identityId: active.id,
      sessionId,
      email: active.email,
      expiresAt: session.expires_at,
      token,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Resolve an opaque browser token against the admin database.
 *
 * The idle window slides by two hours, but writes are limited to one touch
 * every five minutes. Absolute expiry never moves.
 */
export async function readAdminSession(token: string): Promise<AdminSession | null> {
  if (!isSessionToken(token)) return null;
  const tokenHash = hashSessionToken(token);

  const touched = await getAdminPool().query<{
    identity_id: string;
    session_id: string;
    email: string;
    expires_at: Date;
  }>(
    `UPDATE admin.sessions AS session
     SET
       last_seen_at = now(),
       idle_expires_at = LEAST(
         session.expires_at,
         now() + make_interval(hours => $2)
       )
     FROM admin.identities AS identity
     WHERE session.admin_identity_id = identity.id
       AND session.token_hash = $1
       AND session.revoked_at IS NULL
       AND identity.disabled_at IS NULL
       AND session.expires_at > now()
       AND session.idle_expires_at > now()
       AND session.last_seen_at <=
         now() - make_interval(mins => $3)
     RETURNING
       identity.id::text AS identity_id,
       session.id::text AS session_id,
       identity.email,
       session.expires_at`,
    [tokenHash, SESSION_IDLE_HOURS, SESSION_TOUCH_AFTER_MINUTES],
  );
  const touchedRow = touched.rows[0];
  if (touchedRow) return mapAdminSession(touchedRow);

  const existing = await getAdminPool().query<{
    identity_id: string;
    session_id: string;
    email: string;
    expires_at: Date;
  }>(
    `SELECT
       identity.id::text AS identity_id,
       session.id::text AS session_id,
       identity.email,
       session.expires_at
     FROM admin.sessions AS session
     JOIN admin.identities AS identity
       ON identity.id = session.admin_identity_id
     WHERE session.token_hash = $1
       AND session.revoked_at IS NULL
       AND identity.disabled_at IS NULL
       AND session.expires_at > now()
       AND session.idle_expires_at > now()`,
    [tokenHash],
  );
  const row = existing.rows[0];
  return row ? mapAdminSession(row) : null;
}

export async function revokeAdminSession(sessionId: string): Promise<void> {
  await getAdminPool().query(
    `UPDATE admin.sessions
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE id = $1`,
    [sessionId],
  );
}

function mapAdminSession(row: {
  identity_id: string;
  session_id: string;
  email: string;
  expires_at: Date;
}): AdminSession {
  return {
    identityId: row.identity_id,
    sessionId: row.session_id,
    email: row.email,
    expiresAt: row.expires_at,
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original transaction error.
  }
}
