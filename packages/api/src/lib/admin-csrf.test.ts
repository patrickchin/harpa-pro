import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../app.js';

type TimingSafeEqual = typeof import('node:crypto').timingSafeEqual;

const cryptoSpies = vi.hoisted(() => ({
  timingSafeEqual: vi.fn<TimingSafeEqual>(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  cryptoSpies.timingSafeEqual.mockImplementation((left, right) =>
    actual.timingSafeEqual(left, right),
  );
  return {
    ...actual,
    timingSafeEqual: cryptoSpies.timingSafeEqual,
  };
});

import {
  ADMIN_CSRF_HEADER,
  createAdminCsrfToken,
  verifyAdminCsrfToken,
  withAdminCsrf,
} from './admin-csrf.js';

const SESSION_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SESSION_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const SESSION_A_CSRF = 'JIehe_4XLKK3xhk7lE_j-pjPuIU8AT-eOdC20HQNxzQ';

function protectedApp() {
  const app = new Hono<AppEnv>();
  app.post('/protected', withAdminCsrf(), (c) => c.json({ ok: true }, 200));
  return app;
}

function protectedRequest(sessionToken: string, csrfToken?: string): RequestInit {
  const headers = new Headers({
    cookie: `harpa_admin_session=${sessionToken}`,
  });
  if (csrfToken !== undefined) headers.set(ADMIN_CSRF_HEADER, csrfToken);
  return { method: 'POST', headers };
}

beforeEach(() => {
  cryptoSpies.timingSafeEqual.mockClear();
});

describe('dedicated admin CSRF tokens', () => {
  it('uses the reviewed custom header name', () => {
    expect(ADMIN_CSRF_HEADER).toBe('X-Admin-CSRF');
  });

  it('derives the pinned HMAC-SHA256 vector as base64url', () => {
    const token = createAdminCsrfToken(SESSION_A);

    expect(token).toBe(SESSION_A_CSRF);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).not.toBe(SESSION_A);
  });

  it('accepts only the token derived from the current opaque session', () => {
    expect(verifyAdminCsrfToken(SESSION_A, SESSION_A_CSRF)).toBe(true);
    expect(verifyAdminCsrfToken(SESSION_B, SESSION_A_CSRF)).toBe(false);
    expect(createAdminCsrfToken(SESSION_B)).not.toBe(SESSION_A_CSRF);
  });

  it('shape-checks candidates before comparing equal-length digests in constant time', () => {
    expect(verifyAdminCsrfToken(SESSION_A, 'not-base64url')).toBe(false);
    expect(cryptoSpies.timingSafeEqual).not.toHaveBeenCalled();

    const tampered = `${SESSION_A_CSRF.slice(0, -1)}A`;
    expect(tampered).toHaveLength(43);
    expect(verifyAdminCsrfToken(SESSION_A, tampered)).toBe(false);
    expect(cryptoSpies.timingSafeEqual).toHaveBeenCalledOnce();
    const [actual, expected] = cryptoSpies.timingSafeEqual.mock.calls[0]!;
    expect(actual).toHaveLength(32);
    expect(expected).toHaveLength(32);
  });
});

describe('withAdminCsrf', () => {
  it('accepts the reviewed header only with the matching dedicated admin cookie', async () => {
    const response = await protectedApp().request(
      '/protected',
      protectedRequest(SESSION_A, SESSION_A_CSRF),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-base64url'],
    ['wrong equal-length', `${SESSION_A_CSRF.slice(0, -1)}A`],
  ])('rejects a %s CSRF header', async (_case, candidate) => {
    const response = await protectedApp().request(
      '/protected',
      protectedRequest(SESSION_A, candidate),
    );

    expect(response.status).toBe(403);
  });

  it('does not accept an application session cookie as the admin cookie', async () => {
    const response = await protectedApp().request('/protected', {
      method: 'POST',
      headers: {
        cookie: `better-auth.session_token=${SESSION_A}`,
        [ADMIN_CSRF_HEADER]: SESSION_A_CSRF,
      },
    });

    expect(response.status).toBe(403);
  });

  it('invalidates the old CSRF token when the admin session cookie rotates', async () => {
    const response = await protectedApp().request(
      '/protected',
      protectedRequest(SESSION_B, SESSION_A_CSRF),
    );

    expect(response.status).toBe(403);
  });
});
