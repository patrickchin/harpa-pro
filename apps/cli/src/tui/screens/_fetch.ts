/**
 * Shared helpers for `Screen.header()` implementations.
 *
 * `fetchVia(leaf, args, session)` invokes a registry leaf's
 * `execute()` + `performRequest` and returns either the parsed data
 * or `undefined` on any non-OK outcome (404 / transport / missing
 * token). Re-uses leaves rather than re-encoding OpenAPI paths
 * (Pitfall 14 defence — same as v2's `validateToken`).
 */
import { performRequest } from '../../lib/run.js';
import { createApiClient } from '../../lib/client.js';
import type { AnyHarpaCommand } from '../registry.js';
import type { Session } from '../session.js';
import type { ParsedArgs } from 'citty';

export async function fetchVia<T>(
  leaf: AnyHarpaCommand,
  args: Record<string, unknown>,
  session: Session,
): Promise<T | undefined> {
  const env = session.effectiveEnv();
  const client = createApiClient(env);
  const exec = leaf.execute({
    client,
    env,
    args: { _: [], ...args } as unknown as ParsedArgs,
  });
  const outcome = await performRequest(exec.request);
  if (outcome.kind === 'ok') return outcome.data as T;
  return undefined;
}
