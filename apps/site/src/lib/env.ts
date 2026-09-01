/**
 * Centralised env access for the public site.
 *
 * Astro inlines `import.meta.env.PUBLIC_*` at build time. Reading them
 * through here gives us one typed entry point and avoids
 * `process.env.PUBLIC_X!` non-null assertions (AGENTS.md hard rule #6).
 *
 * NO DEFAULTS — missing vars throw at module load. Dev-safe defaults
 * (like Cloudflare's universal test Turnstile key) silently mask
 * misconfigured prod builds; see docs/bugs/README.md (2026-05-14
 * waitlist-shipped-with-test-sitekey). Local dev: copy
 * `apps/site/.env.example` to `.env`. CI and Pages inject `PUBLIC_*`
 * through their build environments.
 */

function required(
  key:
    | 'PUBLIC_API_BASE_URL'
    | 'PUBLIC_DASHBOARD_URL'
    | 'PUBLIC_TURNSTILE_SITE_KEY',
): string {
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env?.[key];
  if (!v) {
    throw new Error(
      `[site/env] Missing ${key}. Set it in apps/site/.env (dev) ` +
        `or in the build environment (see .github/workflows/site-*.yml).`,
    );
  }
  return v;
}

export function getPublicEnv(): {
  apiBaseUrl: string;
  dashboardUrl: string;
  turnstileSiteKey: string;
} {
  return {
    apiBaseUrl: required('PUBLIC_API_BASE_URL'),
    dashboardUrl: required('PUBLIC_DASHBOARD_URL'),
    turnstileSiteKey: required('PUBLIC_TURNSTILE_SITE_KEY'),
  };
}
