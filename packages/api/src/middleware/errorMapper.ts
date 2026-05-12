import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { AppEnv } from '../app.js';
import { AiProviderError } from '../services/ai.js';

/**
 * Maps thrown errors to the standard error envelope:
 *   { error: { code, message, details? }, requestId }
 */
export function errorMapper(): ErrorHandler<AppEnv> {
  return (err, c) => {
    const requestId = c.get('requestId');

    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: 'validation_error',
            message: 'Request did not match schema.',
            details: { issues: err.issues },
          },
          requestId,
        },
        400,
      );
    }

    if (err instanceof AiProviderError) {
      // Never leak provider-side detail (fixture name, hash, vendor key) to
      // the wire OR to the operator log — `err.inner` may contain a
      // FixtureMissError carrying the fixture name + request hash; drop it.
      console.error(`[api] ai_provider_error (rid=${requestId}) ${err.name}: ${err.message}`);
      return c.json(
        {
          error: { code: 'ai_provider_error', message: 'AI provider request failed.' },
          requestId,
        },
        502,
      );
    }

    if (err instanceof HTTPException) {
      const status = err.status;
      return c.json(
        {
          error: {
            code: statusToCode(status),
            message: err.message || statusToMessage(status),
          },
          requestId,
        },
        status,
      );
    }

    console.error(`[api] unhandled error (rid=${requestId})`, err);
    return c.json(
      { error: { code: 'internal_error', message: 'Internal server error.' }, requestId },
      500,
    );
  };
}

function statusToCode(s: number): string {
  if (s === 400) return 'bad_request';
  if (s === 401) return 'unauthorized';
  if (s === 403) return 'forbidden';
  if (s === 404) return 'not_found';
  if (s === 409) return 'conflict';
  if (s === 429) return 'rate_limited';
  return 'error';
}
function statusToMessage(s: number): string {
  if (s === 401) return 'Unauthorized.';
  if (s === 403) return 'Forbidden.';
  if (s === 404) return 'Not found.';
  return 'Request failed.';
}
