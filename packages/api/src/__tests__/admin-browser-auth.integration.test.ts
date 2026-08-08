import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { getAdminPool } from '../db/admin-client.js';
import { getPool, resetPool } from '../db/client.js';
import { resetAdminRateLimiter } from '../lib/adminRateLimiter.js';
import { authenticateAdmin, hashAdminPassword, setAdminPassword } from '../services/admin-auth.js';
import { startAdminPg, type AdminPgFixture } from './setup-admin-pg.js';
import { startPg, type PgFixture } from './setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3102';
const UNTRUSTED_ADMIN_ORIGINS = [
  'https://app.harpapro.com',
  'https://admin.harpapro.com.evil.example',
  'https://evil.example.com',
  'https://harpapro.com',
  'https://www.harpapro.com',
  'https://dev.harpa-pro.pages.dev',
] as const;
const ADMIN_EMAIL = 'browser-admin@harpapro.com';
const ADMIN_PASSWORD = 'correct horse battery staple admin password';

let fx: PgFixture;
let adminFx: AdminPgFixture;

function cookiePair(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('admin auth response did not set a cookie');
  return setCookie.split(';')[0]!;
}

async function login(
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
  origin = ADMIN_ORIGIN,
): Promise<Response> {
  return createApp().request('/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify({ email, password }),
  });
}

beforeAll(async () => {
  [fx, adminFx] = await Promise.all([startPg(), startAdminPg()]);
  process.env.DATABASE_URL = fx.url;
  process.env.ADMIN_DATABASE_URL = adminFx.url;
  await resetPool();
  getPool(fx.url);
  getAdminPool(adminFx.url);

  await getAdminPool().query(
    `INSERT INTO admin.identities (id, email, password_hash)
     VALUES ($1, $2, $3)`,
    ['adm_0123456789ab', ADMIN_EMAIL, await hashAdminPassword(ADMIN_PASSWORD)],
  );
}, 120_000);

afterAll(async () => {
  await Promise.all([fx?.stop(), adminFx?.stop()]);
}, 60_000);

beforeEach(() => {
  resetAdminRateLimiter();
});

