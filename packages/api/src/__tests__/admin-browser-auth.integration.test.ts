import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { getPool, resetPool } from '../db/client.js';
import { hashAdminPassword } from '../services/admin-auth.js';
import { startPg, type PgFixture } from './setup-pg.js';

const ADMIN_ORIGIN = 'http://localhost:3002';
const ADMIN_EMAIL = 'browser-admin@harpapro.com';
const ADMIN_PASSWORD = 'correct horse battery staple admin password';

let fx: PgFixture;

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
  fx = await startPg();
  process.env.DATABASE_URL = fx.url;
  await resetPool();
  getPool(fx.url);

  await getPool().query(
    `INSERT INTO app.admin_identities (id, email, password_hash)
     VALUES ($1, $2, $3)`,
    ['adm_0123456789ab', ADMIN_EMAIL, await hashAdminPassword(ADMIN_PASSWORD)],
  );
}, 120_000);

afterAll(async () => {
  await fx?.stop();
}, 60_000);

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

    const rejected = await app.request('/admin/auth/login', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'POST',
      },
    });
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sets only the dedicated HttpOnly cookie and reads the session', async () => {
    const loginResponse = await login();
    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toEqual({
      authenticated: true,
      email: ADMIN_EMAIL,
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

  it('requires an exact trusted Origin for login', async () => {
    const missing = await createApp().request('/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const untrusted = await login(
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      'https://admin.harpapro.com.evil.example',
    );

    expect(missing.status).toBe(403);
    expect(untrusted.status).toBe(403);
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
