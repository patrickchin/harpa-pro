/**
 * Prefixed slug ID generator + collision-retry helper (P3.1).
 *
 * Replaces the old `lib/slug.ts` + SQL `app.random_slug()` pair: the
 * app owns ID minting, the DB owns rejection of malformed values via
 * per-prefix `app.<prefix>_id` domain CHECK constraints. See
 * docs/v4/design-p31-slug-only-ids.md.
 */
import { customAlphabet } from 'nanoid';
import { ID_SPEC, type Id, type Prefix } from '@harpa/api-contract';

/** Crockford base32 (no I/L/O/U). */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

// One generator per prefix, locked to its `currentLen` from ID_SPEC.
const generators = Object.fromEntries(
  (Object.keys(ID_SPEC) as Prefix[]).map(
    (p) => [p, customAlphabet(ALPHABET, ID_SPEC[p].currentLen)] as const,
  ),
) as Record<Prefix, () => string>;

/** Mint a fresh `<prefix>_<n chars>` ID at the prefix's `currentLen`. */
export function newId<P extends Prefix>(prefix: P): Id<P> {
  return `${prefix}_${generators[prefix]()}` as Id<P>;
}

/**
 * Build a regex matcher for IDs of a given prefix using the full
 * historical length range `[minLen, maxLen]`. Mirrors the DB domain
 * CHECK so a value that passes here will pass the column constraint.
 */
function reFor<P extends Prefix>(prefix: P): RegExp {
  const { minLen, maxLen } = ID_SPEC[prefix];
  return new RegExp(`^${prefix}_[0-9a-hjkmnp-tv-z]{${minLen},${maxLen}}$`, 'i');
}

/**
 * Throw if `value` is not a well-formed ID for `prefix`. Returns the
 * (lowercased) branded value. Used at trust boundaries — JWT claim
 * validation, `SET LOCAL app.user_id` interpolation in scope.ts — where
 * an injection-bearing string must be rejected before it reaches SQL.
 */
export function assertId<P extends Prefix>(prefix: P, value: string, label?: string): Id<P> {
  if (typeof value !== 'string' || !reFor(prefix).test(value)) {
    const tag = label ?? `${prefix}_id`;
    throw new Error(`[ids] ${tag} is not a valid ${prefix}_ id: ${JSON.stringify(value)}`);
  }
  return value.toLowerCase() as Id<P>;
}

/**
 * Run `insert` with a freshly minted ID; retry up to 3 attempts on a
 * Postgres `unique_violation` (23505) against the PK index. At the
 * `currentLen` chosen per design doc §3 the retry path is theatre at
 * realistic row counts; it exists as defence-in-depth for high-churn
 * tables (`not`, `fil`, `ses`).
 *
 * Generic over the return type — callers do whatever they want inside
 * the closure (drizzle insert, raw SQL, multi-statement transaction)
 * and the helper just supplies the ID + handles retry.
 */
export async function insertWithGeneratedId<P extends Prefix, R>(
  prefix: P,
  insert: (id: Id<P>) => Promise<R>,
): Promise<R> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = newId(prefix);
    try {
      return await insert(id);
    } catch (err) {
      if (isUniqueViolation(err) && attempt < maxAttempts - 1) continue;
      throw err;
    }
  }
  // Unreachable — the loop either returns or throws.
  throw new Error(`[ids] insertWithGeneratedId(${prefix}) exhausted retries`);
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: unknown };
  if (e?.code === '23505') return true;
  if (e?.cause && isUniqueViolation(e.cause)) return true;
  return false;
}
