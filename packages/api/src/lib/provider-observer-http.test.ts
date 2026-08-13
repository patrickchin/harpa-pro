import { describe, expect, it, vi } from 'vitest';
import { createProviderObservationDeadline, requestProviderJson } from './provider-observer-http.js';

describe('provider observer HTTP transport', () => {
  it('uses one unrefed 10-second deadline and clears it after the observation', async () => {
    const handle = { unref: vi.fn() };
    const setTimer = vi.fn(() => handle);
    const clearTimer = vi.fn();

    const deadline = createProviderObservationDeadline({ setTimer, clearTimer });
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 10_000);
    expect(handle.unref).toHaveBeenCalledOnce();

    await deadline.run(async (signal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    });
    expect(clearTimer).toHaveBeenCalledWith(handle);
  });

  it('preserves exact GET and JSON POST request mechanics', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const signal = new AbortController().signal;

    await requestProviderJson(new URL('https://provider.example/read'), {
      method: 'GET',
      apiToken: 'read-token',
      signal,
      fetchImpl,
    });
    const body = '{"query":"exact body"}';
    await requestProviderJson(new URL('https://provider.example/write'), {
      method: 'POST',
      apiToken: 'post-token',
      signal,
      fetchImpl,
      body,
    });

    const getInit = fetchImpl.mock.calls[0]?.[1];
    expect(getInit).toEqual({
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer read-token',
      },
      redirect: 'error',
      signal,
    });
    const postInit = fetchImpl.mock.calls[1]?.[1];
    expect(postInit).toEqual({
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

  it('returns the response so Sentry can keep its bounded reader and Link parser', async () => {
    const response = new Response('{"rows":[]}', {
      status: 200,
      headers: { link: '<https://provider.example/next>; rel="next"; results="false"' },
    });
    const result = await requestProviderJson(new URL('https://provider.example/read'), {
      method: 'GET',
      apiToken: 'token',
      signal: new AbortController().signal,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    expect(result).toEqual({ ok: true, response });
  });

  it.each([
    [new DOMException('deadline', 'AbortError'), 'timeout'],
    [new Error('offline'), 'provider_unavailable'],
  ] as const)('normalizes fetch failures without retrying', async (error, reason) => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
    const result = await requestProviderJson(new URL('https://provider.example/read'), {
      method: 'GET',
      apiToken: 'token',
      signal: new AbortController().signal,
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, reason });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
