/**
 * HS256 JWT issuance + verification for the self-hosted auth flow.
 *
 * We deliberately do not pull in the `better-auth` package — its
 * abstractions add complexity we don't need for phone-OTP + session
 * row + JWT. The shape of the issued token (sub, sid, exp, iss) matches
 * what `docs/v4/arch-auth-and-rls.md` specifies and what
 * `withScopedConnection` consumes via the auth middleware.
 */
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';
import { assertId } from '../lib/ids.js';

const ISSUER = 'harpa-api';
const ALG = 'HS256';
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, per arch doc.

export interface JwtClaims {
  /** User id slug (e.g. `usr_abcdef12`). Shape enforced via `assertId` in `verifyJwt`. */
  sub: string;
  /** Session id slug (e.g. `ses_abcdef12abcd`). Shape enforced via `assertId` in `verifyJwt`. */
  sid: string;
}

function secretBytes(): Uint8Array {
  return new TextEncoder().encode(env.BETTER_AUTH_SECRET);
}

export async function signJwt(claims: JwtClaims, ttlSeconds = TTL_SECONDS): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secretBytes());
}

export async function verifyJwt(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, secretBytes(), {
    issuer: ISSUER,
    algorithms: [ALG],
  });
  const sub = payload.sub;
  const sid = typeof payload['sid'] === 'string' ? (payload['sid'] as string) : undefined;
  if (!sub || !sid) {
    throw new Error('jwt missing sub/sid');
  }
  // Brand at the trust boundary. Bad-shape tokens (legacy uuid, garbage)
  // fail here rather than at the SET LOCAL site downstream.
  return { sub: assertId('usr', sub, 'jwt.sub'), sid: assertId('ses', sid, 'jwt.sid') };
}
