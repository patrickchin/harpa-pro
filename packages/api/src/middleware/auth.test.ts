import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { signTestToken, withAuth } from './auth.js';
import type { AppEnv } from '../app.js';

describe('withAuth', () => {
  it('rejects missing bearer', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', withAuth());
    app.get('/x', (c) => c.text('ok'));
    const res = await app.request('/x');
    expect(res.status).toBe(401);
  });

  it('accepts a valid signed JWT', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', withAuth());
    app.get('/me', (c) => c.json({ uid: c.get('userId'), sid: c.get('sessionId') }));
    const sub = '11111111-1111-1111-1111-111111111111';
    const sid = '22222222-2222-2222-2222-222222222222';
    const token = await signTestToken(sub, sid);
    const res = await app.request('/me', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uid: sub, sid });
  });

  it('rejects a tampered token', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', withAuth());
    app.get('/x', (c) => c.text('ok'));
    const token = await signTestToken(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    );
    // Flip a bit in the payload segment so the signature no longer matches.
    // (Tampering only the trailing base64url char of the signature is unsafe:
    // for HS256 the last char encodes 4 significant bits + 2 padding bits, so
    // some swaps decode to the same signature bytes and the token still
    // verifies — see also docs/bugs/README.md.)
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) throw new Error('expected 3-segment JWT');
    const flipped = payload.charAt(0) === 'a' ? 'b' : 'a';
    const tamperedPayload = flipped + payload.slice(1);
    const tampered = `${header}.${tamperedPayload}.${signature}`;
    const res = await app.request('/x', { headers: { authorization: `Bearer ${tampered}` } });
    expect(res.status).toBe(401);
  });
});
