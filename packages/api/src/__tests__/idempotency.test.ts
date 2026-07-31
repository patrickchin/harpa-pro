import { Hono, type Context } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdempotencyStore } from '../lib/idempotencyStore.js';
import { withIdempotency } from '../middleware/idempotency.js';

type TestEnv = {
  Variables: {
    requestId: string;
    userId?: string;
  };
};

const headers = {
  'content-type': 'application/json',
  'idempotency-key': 'same-client-key',
};

function createHarness() {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'req_idempotency_test');
    c.set('userId', 'usr_idempotency_test');
    await next();
  });
  return app;
}

beforeEach(() => {
  resetIdempotencyStore();
});

describe('withIdempotency request scope', () => {
  it('does not replay a key used with a different HTTP method', async () => {
    const app = createHarness();
    const middleware = withIdempotency({ name: 'shared-operation' });
    let executions = 0;
    const handler = (method: string) => async (c: Context<TestEnv>) => {
      executions += 1;
      return c.json({ method, executions });
    };

    app.post('/resource', middleware, handler('POST'));
    app.put('/resource', middleware, handler('PUT'));

    const first = await app.request('/resource', { method: 'POST', headers, body: '{}' });
    const second = await app.request('/resource', { method: 'PUT', headers, body: '{}' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get('idempotent-replay')).toBeNull();
    expect(await second.json()).toEqual({ method: 'PUT', executions: 2 });
  });

  it('does not replay a key used on a different path', async () => {
    const app = createHarness();
    const middleware = withIdempotency({ name: 'shared-operation' });
    let executions = 0;

    app.post('/reports/1/generate', middleware, (c) => {
      executions += 1;
      return c.json({ report: 1, executions });
    });
    app.post('/reports/2/generate', middleware, (c) => {
      executions += 1;
      return c.json({ report: 2, executions });
    });

    await app.request('/reports/1/generate', { method: 'POST', headers, body: '{}' });
    const second = await app.request('/reports/2/generate', {
      method: 'POST',
      headers,
      body: '{}',
    });

    expect(second.headers.get('idempotent-replay')).toBeNull();
    expect(await second.json()).toEqual({ report: 2, executions: 2 });
  });

  it('does not replay a key used with a different JSON body', async () => {
    const app = createHarness();
    const middleware = withIdempotency({ name: 'shared-operation' });
    let executions = 0;

    app.post('/resource', middleware, async (c) => {
      executions += 1;
      const body = await c.req.json<{ fixtureName: string }>();
      return c.json({ fixtureName: body.fixtureName, executions });
    });

    await app.request('/resource', {
      method: 'POST',
      headers,
      body: JSON.stringify({ fixtureName: 'first' }),
    });
    const second = await app.request('/resource', {
      method: 'POST',
      headers,
      body: JSON.stringify({ fixtureName: 'second' }),
    });

    expect(second.headers.get('idempotent-replay')).toBeNull();
    expect(await second.json()).toEqual({ fixtureName: 'second', executions: 2 });
  });
});

describe('withIdempotency concurrency', () => {
  it('coalesces concurrent requests so the side-effect runs once', async () => {
    const app = createHarness();
    let executions = 0;

    app.post('/generate', withIdempotency({ name: 'reports.generate' }), async (c) => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return c.json({ executions });
    });

    const request = () =>
      app.request('/generate', {
        method: 'POST',
        headers,
        body: '{}',
      });
    const responses = await Promise.all([request(), request()]);

    expect(executions).toBe(1);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      responses
        .map((response) => response.headers.get('idempotent-replay'))
        .sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual([null, 'true']);
    expect(await responses[0]!.text()).toBe(await responses[1]!.text());
  });
});
