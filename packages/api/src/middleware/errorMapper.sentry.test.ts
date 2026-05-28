import { describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { requestId } from './requestId.js';
import { errorMapper, type CaptureApiException } from './errorMapper.js';
import type { AppEnv } from '../app.js';

function buildApp(captureException: CaptureApiException, thrown: () => never) {
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', requestId());
  app.onError(errorMapper({ captureException }));
  app.get('/projects/:project/reports/:number', () => {
    thrown();
  });
  return app;
}

describe('errorMapper — Sentry capture', () => {
  it('captures unhandled 500s with request id and redacted route metadata', async () => {
    const err = new Error('boom: do not leak this to clients');
    const captureException = vi.fn<CaptureApiException>();
    const app = buildApp(captureException, () => {
      throw err;
    });

    const res = await app.request('/projects/prj_sensitive/reports/42', {
      headers: { 'x-request-id': 'rid-sentry-123' },
    });

    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        requestId: 'rid-sentry-123',
        method: 'GET',
        status: 500,
      }),
    );
    const meta = captureException.mock.calls[0]![1];
    expect(meta.route).not.toContain('prj_sensitive');
    expect(meta.route).not.toContain('/42');
    expect(meta.route).toContain(':');
  });

  it('does not capture expected 4xx HTTPExceptions', async () => {
    const captureException = vi.fn<CaptureApiException>();
    const app = buildApp(captureException, () => {
      throw new HTTPException(404, { message: 'Missing.' });
    });

    const res = await app.request('/projects/prj_public/reports/99');

    expect(res.status).toBe(404);
    expect(captureException).not.toHaveBeenCalled();
  });
});
