import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

describe('healthz', () => {
  it('returns ok', async () => {
    const app = createApp();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, service: 'api', version: '0.0.0' });
    expect(res.headers.get('x-request-id')).toMatch(/^[\w-]{6,}$/);
  });

  it('echoes a sane x-request-id when provided', async () => {
    const app = createApp();
    const res = await app.request('/healthz', { headers: { 'x-request-id': 'rid-abc-1234' } });
    expect(res.headers.get('x-request-id')).toBe('rid-abc-1234');
  });

  it('exposes the openapi document', async () => {
    const app = createApp();
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/healthz']).toBeDefined();
  });
});
