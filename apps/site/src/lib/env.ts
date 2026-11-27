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

/** Optional as a pair: unconfigured builds must not send analytics. */
export function getAnalyticsEnv(): { key: string; host: string } | undefined {
  const key = import.meta.env.PUBLIC_POSTHOG_KEY?.trim();
  const host = import.meta.env.PUBLIC_POSTHOG_HOST?.trim();
  if (!key && !host) return undefined;
  if (!key || !/^phc_[A-Za-z0-9]+$/.test(key)) {
    throw new Error('[site/env] PUBLIC_POSTHOG_KEY must be a public phc_ project token.');
  }
  if (host !== 'https://us.i.posthog.com' && host !== 'https://eu.i.posthog.com') {
    throw new Error('[site/env] PUBLIC_POSTHOG_HOST must be the US or EU PostHog ingestion origin.');
  }
  return { key, host };
}
