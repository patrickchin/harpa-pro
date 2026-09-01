const OBSERVATION_TIMEOUT_MS = 10_000;

type CoreFailureReason = 'timeout' | 'provider_unavailable' | 'invalid_response';

export type ProviderJsonResult<StatusReason extends string> =
  | { ok: true; body: unknown; headers: Headers }
  | { ok: false; reason: StatusReason | CoreFailureReason };

export interface ProviderObservationDeadline {
  run<T>(observe: (signal: AbortSignal) => Promise<T>): Promise<T>;
}

export function createProviderObservationDeadline(): ProviderObservationDeadline {
  return {
    async run<T>(observe: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), OBSERVATION_TIMEOUT_MS);
      deadline.unref?.();

      try {
        return await observe(controller.signal);
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}

type ProviderJsonRequestOptions<StatusReason extends string> = {
  apiToken: string;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
  reasonForStatus: (status: number) => StatusReason;
  maxBytes?: number;
} & (
  | { method: 'GET' }
  | {
      method: 'POST';
      body: string;
    }
);

export async function requestProviderJson<StatusReason extends string>(
  url: URL,
  options: ProviderJsonRequestOptions<StatusReason>,
): Promise<ProviderJsonResult<StatusReason>> {
  if (options.signal.aborted) return { ok: false, reason: 'timeout' };

  let response: Response;
  try {
    response = await options.fetchImpl(url, {
      method: options.method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${options.apiToken}`,
        ...(options.method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(options.method === 'POST' ? { body: options.body } : {}),
      redirect: 'error',
      signal: options.signal,
    });
  } catch (error) {
    return {
      ok: false,
      reason: isProviderAbort(error, options.signal) ? 'timeout' : 'provider_unavailable',
    };
  }

  if (!response.ok) return { ok: false, reason: options.reasonForStatus(response.status) };

  const body =
    options.maxBytes === undefined
      ? await readJson(response, options.signal)
      : await readBoundedJson(response, options.maxBytes, options.signal);
  return body.ok ? { ok: true, body: body.value, headers: response.headers } : body;
}

type CoreJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: CoreFailureReason };

async function readJson(response: Response, signal: AbortSignal): Promise<CoreJsonResult> {
  try {
    return { ok: true, value: await response.json() };
  } catch (error) {
    return { ok: false, reason: reasonForReadError(error, signal) };
  }
}

async function readBoundedJson(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<CoreJsonResult> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const normalizedLength = declaredLength.trim();
    if (!/^(0|[1-9][0-9]*)$/.test(normalizedLength)) {
      return { ok: false, reason: 'invalid_response' };
    }
    const parsedLength = Number(normalizedLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength > maxBytes) {
      return { ok: false, reason: 'invalid_response' };
    }
  }

  const reader = response.body?.getReader();
  if (!reader) return { ok: false, reason: 'invalid_response' };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value) continue;

      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'invalid_response' };
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    return { ok: false, reason: reasonForReadError(error, signal) };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'invalid_response' };
  }
}

function reasonForReadError(error: unknown, signal: AbortSignal): CoreFailureReason {
  if (isProviderAbort(error, signal)) return 'timeout';
  return error instanceof SyntaxError ? 'invalid_response' : 'provider_unavailable';
}

function isProviderAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError');
}
