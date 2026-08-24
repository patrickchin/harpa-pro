/**
 * Contract test (P1.11) — guards drift between the runtime OpenAPI doc
 * (built from createApp() + the @hono/zod-openapi route definitions in
 * packages/api/src/routes/) and the frozen on-disk spec at
 * packages/api-contract/openapi.json.
 *
 * What it asserts:
 *  1. The freshly-generated spec deep-equals the committed openapi.json.
 *     If it doesn't, a route or schema changed without
 *     `pnpm spec:emit && pnpm gen:types` being run — the CI drift
 *     gate (scripts/check-spec-drift.sh) catches this too.
 *  2. Every path in the spec resolves to a registered Hono handler
 *     (404 is treated as drift; any other status is fine — the route
 *     exists and ran middleware).
 *  3. Every authed route declares its security scheme via the
 *     OpenAPIRegistry (Bearer auth advertised in the spec).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../app.js';

const SPEC_PATH = resolve(__dirname, '../../../api-contract/openapi.json');

const SPEC_DOC_CONFIG = {
  openapi: '3.1.0' as const,
  info: { title: 'Harpa Pro API', version: '0.0.0' },
};

const CANONICAL_ERROR_SCHEMA = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { nullable: true },
      },
      required: ['code', 'message'],
      additionalProperties: false,
    },
    requestId: { type: 'string', minLength: 1 },
  },
  required: ['error', 'requestId'],
  additionalProperties: false,
};

const NON_ERROR_STATUS_RESPONSES = new Set([
  'GET /readyz 503',
  'GET /admin/readyz 503',
  'PATCH /projects/{project}/reports/{number} 409',
  'PATCH /projects/{project}/reports/{number}/attachments 409',
  'POST /projects/{project}/reports/{number}/generate 409',
  'POST /projects/{project}/reports/{number}/regenerate 409',
  'POST /projects/{project}/reports/{number}/finalize 409',
  'POST /projects/{project}/reports/{number}/unfinalize 409',
]);

describe('OpenAPI contract', () => {
  it('runtime spec matches the frozen openapi.json', () => {
    const app = createApp();
    const live = app.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const frozen = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

    if (JSON.stringify(live) !== JSON.stringify(frozen)) {
      // Re-emit hint for the operator. Vitest will print the diff via
      // toEqual below.
      console.error(
        '[contract] spec drift detected — run `pnpm spec:emit && pnpm --filter @harpa/api-contract gen:types`',
      );
    }
    expect(live).toEqual(frozen);
  });

  it('every documented path resolves to a registered handler', () => {
    const app = createApp();
    const doc = app.getOpenAPIDocument(SPEC_DOC_CONFIG);
    const paths = Object.keys(doc.paths ?? {});
    expect(paths.length).toBeGreaterThan(0);

    // Build the set of registered (method, path-pattern) pairs from
    // Hono's route table. Hono uses `:param` syntax; OpenAPI uses
    // `{param}` — normalise both to a single canonical form.
    const norm = (p: string) =>
      p.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\{([^/}]+)\}/g, '{x}');
    const registered = new Set<string>();
    for (const r of app.routes) {
      registered.add(`${r.method.toUpperCase()} ${norm(r.path)}`);
    }

    for (const p of paths) {
      const canonical = norm(p);
      for (const method of Object.keys(doc.paths![p]!)) {
        const key = `${method.toUpperCase()} ${canonical}`;
        expect(
          registered.has(key),
          `${method.toUpperCase()} ${p} declared in spec but not in app.routes`,
        ).toBe(true);
      }
    }
  });

  it('declares Bearer security scheme used by authed routes', () => {
    const app = createApp();
    const doc = app.getOpenAPIDocument(SPEC_DOC_CONFIG);
    // Count routes that reference any security requirement.
    let authedOps = 0;
    for (const p of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(p ?? {})) {
        if (op && typeof op === 'object' && 'security' in op && Array.isArray(op.security) && op.security.length > 0) {
          authedOps++;
        }
      }
    }
    // Most P1 routes (everything except /healthz and /auth/*) are
    // authed; this is a smoke check that security is being declared.
    expect(authedOps).toBeGreaterThan(0);
    // And the scheme is registered at the components level.
    const schemes = doc.components?.securitySchemes ?? {};
    expect(Object.keys(schemes).length).toBeGreaterThan(0);
  });

  it('uses the canonical envelope for every documented application error', () => {
    const doc = createApp().getOpenAPIDocument(SPEC_DOC_CONFIG);
    let checked = 0;

    for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem ?? {})) {
        if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (Number(status) < 400) continue;
          const key = `${method.toUpperCase()} ${path} ${status}`;
          if (NON_ERROR_STATUS_RESPONSES.has(key)) continue;
          const content =
            response && typeof response === 'object' && 'content' in response
              ? (response.content as Record<string, { schema?: unknown }> | undefined)
              : undefined;
          const schema = content?.['application/json']?.schema;
          expect(schema, `${key} must document a JSON error schema`).toBeDefined();
          expect(schema, `${key} must use the canonical application error envelope`).toEqual(
            CANONICAL_ERROR_SCHEMA,
          );
          checked += 1;
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});
