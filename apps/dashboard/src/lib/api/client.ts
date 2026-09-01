import type { paths } from '@harpa/api-contract';

import { env } from '@/lib/env';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type Operation<P extends keyof paths, M extends keyof paths[P]> = paths[P][M];

type JsonContent<T> = T extends {
  content: { 'application/json': infer Body };
}
  ? Body
  : never;

export type RequestBody<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { requestBody?: infer Request } ? JsonContent<Request> : never;

type SuccessResponse<OperationType> = OperationType extends {
  responses: infer Responses;
}
  ? Responses extends Record<string | number, unknown>
    ?
        | (200 extends keyof Responses ? JsonContent<Responses[200]> : never)
        | (201 extends keyof Responses ? JsonContent<Responses[201]> : never)
        | (204 extends keyof Responses ? void : never)
    : never
  : never;

export type ResponseBody<P extends keyof paths, M extends keyof paths[P]> = SuccessResponse<
  Operation<P, M>
>;

export type PathParams<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { parameters: { path?: infer Params } }
    ? Params extends undefined
      ? Record<string, never>
      : Params
    : Record<string, never>;

export type QueryParams<P extends keyof paths, M extends keyof paths[P]> =
  Operation<P, M> extends { parameters: { query?: infer Query } }
    ? Query extends undefined
      ? Record<string, never>
      : Query
    : Record<string, never>;

export interface RequestInput<P extends keyof paths, M extends keyof paths[P]> {
  params?: PathParams<P, M>;
  query?: QueryParams<P, M>;
  body?: RequestBody<P, M>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

interface ApiErrorInput {
  code: string;
  message: string;
  status: number;
  details?: unknown;
  requestId?: string;
  payload?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly payload?: unknown;

  constructor(input: ApiErrorInput) {
    super(input.message);
    this.name = 'ApiError';
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
    this.requestId = input.requestId;
    this.payload = input.payload;
  }
}

export function substitutePath(template: string, params?: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params?.[key];
    if (value === undefined || value === null || value === '') {
      throw new ApiError({
        code: 'validation_error',
        message: `Missing path param "${key}" for ${template}`,
        status: 0,
      });
    }
    return encodeURIComponent(String(value));
  });
}

function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
  requestId?: string;
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  const envelope = payload as ApiErrorEnvelope | undefined;
  return new ApiError({
    code: envelope?.error?.code ?? 'http_error',
    message: envelope?.error?.message ?? `Request failed with status ${response.status}.`,
    status: response.status,
    details: envelope?.error?.details,
    requestId: envelope?.requestId ?? envelope?.error?.requestId,
    payload,
  });
}

export interface DashboardApiClient {
  request<P extends keyof paths, M extends keyof paths[P] & HttpMethod>(
    path: P,
    method: M,
    input?: RequestInput<P, M>,
  ): Promise<ResponseBody<P, M>>;
}

interface CreateApiClientInput {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient({
  baseUrl,
  fetch: fetchImplementation = globalThis.fetch,
}: CreateApiClientInput): DashboardApiClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    async request(path, method, input) {
      const filledPath = substitutePath(
        String(path),
        input?.params as Record<string, unknown> | undefined,
      );
      const queryString = buildQueryString(input?.query as Record<string, unknown> | undefined);
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(input?.headers ?? {}),
      };
      const hasBody = input?.body !== undefined && method !== 'get';
      if (hasBody) headers['Content-Type'] = 'application/json';

      let response: Response;
      try {
        response = await fetchImplementation(`${normalizedBaseUrl}${filledPath}${queryString}`, {
          method: method.toUpperCase(),
          credentials: 'include',
          headers,
          body: hasBody ? JSON.stringify(input.body) : undefined,
          signal: input?.signal,
        });
      } catch (error) {
        throw new ApiError({
          code: 'network_error',
          message: error instanceof Error ? error.message : 'Network request failed.',
          status: 0,
        });
      }

      if (response.status === 204) {
        return undefined as ResponseBody<typeof path, typeof method>;
      }
      if (!response.ok) throw await errorFromResponse(response);

      const text = await response.text();
      if (!text) {
        return undefined as ResponseBody<typeof path, typeof method>;
      }
      try {
        return JSON.parse(text) as ResponseBody<typeof path, typeof method>;
      } catch {
        throw new ApiError({
          code: 'parse_error',
          message: "Couldn't read the server response.",
          status: response.status,
        });
      }
    },
  };
}

export const api = createApiClient({
  baseUrl: env.VITE_API_BASE_URL,
});
