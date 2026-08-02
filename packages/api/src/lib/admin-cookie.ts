import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../app.js';
import { env, isCrossSiteAdminOrigin } from '../env.js';

export const ADMIN_SESSION_COOKIE_NAME = 'harpa_admin_session';
export const ADMIN_SESSION_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

type CookieOptions = NonNullable<Parameters<typeof setCookie>[3]>;

function isDeployed(): boolean {
  return env.NODE_ENV === 'production';
}

function needsPartitionedCookie(c: Context<AppEnv>): boolean {
  const origin = c.req.header('origin');
  return origin !== undefined && isCrossSiteAdminOrigin(origin);
}

function cookieOptions(c: Context<AppEnv>): CookieOptions {
  if (!isDeployed()) {
    return {
      httpOnly: true,
      maxAge: ADMIN_SESSION_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'Strict',
      secure: false,
      priority: 'High',
    };
  }

  if (needsPartitionedCookie(c)) {
    return {
      httpOnly: true,
      maxAge: ADMIN_SESSION_COOKIE_MAX_AGE_SECONDS,
      partitioned: true,
      path: '/',
      prefix: 'host',
      sameSite: 'None',
      secure: true,
      priority: 'High',
    };
  }

  return {
    httpOnly: true,
    maxAge: ADMIN_SESSION_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    prefix: 'host',
    sameSite: 'Strict',
    secure: true,
    priority: 'High',
  };
}

export function readAdminSessionToken(c: Context<AppEnv>): string | undefined {
  return isDeployed()
    ? getCookie(c, ADMIN_SESSION_COOKIE_NAME, 'host')
    : getCookie(c, ADMIN_SESSION_COOKIE_NAME);
}

export function setAdminSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, ADMIN_SESSION_COOKIE_NAME, token, cookieOptions(c));
}

export function clearAdminSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE_NAME, cookieOptions(c));
}
