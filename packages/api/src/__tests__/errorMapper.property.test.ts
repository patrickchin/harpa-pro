/**
 * Property tests for the shared error mapper (P1.10).
 *
 * Drives a tiny app that mirrors createApp()'s middleware ordering
 * (`requestId()` first, then `app.onError(errorMapper())`) and mounts a
 * single route that throws whatever fast-check generates. We bypass
 * createApp() itself only to avoid pulling auth/db/route wiring into
 * what is purely a mapper invariant test — the middleware chain is
 * identical to production.
 *
 * Invariant under test:
 *   For every error type that can reach the wire, the response body
 *   parses against `errorEnvelope` (api-contract) and carries a non-
 *   empty requestId. Provider/inner detail never leaks; user-supplied
 *   HTTPException messages do surface (that's a feature).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { errorEnvelope } from '@harpa/api-contract';
import type { AppEnv } from '../app.js';
import { requestId } from '../middleware/requestId.js';
import { errorMapper } from '../middleware/errorMapper.js';
import { AiProviderError } from '../services/ai.js';

function buildApp(thrown: () => never) {
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', requestId());
  app.onError(errorMapper());
  app.get('/boom', () => {
    thrown();
  });
  return app;
}

interface Body {
  error: { code: string; message: string; details?: unknown };
  requestId: unknown;
}

async function fire(thrown: () => never): Promise<{ status: number; body: Body }> {
  const app = buildApp(thrown);
  const res = await app.request('/boom');
  const body = (await res.json()) as Body;
  return { status: res.status, body };
}

function assertEnvelope(body: Body) {
  // Schema invariant from api-contract.
  const parsed = errorEnvelope.safeParse(body);
  expect(parsed.success).toBe(true);
  // Runtime invariant: requestId() always populates a non-empty id, and
  // the mapper always echoes it.
  expect(typeof body.requestId).toBe('string');
  expect((body.requestId as string).length).toBeGreaterThan(0);
}

describe('errorMapper — property tests', () => {
  it('HTTPException → status preserved + envelope-valid', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 400, max: 599 }),
        fc.string(),
        async (status, message) => {
          const { status: s, body } = await fire(() => {
            throw new HTTPException(status as ContentfulStatusCode, { message });
          });
          expect(s).toBe(status);
          assertEnvelope(body);
          expect(typeof body.error.code).toBe('string');
          expect(body.error.code.length).toBeGreaterThan(0);
          // User-supplied HTTPException messages surface verbatim — that's
          // a feature (e.g. "Project not found."). Empty string falls back
          // to a canned per-status message; either way it is non-empty.
          if (message.length > 0) {
            expect(body.error.message).toBe(message);
          } else {
            expect(body.error.message.length).toBeGreaterThan(0);
          }
          // No structured `details` unless the throwing code attached them.
          expect(body.error.details).toBeUndefined();
        },
      ),
      { numRuns: 60 },
    );
  });

  it('ZodError → 400 + code=validation_error + envelope-valid', async () => {
    const schema = z.object({ name: z.string().min(2), age: z.number().int().min(0) });
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (input) => {
        const r = schema.safeParse(input);
        fc.pre(!r.success);
        const { status, body } = await fire(() => {
          throw r.error!;
        });
        expect(status).toBe(400);
        expect(body.error.code).toBe('validation_error');
        assertEnvelope(body);
        // Mapper attaches issues under details for client diagnostics.
        expect(body.error.details).toBeDefined();
      }),
      { numRuns: 60 },
    );
  });

  it('AiProviderError → 502 + canned message + no provider/fixture/inner leak', async () => {
    const PROVIDER_NAMES = [
      'openai',
      'anthropic',
      'google',
      'kimi',
      'z.ai',
      'deepseek',
      'whisper',
      'gpt-4',
      'gpt-3',
      'claude',
      'gemini',
    ];
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (msg, innerMsg) => {
        const inner = new Error(innerMsg);
        const { status, body } = await fire(() => {
          throw new AiProviderError(msg, inner);
        });
        expect(status).toBe(502);
        expect(body.error.code).toBe('ai_provider_error');
        assertEnvelope(body);
        // Strongest invariant: the message is the canned text — user-
        // supplied AiProviderError(message) NEVER reaches the wire.
        expect(body.error.message).toBe('AI provider request failed.');
        // Defence-in-depth: even if the canned text changes in future,
        // these substrings must never appear in the wire message.
        const lower = body.error.message.toLowerCase();
        for (const banned of ['fixture', ...PROVIDER_NAMES]) {
          expect(lower).not.toContain(banned);
        }
        // Inner / outer message substrings (length-gated to avoid false
        // matches against single common chars in the canned text).
        if (innerMsg.length >= 4) expect(body.error.message).not.toContain(innerMsg);
        if (msg.length >= 4) expect(body.error.message).not.toContain(msg);
        // No `details` on provider errors — mapper deliberately strips.
        expect(body.error.details).toBeUndefined();
      }),
      { numRuns: 60 },
    );
  });

  // Universe is restricted to Error subclasses on purpose. See
  // docs/bugs/README.md entry "Hono v4 onError ignores non-Error throws":
  // `throw 'oops'` / `throw 42` / `throw null` propagate out of Hono's
  // dispatch loop without invoking onError, so the mapper never runs and
  // the request would crash the worker. Production handlers throw Error
  // subclasses (HTTPException, ZodError, AiProviderError, accidental
  // TypeError/RangeError); this property covers that realistic universe.
  it('unhandled Error subclasses → 500 + canned message + no message/stack leak', async () => {
    const arb = fc.oneof(
      fc.string().map((s) => new Error(s)),
      fc.string().map((s) => new TypeError(s)),
      fc.string().map((s) => new RangeError(s)),
      fc.tuple(fc.string(), fc.string()).map(([name, msg]) => {
        const e = new Error(msg);
        e.name = name;
        return e;
      }),
    );
    await fc.assert(
      fc.asyncProperty(arb, async (thrown) => {
        const { status, body } = await fire(() => {
          throw thrown;
        });
        expect(status).toBe(500);
        expect(body.error.code).toBe('internal_error');
        assertEnvelope(body);
        // Canned message — never the thrown value's content.
        expect(body.error.message).toBe('Internal server error.');
        if (thrown.message.length >= 4) {
          expect(body.error.message).not.toContain(thrown.message);
        }
        if (thrown.stack) {
          expect(body.error.message).not.toContain(thrown.stack);
        }
        if (thrown.name.length >= 4 && thrown.name !== 'Error') {
          expect(body.error.message).not.toContain(thrown.name);
        }
        expect(body.error.details).toBeUndefined();
      }),
      { numRuns: 60 },
    );
  });
});
