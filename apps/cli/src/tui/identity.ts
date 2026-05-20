/**
 * Identity helpers for the TopBar identity strip (arch-tui-layout-v2.md
 * §11).
 *
 * `apiLabelFor(url)` maps a `HARPA_API_URL` to a short, recognisable
 * label so the user can tell production from staging from local at a
 * glance without parsing a URL.
 *
 *   https://api.harpa.pro              → `prod`
 *   https://api-dev.harpa.pro          → `dev`
 *   http://localhost:8787              → `localhost`
 *   http://127.0.0.1:8787              → `localhost`
 *   anything else                      → hostname (no port)
 *   empty / undefined / unparseable    → `(unset)`
 */
export function apiLabelFor(url: string | undefined): string {
  if (!url) return '(unset)';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return 'localhost';
  }
  if (/^api(\.|-)/.test(host)) {
    // api.harpa.pro / api-dev.harpa.pro / api-staging.harpa.pro
    const sub = host.split('.')[0];
    const m = /^api[-.](.+)$/.exec(sub ?? '');
    if (m && m[1]) return m[1];
    return 'prod';
  }
  return host;
}
