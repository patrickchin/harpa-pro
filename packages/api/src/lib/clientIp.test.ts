import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../app.js';
import { clientIp } from './clientIp.js';

function buildApp() {
  const app = new Hono<AppEnv>();
  app.get('/', (c) => c.json({ ip: clientIp(c) }));
  return app;
}

async function call(app: ReturnType<typeof buildApp>, headers: Record<string, string>) {
  const res = await app.request('/', { headers });
  return (await res.json()) as { ip: string };
}

describe('clientIp', () => {
  const app = buildApp();

  it('prefers cf-connecting-ip over everything', async () => {
    const out = await call(app, {
      'cf-connecting-ip': '1.1.1.1',
      'fly-client-ip': '2.2.2.2',
      'x-forwarded-for': '3.3.3.3, 4.4.4.4',
    });
    expect(out.ip).toBe('1.1.1.1');
  });

  it('falls back to fly-client-ip when cf is missing', async () => {
    const out = await call(app, {
      'fly-client-ip': '2.2.2.2',
      'x-forwarded-for': '3.3.3.3',
    });
    expect(out.ip).toBe('2.2.2.2');
  });

  it('uses first hop of x-forwarded-for when cf/fly are missing', async () => {
    const out = await call(app, { 'x-forwarded-for': '3.3.3.3, 4.4.4.4' });
    expect(out.ip).toBe('3.3.3.3');
  });

  it("returns 'unknown' when no proxy header is set", async () => {
    const out = await call(app, {});
    expect(out.ip).toBe('unknown');
  });
});
