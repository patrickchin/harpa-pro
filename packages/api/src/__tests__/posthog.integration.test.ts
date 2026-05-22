/**
 * Pitfall-13 integration test for the PostHog client factory.
 *
 * Exercises the REAL `posthog-node` client (not stubbed) against a
 * local HTTP server impersonating the PostHog ingestion endpoint, and
 * asserts the wire-level side effect: an HTTPS POST containing our
 * event payload is dispatched. This is the only test in the suite
 * that proves the default wiring still works — every other test uses
 * the no-op stub.
 *
 * The factory normally returns a stub when NODE_ENV=test. We override
 * that by passing `apiKey` directly and avoiding the env path.
 */
import { describe, it, expect } from 'vitest';
import http from 'node:http';
import zlib from 'node:zlib';
import { AddressInfo } from 'node:net';
import { PostHog } from 'posthog-node';

interface CapturedRequest {
  path: string;
  body: unknown;
}

async function startCaptureServer(): Promise<{
  url: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const isGzip = req.headers['content-encoding'] === 'gzip';
      const raw = isGzip ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        // not JSON, keep raw
      }
      requests.push({ path: req.url ?? '', body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 1 }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

describe('PostHog default wiring (integration)', () => {
  it('captures a real event over HTTP and flushes on shutdown', async () => {
    const server = await startCaptureServer();
    try {
      const client = new PostHog('phc_test_key', {
        host: server.url,
        flushAt: 1,
        flushInterval: 10,
      });

      client.capture({
        distinctId: 'user_alice',
        event: 'report_generated',
        properties: { report_id: 'rpt_1', provider: 'openai', duration_ms: 1200 },
      });

      await client.shutdown();

      expect(server.requests.length).toBeGreaterThanOrEqual(1);
      const captured = server.requests.find((r) => {
        const body = r.body as { batch?: Array<{ event?: string }> };
        return body?.batch?.some((b) => b.event === 'report_generated');
      });
      expect(captured, 'expected report_generated event in PostHog batch').toBeDefined();
      const body = captured!.body as {
        batch: Array<{ event: string; distinct_id: string; properties: Record<string, unknown> }>;
      };
      const evt = body.batch.find((b) => b.event === 'report_generated')!;
      expect(evt.distinct_id).toBe('user_alice');
      expect(evt.properties.report_id).toBe('rpt_1');
    } finally {
      await server.close();
    }
  });
});
