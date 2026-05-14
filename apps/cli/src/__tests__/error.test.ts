import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { EXIT, mapStatusToExitCode, printError, printTransportError } from '../lib/error.js';

function collector(): { stream: NodeJS.WritableStream; output: () => string } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  return { stream, output: () => Buffer.concat(chunks).toString('utf-8') };
}

describe('mapStatusToExitCode', () => {
  it.each([
    [200, EXIT.OK],
    [201, EXIT.OK],
    [299, EXIT.OK],
    [400, EXIT.VALIDATION],
    [422, EXIT.VALIDATION],
    [401, EXIT.AUTH],
    [403, EXIT.AUTH],
    [404, EXIT.NOT_FOUND],
    [429, EXIT.RATE_LIMIT],
    [500, EXIT.SERVER],
    [503, EXIT.SERVER],
    [418, EXIT.GENERIC],
  ])('status %i → exit %i', (status, exit) => {
    expect(mapStatusToExitCode(status)).toBe(exit);
  });
});

describe('printError', () => {
  it('renders human-readable envelope with request id', () => {
    const { stream, output } = collector();
    const headers = new Headers({ 'x-request-id': 'req_123' });
    printError(
      400,
      { error: { code: 'VALIDATION_ERROR', message: 'phone is required' }, requestId: 'req_123' },
      headers,
      { stderr: stream },
    );
    const out = output();
    expect(out).toMatch(/Error: 400 VALIDATION_ERROR/);
    expect(out).toMatch(/phone is required/);
    expect(out).toMatch(/Request ID: req_123/);
  });

  it('--json mode emits raw envelope', () => {
    const { stream, output } = collector();
    const headers = new Headers({ 'x-request-id': 'r1' });
    const body = { error: { code: 'X', message: 'm' }, requestId: 'r1' };
    printError(500, body, headers, { json: true, stderr: stream });
    const parsed = JSON.parse(output());
    expect(parsed).toEqual(body);
  });

  it('falls back when body missing', () => {
    const { stream, output } = collector();
    printError(502, undefined, new Headers(), { stderr: stream });
    const out = output();
    expect(out).toMatch(/Error: 502 UNKNOWN/);
    expect(out).toMatch(/HTTP 502/);
    expect(out).toMatch(/Request ID: unknown/);
  });

  it('429 includes Retry-After', () => {
    const { stream, output } = collector();
    const headers = new Headers({ 'retry-after': '60', 'x-request-id': 'r' });
    printError(
      429,
      { error: { code: 'RATE_LIMITED', message: 'slow down' }, requestId: 'r' },
      headers,
      { stderr: stream },
    );
    expect(output()).toMatch(/Retry after: 60s/);
  });

  it('debug mode dumps headers + body', () => {
    const { stream, output } = collector();
    const headers = new Headers({ 'x-request-id': 'r', 'x-custom': 'v' });
    printError(
      500,
      { error: { code: 'X', message: 'm' }, requestId: 'r' },
      headers,
      { debug: true, stderr: stream },
    );
    const out = output();
    expect(out).toMatch(/Response headers:/);
    expect(out).toMatch(/x-custom: v/);
    expect(out).toMatch(/Response body:/);
  });
});

describe('printTransportError', () => {
  it('renders network failures', () => {
    const { stream, output } = collector();
    printTransportError(new Error('ECONNREFUSED'), { stderr: stream });
    const out = output();
    expect(out).toMatch(/transport \/ network failure/);
    expect(out).toMatch(/ECONNREFUSED/);
  });

  it('--json mode emits structured payload', () => {
    const { stream, output } = collector();
    printTransportError(new Error('boom'), { json: true, stderr: stream });
    const parsed = JSON.parse(output());
    expect(parsed.error.code).toBe('TRANSPORT_ERROR');
    expect(parsed.error.message).toBe('boom');
  });

  it('handles non-Error throws', () => {
    const { stream, output } = collector();
    printTransportError('plain string', { stderr: stream });
    expect(output()).toMatch(/plain string/);
  });
});
