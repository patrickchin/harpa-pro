import type { OpenAPIHonoOptions } from '@hono/zod-openapi';
import type { AppEnv } from '../app.js';

/**
 * Route-level Zod validation normally returns zod-openapi's private result
 * shape directly. Throw instead so the application error mapper emits the
 * same public envelope as every other validation failure.
 */
export const openApiHonoOptions: OpenAPIHonoOptions<AppEnv> = {
  defaultHook: (result) => {
    if (!result.success) throw result.error;
  },
};
