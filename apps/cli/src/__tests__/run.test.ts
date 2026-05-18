import { describe, it, expect } from 'vitest';
import { performRequest } from '../lib/run.js';
import { MissingTokenError } from '../lib/client.js';

function mkResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe('performRequest', () => {
  it('returns ok for a 2xx with data', async () => {
    const outcome = await performRequest(async () => ({
      data: { ok: true },
      response: mkResponse(200),
    }));
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.data).toEqual({ ok: true });
      expect(outcome.response.status).toBe(200);
    }
  });

  it('returns apiError for a non-2xx with an envelope', async () => {
    const outcome = await performRequest(async () => ({
      error: { error: { code: 'BAD', message: 'nope' } },
      response: mkResponse(400),
    }));
    expect(outcome.kind).toBe('apiError');
    if (outcome.kind === 'apiError') {
      expect(outcome.status).toBe(400);
      expect(outcome.body).toEqual({ error: { code: 'BAD', message: 'nope' } });
    }
  });

  it('returns missingToken when the thunk throws MissingTokenError', async () => {
    const outcome = await performRequest(async () => {
      throw new MissingTokenError();
    });
    expect(outcome.kind).toBe('missingToken');
    if (outcome.kind === 'missingToken') {
      expect(outcome.error).toBeInstanceOf(MissingTokenError);
    }
  });

  it('returns transport for any other thrown error', async () => {
    const boom = new Error('network down');
    const outcome = await performRequest(async () => {
      throw boom;
    });
    expect(outcome.kind).toBe('transport');
    if (outcome.kind === 'transport') {
      expect(outcome.error).toBe(boom);
    }
  });

  it('classifies 2xx-with-undefined-data as apiError (treated as non-success)', async () => {
    const outcome = await performRequest(async () => ({
      response: mkResponse(204),
    }));
    expect(outcome.kind).toBe('apiError');
  });
});
