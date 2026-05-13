/**
 * Centralised env access for the marketing site.
 *
 * Astro inlines `import.meta.env.PUBLIC_*` at build time. Reading them
 * through here gives us one typed entry point and avoids
 * `process.env.PUBLIC_X!` non-null assertions (AGENTS.md hard rule #6).
 *
 * NO DEFAULTS — missing vars throw at module load. Dev-safe defaults
 * (like Cloudflare's universal test Turnstile key) silently mask
 * misconfigured prod builds; see docs/bugs/README.md (2026-05-14
 * waitlist-shipped-with-test-sitekey). Local dev: copy
 * `apps/marketing/.env.example` to `.env`. CI: workflow injects
 * `PUBLIC_*` from GH secrets.
 */

function required(
  key: 'PUBLIC_API_BASE_URL' | 'PUBLIC_TURNSTILE_SITE_KEY',
): string {
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env?.[key];
  if (!v) {
    throw new Error(
      `[marketing/env] Missing ${key}. Set it in apps/marketing/.env (dev) ` +
        `or as a GitHub Actions secret (CI — see .github/workflows/marketing-*.yml).`,
    );
  }
  return v;
}

export function getPublicEnv(): { apiBaseUrl: string; turnstileSiteKey: string } {
  return {
    apiBaseUrl: required('PUBLIC_API_BASE_URL'),
    turnstileSiteKey: required('PUBLIC_TURNSTILE_SITE_KEY'),
  };
}
