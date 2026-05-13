/**
 * Normalise a Postgres connection string into `{ connectionString, ssl }`
 * for `pg.Pool` / `pg.Client`.
 *
 * Neon's DATABASE_URL ships with `?sslmode=require`, which makes
 * pg-connection-string emit a deprecation warning on every parse
 * ("SSL modes 'prefer', 'require', and 'verify-ca' are treated as
 * aliases for 'verify-full'…"). pg v9 / pg-connection-string v3 will
 * adopt standard libpq semantics, which would weaken our TLS posture
 * silently if we kept relying on the legacy alias.
 *
 * Fix: strip `sslmode` (and the related `sslrootcert` /
 * `sslcert` / `sslkey`, which the driver also warns about) from the
 * URL and pass an explicit `ssl` option to `pg`. We map:
 *   - disable             → ssl: false
 *   - require/verify-ca/verify-full → ssl: { rejectUnauthorized: true }
 *     (i.e. verify-full semantics, matching pg's current behaviour and
 *     what Neon needs).
 *   - prefer / allow / no sslmode → ssl: undefined (driver default —
 *     plain TCP for local docker; node-postgres won't auto-enable TLS).
 *
 * `verify-full` is the secure-by-default choice; any caller that needs
 * to accept self-signed certs should set DATABASE_URL with
 * `sslmode=disable` and use a stunnel/sidecar, not loosen this.
 */
import type { PoolConfig } from 'pg';

const SSL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'] as const;

export function parseConnection(url: string): Pick<PoolConfig, 'connectionString' | 'ssl'> {
  // `postgres://` URLs aren't always WHATWG-compliant (the password may
  // contain reserved chars), but Neon/Fly URLs are. Use a try/catch so
  // we degrade to the raw string for anything exotic.
  let sslmode: string | null = null;
  let cleaned = url;
  try {
    const u = new URL(url);
    sslmode = u.searchParams.get('sslmode');
    for (const p of SSL_PARAMS) u.searchParams.delete(p);
    cleaned = u.toString();
  } catch {
    // Fall through; leave url untouched.
  }

  let ssl: PoolConfig['ssl'];
  switch (sslmode) {
    case 'disable':
      ssl = false;
      break;
    case 'require':
    case 'verify-ca':
    case 'verify-full':
      ssl = { rejectUnauthorized: true };
      break;
    default:
      ssl = undefined;
  }

  return { connectionString: cleaned, ssl };
}
