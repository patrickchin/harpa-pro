import { describe, it, expect } from 'vitest';
import { signTestToken } from './auth.js';
import { Hono } from 'hono';
import { withAuth } from './auth.js';
import type { AppEnv } from '../app.js';

describe('withAuth', () => {
  it('rejects missing bearer', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', withAuth());
    app.get('/x', (c) => c.text('ok'));
    const res = await app.request('/x');
    expect(res.status).toBe(401);
  });

  it('accepts a valid signed test token', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', withAuth());
    app.get('/me', (c) => c.json({ uid: c.get('userId'), sid: c.get('sessionId') }));
    const sub = '11111111-1111-1111-1111-111111111111';
    const sid = '22222222-2222-2222-2222-222222222222';
    const token = signTestToken(sub, sid);
    const res = await app.request('/me', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uid: sub, sid });
  });

  it('rejects a tampered token', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', withAuth());
    app.get('/x', (c) => c.text('ok'));
    const token = signTestToken('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const tampered = token.slice(0, -2) + (token.endsWith('00') ? '11' : '00');
    const res = await app.request('/x', { headers: { authorization: `Bearer ${tampered}` } });
    expect(res.status).toBe(401);
  });
});
