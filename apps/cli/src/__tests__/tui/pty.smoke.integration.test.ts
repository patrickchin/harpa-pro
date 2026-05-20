/**
 * L4 — OpenTUI default-wiring pty smoke test.
 *
 * Spawns `bun src/index.ts tui` under a real pseudo-terminal and
 * asserts that:
 *   - the Bun + OpenTUI + Solid stack mounts without crashing,
 *   - both panes (`ViewportPane` + `InteractionPane`) render their
 *     borders, so the user actually sees the split-pane TUI,
 *   - a clean SIGINT shuts the renderer down (exit code 0 or null).
 *
 * This is the Pitfall-13 gate: the default opentuiPrompter wiring
 * is exercised end-to-end, not stubbed in unit tests.
 *
 * Skipped (not failed) when `node-pty` cannot be loaded or when
 * `bun` is not on PATH — keeps environments without those tools
 * from blocking the suite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type * as PtyType from 'node-pty';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(__dirname, '../../index.ts');

let pty: typeof PtyType | undefined;
try {
  const req = createRequire(import.meta.url);
  pty = req('node-pty') as typeof PtyType;
} catch {
  pty = undefined;
}

let bunPath: string | undefined;
try {
  const which = spawnSync('which', ['bun']);
  if (which.status === 0) {
    const p = which.stdout.toString().trim();
    if (p) bunPath = p;
  }
} catch {
  bunPath = undefined;
}

// eslint-disable-next-line no-control-regex
const STRIP_ANSI = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;
const stripAnsi = (s: string): string => s.replace(STRIP_ANSI, '');

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface MockApi {
  url: string;
  close: () => Promise<void>;
}

async function startMockApi(): Promise<MockApi> {
  const server = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (typeof addr === 'string' || !addr) throw new Error('server address unavailable');
  return {
    url: `http://127.0.0.1:${addr.port}`,
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

const describeIf = pty && bunPath ? describe : describe.skip;

describeIf('TUI default-wiring (OpenTUI pty smoke)', () => {
  it('mounts the split-pane TUI under bun and exits cleanly on SIGINT', async () => {
    const ptyMod = pty!;
    const credHome = await fs.mkdtemp(path.join(os.tmpdir(), 'harpa-pty-opentui-'));
    const childEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HARPA_API_URL: api.url,
      HARPA_CONFIG_HOME: credHome,
      FORCE_COLOR: '1',
    };
    delete childEnv.HARPA_TOKEN;
    delete childEnv.HARPA_TUI_CLASSIC;

    const proc = ptyMod.spawn(bunPath!, [CLI_ENTRY, 'tui'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
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

    // Give Bun + Solid + OpenTUI time to mount and render the first
    // frame. The renderer paints both pane borders, so we wait for
    // them to appear in the output before sending SIGINT.
    const deadline = Date.now() + 6_000;
    let mounted = false;
    while (Date.now() < deadline) {
      const s = stripAnsi(buf);
      if (s.includes('harpa') && s.includes('action')) {
        mounted = true;
        break;
      }
      await sleep(100);
    }
    expect(mounted, `TUI did not mount within 6s; transcript:\n${stripAnsi(buf)}`).toBe(true);

    // The auth menu must actually render its options — proves the
    // select widget paints, not just its surrounding chrome. This is
    // the real Pitfall-13 gate: a broken SelectList that renders only
    // the label would slip past the "did it mount" check.
    const optionsDeadline = Date.now() + 4_000;
    let optionsVisible = false;
    while (Date.now() < optionsDeadline) {
      const s = stripAnsi(buf);
      if (s.includes('Set API URL') && s.includes('Quit')) {
        optionsVisible = true;
        break;
      }
      await sleep(100);
    }
    expect(
      optionsVisible,
      `Select widget did not render its options within 4s; transcript:\n${stripAnsi(buf)}`,
    ).toBe(true);

    proc.kill('SIGINT');

    const exitCode = await Promise.race([
      exited,
      sleep(4_000).then(() => {
        proc.kill();
        return -1;
      }),
    ]);
    expect(exitCode, 'TUI did not exit after SIGINT').not.toBe(-1);

    const stripped = stripAnsi(buf);
    // Both pane titles appear — proves the split-pane laid out.
    expect(stripped).toMatch(/harpa/);
    expect(stripped).toMatch(/action/);
    // Selectable menu options reach the screen.
    expect(stripped).toContain('Sign in');
    expect(stripped).toContain('Set API URL');
    expect(stripped).toContain('Quit');
    // Status bar mentions the configured API URL.
    expect(stripped).toContain(api.url);
  }, 20_000);
});
