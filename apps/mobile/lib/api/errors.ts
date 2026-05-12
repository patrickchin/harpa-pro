/**
 * Typed error surface for the API client. Every non-2xx response and
 * every transport failure surfaces as an `ApiError` so callers can
 * pattern-match on `code` instead of inspecting a raw response.
 *
 * Wire shape mirrors the API's error envelope (see
 * docs/v4/arch-api-design.md §Errors and packages/api-contract
 * `errorEnvelope` schema): `{ error: { code, message, details?, requestId? } }`.
 */

export type ApiErrorCode =
  | string
  | 'network_error'
  | 'parse_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'validation_error'
  | 'server_error';

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(input: {
    code: ApiErrorCode;
    message: string;
    status: number;
    requestId?: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = 'ApiError';
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.details = input.details;
  }
}

/**
 * Best-effort: parse a fetch Response body into our typed `ApiError`. If the
 * body is missing or doesn't match the envelope, fall back to a generic
 * `server_error` so callers always get an `ApiError` (never a raw thrown
 * Response).
 */
export async function apiErrorFromResponse(
  res: Response,
): Promise<ApiError> {
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    // ignore — body wasn't JSON
  }
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
  ) {
    const env = body as ApiErrorEnvelope;
    return new ApiError({
      code: env.error.code ?? statusToCode(res.status),
      message: env.error.message ?? `HTTP ${res.status}`,
      status: res.status,
      requestId: env.error.requestId,
      details: env.error.details,
    });
  }
  return new ApiError({
    code: statusToCode(res.status),
    message: `HTTP ${res.status}`,
    status: res.status,
  });
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'validation_error';
  return 'server_error';
}
