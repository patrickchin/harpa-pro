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
import os from 'node:os';
import { promises as fs } from 'node:fs';
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
    const auth = req.headers.authorization;
    if (req.method === 'GET' && req.url === '/healthz') {
      res.setHeader('content-type', 'application/json');
      res.setHeader('x-request-id', 'pty-test-req-1');
      res.end(JSON.stringify({ ok: true, service: 'api', version: 'pty-test' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/auth/otp/start') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'POST' && req.url === '/auth/otp/verify') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          token: 'pty-token',
          user: { id: 'u-pty', phone: '+15551234567', displayName: 'PTY User' },
        }),
      );
      return;
    }
    if (req.method === 'GET' && req.url === '/me' && auth === 'Bearer pty-token') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          user: { id: 'u-pty', phone: '+15551234567', displayName: 'PTY User' },
        }),
      );
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
  it('signs in and renders health response end-to-end through clackPrompter', async () => {
    const ptyMod = pty!;
    const credHome = await fs.mkdtemp(path.join(os.tmpdir(), 'harpa-pty-'));
    const childEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HARPA_API_URL: api.url,
      HARPA_CONFIG_HOME: credHome,
      FORCE_COLOR: '0',
    };
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

    // Drive:
    //   (auth menu) Sign in → phone → code → (authed menu) Developer ›
    //   Raw API → health → API health check → submit → ← back × 2 →
    //   ctrl-c to quit.
    await sleep(900);
    proc.write('\r');                  // select 'Sign in'
    await sleep(400);
    proc.write('+15551234567\r');      // phone
    await sleep(500);                  // POST /auth/otp/start
    proc.write('123456\r');            // OTP code
    await sleep(700);                  // POST /verify + GET /me + setAuth
    // Now on authed menu; first item is Account. Arrow down to
    // 'Developer › Raw API' (Account, Projects, Upload, Developer…).
    proc.write('\x1b[B\x1b[B\x1b[B\r');
    await sleep(300);
    proc.write('\r');                  // select first group → 'health'
    await sleep(300);
    proc.write('\r');                  // select 'API health check'
    await sleep(700);                  // wait for HTTP + render
    proc.write('\x1b[B\r');            // ← back (group menu)
    await sleep(300);
    proc.write('\x03');                // ctrl-c → exits raw-api menu → returns to runApp
    await sleep(300);
    proc.write('\x03');                // ctrl-c at runApp top → quit

    const exitCode = await Promise.race([
      exited,
      sleep(8000).then(() => {
        proc.kill();
        return -1;
      }),
    ]);

    const stripped = stripAnsi(buf);
    expect(stripped, `transcript:\n${stripped}`).toContain('API healthy');
    expect(stripped).toContain('pty-test');
    expect(stripped).toContain('Request ID: pty-test-req-1');
    expect(stripped).toContain('Signed in as');
    expect(api.hits.some((h) => h.method === 'POST' && h.path === '/auth/otp/start')).toBe(true);
    expect(api.hits.some((h) => h.method === 'POST' && h.path === '/auth/otp/verify')).toBe(true);
    expect(api.hits.some((h) => h.method === 'GET' && h.path === '/me')).toBe(true);
    expect(api.hits.some((h) => h.method === 'GET' && h.path === '/healthz')).toBe(true);
    expect(exitCode, 'tui did not exit after ctrl-c').not.toBe(-1);

    // Pitfall-13 defence: credentials really hit disk with 0600.
    const credFile = path.join(credHome, 'harpa-cli', 'credentials.json');
    const stat = await fs.stat(credFile);
    expect(stat.mode & 0o777).toBe(0o600);
    const saved = JSON.parse(await fs.readFile(credFile, 'utf8'));
    expect(saved.token).toBe('pty-token');
    expect(saved.apiUrl).toBe(api.url);
  }, 25_000);
});
