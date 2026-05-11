import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AppEnv } from '../app.js';

export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const id = incoming && /^[\w-]{6,128}$/.test(incoming) ? incoming : randomUUID();
    c.set('requestId', id);
    c.header('x-request-id', id);
    await next();
  };
}
