/**
 * Auth-coverage gate — every route registered on the app MUST either
 * be on the explicit `PUBLIC_ROUTES` allowlist OR reject an
 * Authorization-less request with HTTP 401.
 *
 * Why a coverage gate exists:
 * - `withAuth()` is what mints `c.var.db` (the per-request scoped DB
 *   accessor — see `docs/v4/arch-auth-and-rls.md`). Forgetting it on a
 *   new route leaves the handler with `c.get('db')` undefined.
 * - The eslint `no-restricted-imports` rule prevents routes from
 *   importing the raw drizzle handle (Pitfall 6), but it can't catch
 *   the case where a new route is registered without `withAuth()` in
 *   its middleware chain at all.
 *
 * This test enumerates `app.routes` and hits each path with no
 * `Authorization` header. Non-public routes must return 401 from the
 * `withAuth()` middleware before any handler logic runs (so we don't
 * need a real DB).
 *
 * Adding a new public route → add it to PUBLIC_ROUTES below.
 * Adding a new authed route → no change needed; the test auto-covers.
 */
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

/**
 * Routes intentionally reachable without a bearer token. The list is
 * deliberately exhaustive — every entry below must match a real entry
 * in `app.routes` (no typos), and any non-listed route must 401.
 */
const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/healthz' },
  { method: 'GET', path: '/readyz' },
  // better-auth wildcard mount — owns its own auth (sign-in/sign-up/etc).
  // The `app.on(['GET','POST'], '/api/auth/**', …)` registration shows up
  // as two routes; both are public.
  { method: 'GET', path: '/api/auth/**' },
  { method: 'POST', path: '/api/auth/**' },
  { method: 'POST', path: '/waitlist' },
  { method: 'POST', path: '/waitlist/confirm' },
  // RevenueCat cannot present a Harpa session. The handler authenticates
  // the provider's dedicated Authorization value with timingSafeEqual.
  { method: 'POST', path: '/webhooks/revenuecat' },
  // OpenAPI JSON spec — served by @hono/zod-openapi, no auth. Note:
  // `/openapi.json` is also on the global rate-limit SKIP_PREFIXES.
  { method: 'GET', path: '/openapi.json' },
  // Universal-link manifests (P4.6). Apple/Google fetch these without
  // auth; missing env collapses to a 404 (see routes/well-known.ts).
  { method: 'GET', path: '/.well-known/apple-app-site-association' },
  { method: 'GET', path: '/.well-known/assetlinks.json' },
];

function isPublic(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some(
    (r) => r.method.toUpperCase() === method.toUpperCase() && r.path === path,
  );
}

/** Substitute Hono `:param` placeholders so we can issue a real request. */
function concreteUrl(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, 'x');
}

describe('auth coverage', () => {
  it('every registered route is either on the public allowlist or rejects missing auth with 401', async () => {
    const app = createApp();
    const checked: string[] = [];
    const violations: string[] = [];
    // The app mounts a global per-IP rate limiter before the per-route
    // `withAuth()` (see `middleware/globalRateLimit.ts`). Iterating
    // dozens of routes from the same fake IP would trip it and return
    // 429 instead of 401, masking the real auth check. We give each
    // request a unique X-Forwarded-For so the limiter never matches.
    let ipCounter = 0;
    const nextIp = (): string => {
      ipCounter += 1;
      return `10.0.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
    };

    for (const r of app.routes) {
      const method = r.method.toUpperCase();
      // Hono registers an internal ALL handler for the OpenAPI/middleware
      // chain. Skip pseudo-methods that aren't real HTTP verbs.
      if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) continue;

      if (isPublic(method, r.path)) {
        checked.push(`PUBLIC ${method} ${r.path}`);
        continue;
      }

      const res = await app.request(concreteUrl(r.path), {
        method,
        headers: { 'x-forwarded-for': nextIp() },
      });
      if (res.status !== 401) {
        violations.push(
          `${method} ${r.path} returned ${res.status} without Authorization — expected 401 (missing withAuth?).`,
        );
      } else {
        checked.push(`AUTHED ${method} ${r.path}`);
      }
    }

    expect(violations).toEqual([]);
    // Sanity: we actually checked a non-trivial number of routes.
    expect(checked.length).toBeGreaterThan(20);
  });

  it('every entry on PUBLIC_ROUTES exists in app.routes', () => {
    const app = createApp();
    const registered = new Set(
      app.routes.map((r) => `${r.method.toUpperCase()} ${r.path}`),
    );
    for (const p of PUBLIC_ROUTES) {
      expect(
        registered.has(`${p.method.toUpperCase()} ${p.path}`),
        `PUBLIC_ROUTES entry ${p.method} ${p.path} not found in app.routes`,
      ).toBe(true);
    }
  });
});
