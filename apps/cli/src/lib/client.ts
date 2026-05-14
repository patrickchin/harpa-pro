/**
 * Typed openapi-fetch client factory.
 *
 * Types come from @harpa/api-contract `paths`, which is regenerated
 * from `packages/api-contract/openapi.json` by `pnpm gen:api`. Spec
 * drift is a compile-time error here (Pitfall 13 — test the default
 * wiring).
 */
import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '@harpa/api-contract';
import { type CliEnv } from './env.js';
import { EXIT } from './error.js';

export type ApiClient = Client<paths>;

export interface CreateClientOptions {
  /** Override the env-derived base URL (used by integration tests). */
  baseUrl?: string;
  /** Override the env-derived bearer token. */
  token?: string;
  /** Override the env-derived idempotency key. */
  idempotencyKey?: string;
  /** Inject a custom fetch (used by in-process integration tests). */
  fetch?: typeof fetch;
}

/**
 * Build the typed API client. Reads from `env` by default; overrides
 * are taken when present (used for tests and the per-command
 * `--api-url` / `--token` global flags).
 */
export function createApiClient(env: CliEnv, opts: CreateClientOptions = {}): ApiClient {
  const baseUrl = opts.baseUrl ?? env.HARPA_API_URL;
  const token = opts.token ?? env.HARPA_TOKEN;
  const idempotencyKey = opts.idempotencyKey ?? env.HARPA_IDEMPOTENCY_KEY;

  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  return createClient<paths>({
    baseUrl,
    headers,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
}

/**
 * Throw an early auth error if the command requires a token and none
 * is configured. Caller catches and exits with code 3.
 */
export class MissingTokenError extends Error {
  readonly exitCode = EXIT.AUTH;
  constructor() {
    super(
      'HARPA_TOKEN is not set. Run `harpa auth otp verify <phone> <code> --raw` ' +
        'and export the printed token before calling authenticated commands.',
    );
    this.name = 'MissingTokenError';
  }
}

export function requireToken(env: CliEnv): asserts env is CliEnv & { HARPA_TOKEN: string } {
  if (!env.HARPA_TOKEN) throw new MissingTokenError();
}
