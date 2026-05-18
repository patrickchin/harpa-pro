/**
 * TUI.6 — node-pty default-wiring smoke test.
 *
 * Spawns the built `harpa tui` under a real pseudo-terminal, drives a
 * happy-path interaction (main menu → health → submit → back → quit),
 * and asserts the rendered API response shows up on stdout.
 *
 * This is the ONLY test that exercises `clackPrompter()` — the
 * production default wiring — end-to-end. All other TUI tests run
 * against the scripted prompter, which means a regression in the
 * clack adapter or the spawn-helper / TTY plumbing would otherwise
 * slip through (Pitfall 13: DI stub becoming the spec).
 *
 * The API is mocked by a throwaway `node:http` server bound to a
 * random port — we are not testing the API here, only that the TUI
 * shell renders an end-to-end success against a real HTTP endpoint.
 *
 * Skipped (not failed) when `node-pty` cannot be loaded — keeps
 * environments without the native module from blocking the suite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type * as PtyType from 'node-pty';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(__dirname, '../../../dist/index.js');

let pty: typeof PtyType | undefined;
try {
  // Use createRequire so a missing native module doesn't blow up
  // module-resolution at import time — we want to skip, not error.
  const req = createRequire(import.meta.url);
  pty = req('node-pty') as typeof PtyType;
} catch {
  pty = undefined;
}

// eslint-disable-next-line no-control-regex
const STRIP_ANSI = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;
const stripAnsi = (s: string): string => s.replace(STRIP_ANSI, '');

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface MockApi {
  url: string;
  hits: { method: string; path: string }[];
  close: () => Promise<void>;
}

async function startMockApi(): Promise<MockApi> {
  const hits: MockApi['hits'] = [];
  const server = http.createServer((req, res) => {
    hits.push({ method: req.method ?? '', path: req.url ?? '' });
    if (req.method === 'GET' && req.url === '/healthz') {
      res.setHeader('content-type', 'application/json');
      res.setHeader('x-request-id', 'pty-test-req-1');
      res.end(JSON.stringify({ ok: true, service: 'api', version: 'pty-test' }));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (typeof addr === 'string' || !addr) throw new Error('server address unavailable');
  return {
    url: `http://127.0.0.1:${addr.port}`,
    hits,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

let api: MockApi;

beforeAll(async () => {
  api = await startMockApi();
});

afterAll(async () => {
  if (api) await api.close();
});

const describeIf = pty ? describe : describe.skip;

describeIf('TUI default-wiring (node-pty smoke)', () => {
  it('renders the health response end-to-end through clackPrompter', async () => {
    const ptyMod = pty!;
    const childEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HARPA_API_URL: api.url,
      FORCE_COLOR: '0',
    };
    // Don't leak a stale token from the dev shell, but also don't set
    // HARPA_TOKEN='' — env Zod rejects empty strings.
    delete childEnv.HARPA_TOKEN;

    const proc = ptyMod.spawn(process.execPath, [CLI_ENTRY, 'tui'], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: path.resolve(__dirname, '../../..'),
      env: childEnv,
    });

    let buf = '';
    proc.onData((d) => {
      buf += d;
    });
    const exited = new Promise<number | undefined>((resolve) => {
      proc.onExit((e) => resolve(e.exitCode));
    });

    // Wait for the first prompt, then walk through:
    //   main → health → submit → back → ctrl-c (exit)
    await sleep(900);
    proc.write('\r');     // select 'health' (first option)
    await sleep(600);
    proc.write('\r');     // select 'API health check'
    await sleep(800);     // wait for HTTP round-trip + render
    proc.write('\x1b[B'); // arrow-down to '← back'
    proc.write('\r');
    await sleep(400);
    proc.write('\x03');   // ctrl-c at the main menu exits the loop

    const exitCode = await Promise.race([
      exited,
      sleep(4000).then(() => {
        proc.kill();
        return -1;
      }),
    ]);

    const stripped = stripAnsi(buf);
    expect(stripped, `transcript:\n${stripped}`).toContain('API healthy');
    expect(stripped).toContain('pty-test');
    expect(stripped).toContain('Request ID: pty-test-req-1');
    expect(api.hits.some((h) => h.method === 'GET' && h.path === '/healthz')).toBe(true);
    // Ctrl-C exits the clack loop; the only thing we care about is that the
    // process actually exited rather than us having to force-kill it.
    expect(exitCode, 'tui did not exit after ctrl-c').not.toBe(-1);
  }, 20_000);
});
