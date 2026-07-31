import { getPublicEnv } from './env';

export interface AdminSession {
  authenticated: true;
  email: string;
}

interface AdminLogin {
  email: string;
  password: string;
}

export type AdminAuthErrorCode = 'invalid_credentials' | 'rate_limited' | 'unavailable';

export class AdminAuthError extends Error {
  readonly code: AdminAuthErrorCode;

  constructor(code: AdminAuthErrorCode) {
    super(`Admin authentication failed: ${code}`);
    this.name = 'AdminAuthError';
    this.code = code;
  }
}

function parseSession(value: unknown): AdminSession {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('authenticated' in value) ||
    value.authenticated !== true ||
    !('email' in value) ||
    typeof value.email !== 'string'
  ) {
    throw new Error('Invalid admin session response');
  }

  return {
    authenticated: true,
    email: value.email,
  };
}

async function getSession(): Promise<AdminSession | null> {
  const response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/auth/session`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new AdminAuthError('unavailable');

  return parseSession(await response.json());
}

async function login(credentials: AdminLogin): Promise<AdminSession> {
  const response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(credentials),
  });

  if (response.status === 401) throw new AdminAuthError('invalid_credentials');
  if (response.status === 429) throw new AdminAuthError('rate_limited');
  if (!response.ok) throw new AdminAuthError('unavailable');

  return parseSession(await response.json());
}

async function logout(): Promise<void> {
  const response = await fetch(`${getPublicEnv().apiBaseUrl}/admin/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok && response.status !== 401) {
    throw new AdminAuthError('unavailable');
  }
}

export const adminAuthClient = {
  getSession,
  login,
  logout,
};
