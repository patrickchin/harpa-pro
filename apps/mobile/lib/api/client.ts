/**
 * Typed fetch wrapper for the v4 API. Uses `paths` from
 * `@harpa/api-contract` (generated from `openapi.json`) so request /
 * response shapes stay in lock-step with the server contract.
 *
 * Responsibilities:
 *  - Resolve base URL via `lib/env.ts` (Pitfall 5: never read EXPO_PUBLIC_*
 *    directly outside `env.ts`).
 *  - Substitute `{name}` path params + serialise query params.
 *  - Attach `Authorization: Bearer <token>` if a token getter is wired
 *    (see `lib/api/auth.ts`; auth session plugs in during P2.4).
 *  - Map non-2xx + transport failures to `ApiError`.
 *  - JSON in / JSON out. Multipart uploads (R2 presign PUTs) bypass
 *    this client entirely — they go direct to R2.
 */
import type { paths } from '@harpa/api-contract';
import { env } from '../env';
import { getAuthToken, notifyUnauthorized } from './auth';
import { ApiError, apiErrorFromResponse } from './errors';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Helpers that walk the openapi-typescript `paths` tree to extract
 * the per-operation request / response shapes.
 */
type Operation<P extends keyof paths, M extends keyof paths[P]> = paths[P][M];

type JsonContent<T> = T extends { content: { 'application/json': infer B } }
  ? B
  : never;

export type RequestBody<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { requestBody?: infer R }
    ? JsonContent<R>
    : never;

type SuccessResponse<O> = O extends {
  responses: infer R;
}
  ? R extends Record<string | number, unknown>
    ?
        | (200 extends keyof R ? JsonContent<R[200]> : never)
        | (201 extends keyof R ? JsonContent<R[201]> : never)
        | (204 extends keyof R ? void : never)
    : never
  : never;

export type ResponseBody<P extends keyof paths, M extends keyof paths[P]> =
  SuccessResponse<Operation<P, M>>;

export type PathParams<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { parameters: { path?: infer X } }
    ? X extends undefined
      ? Record<string, never>
      : X
    : Record<string, never>;

export type QueryParams<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { parameters: { query?: infer X } }
    ? X extends undefined
      ? Record<string, never>
      : X
    : Record<string, never>;

/**
 * Caller-facing input for `request`. Discriminates on whether path
 * params / body / query are required so consumers get an empty object
 * type for endpoints that don't take any.
 */
export interface RequestInput<
  P extends keyof paths,
  M extends keyof paths[P],
> {
  params?: PathParams<P, M>;
  query?: QueryParams<P, M>;
  body?: RequestBody<P, M>;
  signal?: AbortSignal;
  /**
   * Per-call header override. Useful for `Idempotency-Key` (P1.9)
   * which the AI routes accept.
   */
  headers?: Record<string, string>;
}

/**
 * Substitute `{name}` segments in the path template using `params`.
 * Throws if a placeholder is left unfilled — that always indicates a
 * caller bug (we'd rather fail loud at the boundary than send a 404 to
 * the API).
 */
export function substitutePath(template: string, params?: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const v = params?.[key];
    if (v === undefined || v === null || v === '') {
      throw new ApiError({
        code: 'validation_error',
        message: `Missing path param "${key}" for ${template}`,
        status: 0,
      });
    }
    return encodeURIComponent(String(v));
  });
}

function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) return '';
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) entries.push([k, String(item)]);
    } else {
      entries.push([k, String(v)]);
    }
  }
  if (entries.length === 0) return '';
  const sp = new URLSearchParams(entries);
  return `?${sp.toString()}`;
}

/**
 * Issue a request against the v4 API. Type-safe on path + method:
 *   await request('/projects', 'get');
 *   await request('/projects/{id}', 'patch', { params: { id }, body: { name } });
 */
export async function request<
  P extends keyof paths,
  M extends keyof paths[P] & HttpMethod,
>(
  path: P,
  method: M,
  init?: RequestInput<P, M>,
): Promise<ResponseBody<P, M>> {
  const baseUrl = env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  const filledPath = substitutePath(
    String(path),
    init?.params as Record<string, unknown> | undefined,
  );
  const queryString = buildQueryString(
    init?.query as Record<string, unknown> | undefined,
  );
  const url = `${baseUrl}${filledPath}${queryString}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.headers ?? {}),
  };

  const token = await getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const hasBody =
    init?.body !== undefined &&
    method !== 'get' &&
    method !== 'delete';

  let bodyText: string | undefined;
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
    bodyText = JSON.stringify(init!.body);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body: bodyText,
      signal: init?.signal,
    });
  } catch (err) {
    // Transport failure (DNS, no network, aborted, …). Surface as ApiError
    // so callers don't have to special-case AbortError vs TypeError.
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiError({
      code: 'network_error',
      message,
      status: 0,
    });
  }

  if (res.status === 204) {
    return undefined as ResponseBody<P, M>;
  }

  if (!res.ok) {
    // Fire the global unauthorized notifier BEFORE throwing so the auth
    // session can tear down state once, even for mutations that bypass
    // React Query's global onError. The callback is sync + best-effort;
    // the ApiError still propagates so the call site sees the failure.
    if (res.status === 401) notifyUnauthorized();
    throw await apiErrorFromResponse(res);
  }

  // Success. If the server promised JSON, parse it; tolerate empty bodies
  // for endpoints that return nothing meaningful.
  const text = await res.text();
  if (!text) return undefined as ResponseBody<P, M>;
  try {
    return JSON.parse(text) as ResponseBody<P, M>;
  } catch {
    throw new ApiError({
      code: 'parse_error',
      message: 'Failed to parse JSON response',
      status: res.status,
    });
  }
}
