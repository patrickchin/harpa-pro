/**
 * Universal-link manifests served from the API origin.
 *
 *   GET /.well-known/apple-app-site-association  →  iOS Universal Links
 *   GET /.well-known/assetlinks.json             →  Android App Links
 *
 * Payloads are driven by env so the same image works across the dev /
 * prod variants of the bundle id. Missing env → 404 (fail closed). The
 * mobile-side `associatedDomains` + `intentFilters` wiring lands with
 * the P4.6 mobile slice — these routes are the backend half.
 *
 * The AASA file MUST be served as `application/json` with no auth or
 * redirects on `apex.example.com/.well-known/apple-app-site-association`.
 * Apple fetches it via the `swcd` daemon — Hono's global rate limiter
 * runs on `*` so we'd otherwise risk 429-ing Apple. Apple's docs do
 * tolerate occasional failures (it retries), but rate-limiting the
 * manifest is the kind of thing that silently breaks deep links after
 * an OS reinstall; keep an eye on it during the mobile-side rollout.
 *
 * See docs/v4/plan-p4-hardening.md §P4.6.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppEnv } from '../app.js';
import { env } from '../env.js';

const AasaResponse = z.object({
  applinks: z.object({
    apps: z.array(z.string()),
    details: z.array(
      z.object({
        appID: z.string(),
        paths: z.array(z.string()),
      }),
    ),
  }),
});

const AssetlinksResponse = z.array(
  z.object({
    relation: z.array(z.string()),
    target: z.object({
      namespace: z.literal('android_app'),
      package_name: z.string(),
      sha256_cert_fingerprints: z.array(z.string()),
    }),
  }),
);

const NotFound = z.object({
  error: z.object({ code: z.literal('not_configured'), message: z.string() }),
});

/**
 * Paths inside the universal-link routing table. Must mirror the
 * Expo Router `app/(app)/p/[projectSlug].tsx` + `app/(app)/r/[reportSlug].tsx`
 * surface plus the auth gate's deferred-intent stash on `/`.
 */
const UNIVERSAL_LINK_PATHS = ['/p/*', '/r/*'] as const;

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const wellKnownRoutes = new OpenAPIHono<AppEnv>()
  .openapi(
    createRoute({
      method: 'get',
      path: '/.well-known/apple-app-site-association',
      tags: ['well-known'],
      responses: {
        200: {
          description: 'Apple App Site Association manifest.',
          content: { 'application/json': { schema: AasaResponse } },
        },
        404: {
          description: 'iOS universal links are not configured on this origin.',
          content: { 'application/json': { schema: NotFound } },
        },
      },
    }),
    (c) => {
      const teamId = env.IOS_APP_ID_PREFIX;
      const bundleIds = splitCsv(env.IOS_BUNDLE_IDS);
      if (!teamId || bundleIds.length === 0) {
        return c.json(
          {
            error: {
              code: 'not_configured' as const,
              message: 'IOS_APP_ID_PREFIX and IOS_BUNDLE_IDS must be set.',
            },
          },
          404,
        );
      }
      const appIds = bundleIds.map((b) => `${teamId}.${b}`);
      return c.json(
        {
          applinks: {
            apps: [],
            details: appIds.map((appID) => ({
              appID,
              paths: [...UNIVERSAL_LINK_PATHS],
            })),
          },
        },
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: 'get',
      path: '/.well-known/assetlinks.json',
      tags: ['well-known'],
      responses: {
        200: {
          description: 'Android Asset Links manifest.',
          content: { 'application/json': { schema: AssetlinksResponse } },
        },
        404: {
          description: 'Android app links are not configured on this origin.',
          content: { 'application/json': { schema: NotFound } },
        },
      },
    }),
    (c) => {
      const packages = splitCsv(env.ANDROID_PACKAGE_NAMES);
      const fingerprints = splitCsv(env.ANDROID_CERT_FINGERPRINTS_SHA256);
      if (
        packages.length === 0 ||
        fingerprints.length === 0 ||
        packages.length !== fingerprints.length
      ) {
        return c.json(
          {
            error: {
              code: 'not_configured' as const,
              message:
                'ANDROID_PACKAGE_NAMES and ANDROID_CERT_FINGERPRINTS_SHA256 must be set and equal length.',
            },
          },
          404,
        );
      }
      const body = packages.map((pkg, i) => ({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app' as const,
          package_name: pkg,
          // Each env entry may itself be a single fingerprint; multi-key
          // setups (e.g. Play App Signing + upload cert) duplicate the
          // package across CSV positions rather than nesting.
          sha256_cert_fingerprints: [fingerprints[i]!],
        },
      }));
      return c.json(body, 200);
    },
  );
