/**
 * Centralised env access for the marketing site.
 *
 * Astro inlines `import.meta.env.PUBLIC_*` at build time. Read them
 * through this module so:
 *   1. There's a single typed entry point per variable.
 *   2. The defaults make `pnpm dev` work with no `.env` file.
 *   3. We never have a `process.env.PUBLIC_X!` non-null assertion
 *      scattered through components (banned by AGENTS.md hard rule #6).
 *
 * In CI / prod the values come from `apps/marketing/.env` and the
 * Cloudflare Pages env config.
 */

interface PublicEnv {
  apiBaseUrl: string;
  turnstileSiteKey: string;
}

// Astro types `import.meta.env` per-project; we narrow here.
type MetaEnv = {
  PUBLIC_API_BASE_URL?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
};

function readMetaEnv(): MetaEnv {
  try {
    // import.meta.env is undefined in the vitest 'node' env unless we shim it,
    // so we degrade gracefully there. The component tests don't care about
    // the real values.
    return (import.meta as unknown as { env?: MetaEnv }).env ?? {};
  } catch {
    return {};
  }
}

export function getPublicEnv(): PublicEnv {
  const e = readMetaEnv();
  return {
    apiBaseUrl: e.PUBLIC_API_BASE_URL ?? 'https://api.harpapro.com',
    // Cloudflare's universal test site key — always returns success in
    // the widget. Safe default for `pnpm dev`.
    // https://developers.cloudflare.com/turnstile/troubleshooting/testing/
    turnstileSiteKey: e.PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA',
  };
}