describe('dedicated admin browser authentication', () => {
  it('allows credentialed admin preflights only from the configured origin', async () => {
    const app = createApp();
    const loginPreflight = await app.request('/admin/auth/login', {
      method: 'OPTIONS',
      headers: {
        origin: ADMIN_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(loginPreflight.status).toBeGreaterThanOrEqual(200);
    expect(loginPreflight.status).toBeLessThan(300);
    expect(loginPreflight.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN);
    expect(loginPreflight.headers.get('access-control-allow-credentials')).toBe('true');
    expect(loginPreflight.headers.get('access-control-allow-methods')).toMatch(/POST/);

    const appAuthPreflight = await app.request('/api/auth/sign-in/email', {
      method: 'OPTIONS',
      headers: {
        origin: ADMIN_ORIGIN,
        'access-control-request-method': 'POST',
      },
    });
    expect(appAuthPreflight.headers.get('access-control-allow-origin')).toBeNull();
    expect(appAuthPreflight.headers.get('access-control-allow-credentials')).toBeNull();

    for (const origin of UNTRUSTED_ADMIN_ORIGINS) {
      const rejected = await app.request('/admin/auth/login', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
        },
      });
      expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  it('rejects oversized login bodies before rate limiting or authentication', async () => {
    const email = 'body-limit@harpapro.com';
    const password = 'body limit admin password deliberately long';
    await setAdminPassword(email, password);
    const oversizedBody = JSON.stringify({
      email,
      password,
      padding: 'x'.repeat(8 * 1024),
    });
    const byteLength = Buffer.byteLength(oversizedBody);
    expect(byteLength).toBeGreaterThan(8 * 1024);

    const app = createApp();
    const untrustedOriginResponse = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-length': String(byteLength),
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
      },
      body: oversizedBody,
    });
    expect(untrustedOriginResponse.status).toBe(403);

    const contentLengthResponse = await app.request('/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-length': String(byteLength),
        'content-type': 'application/json',
        origin: ADMIN_ORIGIN,
      },
      body: oversizedBody,
    });

    const streamedResponses: Response[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const request = new Request('http://localhost/admin/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ADMIN_ORIGIN,
        },
        body: oversizedBody,
      });
      expect(request.headers.has('content-length')).toBe(false);
      streamedResponses.push(await app.request(request));
    }

    for (const response of [contentLengthResponse, ...streamedResponses]) {
      expect(response.status).toBe(413);
      expect(response.headers.get('cache-control')).toContain('no-store');
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'payload_too_large',
          message: 'Request body is too large.',
        },
        requestId: expect.any(String),
      });
    }

    const beforeValidLogin = await getAdminPool().query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM admin.sessions AS session
       JOIN admin.identities AS identity
         ON identity.id = session.admin_identity_id
       WHERE identity.email = $1`,
      [email],
    );
    expect(beforeValidLogin.rows).toEqual([{ count: 0 }]);

    // Four oversized attempts would exhaust the three-per-minute burst
    // bucket if any rate-limit middleware had run.
    const validLogin = await login(email, password);
    expect(validLogin.status).toBe(200);
  });

  it('sets only the dedicated HttpOnly cookie and reads the session', async () => {
    const loginResponse = await login();
    expect(loginResponse.status).toBe(200);
    const loginBody = (await loginResponse.json()) as { csrfToken: string };
    expect(loginBody).toEqual({
      authenticated: true,
      email: ADMIN_EMAIL,
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(loginResponse.headers.get('cache-control')).toContain('no-store');
    expect(loginResponse.headers.get('set-cookie')).toMatch(
      /^harpa_admin_session=[^;]+;.*HttpOnly/i,
    );
    expect(loginResponse.headers.get('set-cookie')).not.toContain('session_token');

    const session = await createApp().request('/admin/auth/session', {
      headers: {
        cookie: cookiePair(loginResponse),
        origin: ADMIN_ORIGIN,
      },
    });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toEqual({
      authenticated: true,
      email: ADMIN_EMAIL,
      csrfToken: loginBody.csrfToken,
    });
  });

  it('returns the same generic failure for every invalid credential class', async () => {
    const responses = await Promise.all([
      login(ADMIN_EMAIL, 'incorrect password long enough to submit'),
      login('unknown@harpapro.com', ADMIN_PASSWORD),
      login('browser-admin@example.com', ADMIN_PASSWORD),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
    const bodies = await Promise.all(responses.map((response) => response.text()));
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain(ADMIN_EMAIL);
    expect(bodies[0]).not.toMatch(/unknown|domain|disabled/i);
  });

  it('does not create a session from a password verified before rotation', async () => {
    const email = 'password-race@harpapro.com';
    const oldPassword = 'old admin password deliberately long enough';
    const newPassword = 'new admin password deliberately long enough';
    await setAdminPassword(email, oldPassword);

    let markVerified!: () => void;
    const verified = new Promise<void>((resolve) => {
      markVerified = resolve;
    });
    let releaseVerification!: () => void;
    const rotationCommitted = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });

    const inFlightLogin = authenticateAdmin(email, oldPassword, {
      testOnlyAfterPasswordVerified: async () => {
        markVerified();
        await rotationCommitted;
      },
    });

    await verified;
    try {
      await setAdminPassword(email, newPassword);
    } finally {
      releaseVerification();
    }

    await expect(inFlightLogin).resolves.toBeNull();
    const sessionCount = await getAdminPool().query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM admin.sessions AS session
       JOIN admin.identities AS identity
         ON identity.id = session.admin_identity_id
       WHERE identity.email = $1`,
      [email],
    );
    expect(sessionCount.rows).toEqual([{ count: 0 }]);
  });

  it('requires an exact trusted Origin for login', async () => {
    const missing = await createApp().request('/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const untrusted = await Promise.all(
      UNTRUSTED_ADMIN_ORIGINS.map((origin) => login(ADMIN_EMAIL, ADMIN_PASSWORD, origin)),
    );

    expect(missing.status).toBe(403);
    expect(untrusted.map((response) => response.status)).toEqual(
      UNTRUSTED_ADMIN_ORIGINS.map(() => 403),
    );
  });

  it('revokes the server session on logout and clears the cookie', async () => {
    const loginResponse = await login();
    const cookie = cookiePair(loginResponse);
    const logout = await createApp().request('/admin/auth/logout', {
      method: 'POST',
      headers: {
        cookie,
        origin: ADMIN_ORIGIN,
      },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toMatch(/^harpa_admin_session=;.*Max-Age=0/i);

    const session = await createApp().request('/admin/auth/session', {
      headers: {
        cookie,
        origin: ADMIN_ORIGIN,
      },
    });
    expect(session.status).toBe(401);
  });

  it('does not add admin CORS headers to unrelated routes', async () => {
    const response = await createApp().request('/healthz', {
      headers: { origin: ADMIN_ORIGIN },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
