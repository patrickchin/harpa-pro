import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProviderObservationDeadline,
  requestProviderJson,
} from './provider-observer-http.js';

const url = new URL('https://provider.example/observation');
const reasonForStatus = (status: number) => (status === 429 ? 'rate_limited' : 'status_failure');

function requestOptions(fetchImpl: typeof fetch, signal = new AbortController().signal) {
  return {
    method: 'GET' as const,
    apiToken: 'read-token',
    signal,
    fetchImpl,
    reasonForStatus,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('provider observation deadline', () => {
  it('shares one signal under one exact 10-second budget and cleans up', async () => {
    vi.useFakeTimers();
    const setTimer = vi.spyOn(globalThis, 'setTimeout');
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
    const signals: AbortSignal[] = [];

    const observation = createProviderObservationDeadline().run(
      (signal) =>
        new Promise<void>((resolve) => {
          signals.push(signal, signal);
          signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    );
    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 10_000);
    expect(signals[0]).toBe(signals[1]);
    expect(signals[0]?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    await observation;
    expect(signals[0]?.aborted).toBe(true);
    expect(clearTimer).toHaveBeenCalledTimes(1);
  });

  it('clears the deadline when the observation throws', async () => {
    vi.useFakeTimers();
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');

    await expect(
      createProviderObservationDeadline().run(async () => {
        throw new Error('observation failed');
      }),
    ).rejects.toThrow('observation failed');
    expect(clearTimer).toHaveBeenCalledTimes(1);
  });
});

describe('provider observer JSON request', () => {
  it('preserves exact GET and JSON POST mechanics and returns body plus headers', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"kind":"get"}', { headers: { link: '<https://provider.example/next>' } }),
      )
      .mockResolvedValueOnce(new Response('{"kind":"post"}'));
    const signal = new AbortController().signal;

    const getResult = await requestProviderJson(url, requestOptions(fetchImpl, signal));
    const body = '{"query":"exact body"}';
    const postResult = await requestProviderJson(url, {
      method: 'POST',
      apiToken: 'post-token',
      signal,
      fetchImpl,
      reasonForStatus,
      body,
    });

    expect(getResult).toMatchObject({ ok: true, body: { kind: 'get' } });
    if (getResult.ok) expect(getResult.headers.get('link')).toBe('<https://provider.example/next>');
    expect(postResult).toMatchObject({ ok: true, body: { kind: 'post' } });
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual({
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer read-token',
      },
      redirect: 'error',
      signal,
    });
    expect(fetchImpl.mock.calls[1]?.[1]).toEqual({
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer post-token',
        'content-type': 'application/json',
      },
      body,
      redirect: 'error',
      signal,
    });
  });

  it('maps non-OK status locally without consuming the provider body', async () => {
    const response = new Response('{"secret":"must not be read"}', { status: 429 });
    const json = vi.spyOn(response, 'json');
    const statusMapper = vi.fn(reasonForStatus);

    await expect(
      requestProviderJson(url, {
        ...requestOptions(vi.fn<typeof fetch>().mockResolvedValue(response)),
        reasonForStatus: statusMapper,
      }),
    ).resolves.toEqual({ ok: false, reason: 'rate_limited' });
    expect(statusMapper).toHaveBeenCalledWith(429);
    expect(json).not.toHaveBeenCalled();
  });

  it.each([
    [new DOMException('deadline', 'AbortError'), 'timeout'],
    [new Error('offline'), 'provider_unavailable'],
  ] as const)('normalizes fetch failure %s without retrying', async (error, reason) => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(requestProviderJson(url, requestOptions(fetchImpl))).resolves.toEqual({
      ok: false,
      reason,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns timeout without calling fetch for an already-aborted observation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      requestProviderJson(url, requestOptions(fetchImpl, controller.signal)),
    ).resolves.toEqual({ ok: false, reason: 'timeout' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('normalizes malformed JSON', async () => {
    await expect(
      requestProviderJson(
        url,
        requestOptions(vi.fn<typeof fetch>().mockResolvedValue(new Response('{'))),
      ),
    ).resolves.toEqual({ ok: false, reason: 'invalid_response' });
  });

  it.each([
    [new Error('read'), 'provider_unavailable'],
    [new DOMException('deadline', 'AbortError'), 'timeout'],
  ] as const)('normalizes JSON read failures', async (error, reason) => {
    const response = new Response('{}');
    vi.spyOn(response, 'json').mockRejectedValue(error);
    await expect(
      requestProviderJson(url, requestOptions(vi.fn<typeof fetch>().mockResolvedValue(response))),
    ).resolves.toEqual({ ok: false, reason });
  });

  it('accepts an exact byte limit and counts multibyte UTF-8 bytes', async () => {
    const encoded = new TextEncoder().encode('{"label":"é"}');
    const response = new Response(encoded, {
      headers: { 'content-length': String(encoded.byteLength) },
    });

    await expect(
      requestProviderJson(url, {
        ...requestOptions(vi.fn<typeof fetch>().mockResolvedValue(response)),
        maxBytes: encoded.byteLength,
      }),
    ).resolves.toMatchObject({ ok: true, body: { label: 'é' } });
  });

  it.each(['invalid', '01', '9007199254740992', '12']) (
    'rejects invalid or oversized Content-Length %s before streaming',
    async (contentLength) => {
      const response = new Response('{"ok":true}', {
        headers: { 'content-length': contentLength },
      });
      const body = response.body;
      const getReader = body ? vi.spyOn(body, 'getReader') : undefined;

      await expect(
        requestProviderJson(url, {
          ...requestOptions(vi.fn<typeof fetch>().mockResolvedValue(response)),
          maxBytes: 11,
        }),
      ).resolves.toEqual({ ok: false, reason: 'invalid_response' });
      expect(getReader).not.toHaveBeenCalled();
    },
  );

  it('cancels a stream as soon as its bytes exceed the bound', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"tooLong":true}'));
      },
      cancel,
    });

    await expect(
      requestProviderJson(url, {
        ...requestOptions(vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))),
        maxBytes: 4,
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid_response' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing body', new Response(null), 'invalid_response'],
    ['invalid UTF-8', new Response(new Uint8Array([0xff])), 'invalid_response'],
  ] as const)('rejects bounded %s', async (_name, response, reason) => {
    await expect(
      requestProviderJson(url, {
        ...requestOptions(vi.fn<typeof fetch>().mockResolvedValue(response)),
        maxBytes: 32,
      }),
    ).resolves.toEqual({ ok: false, reason });
  });

  it.each([
    [new DOMException('deadline', 'AbortError'), 'timeout'],
    [new Error('stream failed'), 'provider_unavailable'],
  ] as const)('normalizes bounded stream read failure', async (error, reason) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error);
      },
    });
    await expect(
      requestProviderJson(url, {
        ...requestOptions(vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))),
        maxBytes: 32,
      }),
    ).resolves.toEqual({ ok: false, reason });
  });
});
