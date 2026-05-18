import { describe, it, expect } from 'vitest';
import { runTui } from '../../tui/index.js';
import { createSession } from '../../tui/session.js';
import { scriptedPrompter } from '../../tui/prompter.js';
import { health } from '../../commands/health.js';

const env = { HARPA_API_URL: 'http://localhost:9999', HARPA_DEBUG: '0' as const };

describe('TUI execute path — health command', () => {
  it('runs health (no prompts), renders the rendered result, returns to menu, quits', async () => {
    // Stub the underlying request thunk via execute(): we monkey-patch
    // global fetch for the duration of this test. The CLI client uses
    // global fetch by default (createApiClient with no fetch override).
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, time: '2026-01-01T00:00:00Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-request-id': 'req_test_1' },
      })) as typeof fetch;

    try {
      const prompter = scriptedPrompter([
        { kind: 'select', answer: 'health' },     // main → health group
        { kind: 'select', answer: 'API health check' }, // group → command
        { kind: 'select', answer: '__back__' },   // back to main
        { kind: 'select', answer: '__quit__' },   // quit
      ]);

      await runTui(prompter, createSession(env));

      expect(prompter.exhausted()).toBe(true);

      // Verify the rendered note carries the formatter's output.
      const note = prompter.transcript.find((t) => t.kind === 'note');
      expect(note).toBeDefined();
      expect(JSON.stringify(note?.payload)).toContain('API healthy');

      // x-request-id surfaced via log.info
      const reqIdLog = prompter.transcript.find(
        (t) => t.kind === 'log.info' && String(t.payload).includes('req_test_1'),
      );
      expect(reqIdLog).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('renders an apiError and returns to menu (no process exit)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: 'NOPE', message: 'down for maintenance' } }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'x-request-id': 'req_test_err' },
      })) as typeof fetch;

    try {
      const prompter = scriptedPrompter([
        { kind: 'select', answer: 'health' },
        { kind: 'select', answer: 'API health check' },
        { kind: 'select', answer: '__back__' },
        { kind: 'select', answer: '__quit__' },
      ]);
      await runTui(prompter, createSession(env));
      expect(prompter.exhausted()).toBe(true);

      const err = prompter.transcript.find((t) => t.kind === 'log.error');
      expect(err).toBeDefined();
      expect(String(err?.payload)).toContain('503');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('renders a transport error and returns to menu', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('econnrefused');
    }) as typeof fetch;

    try {
      const prompter = scriptedPrompter([
        { kind: 'select', answer: 'health' },
        { kind: 'select', answer: 'API health check' },
        { kind: 'select', answer: '__back__' },
        { kind: 'select', answer: '__quit__' },
      ]);
      await runTui(prompter, createSession(env));
      expect(prompter.exhausted()).toBe(true);
      const err = prompter.transcript.find((t) => t.kind === 'log.error');
      expect(String(err?.payload)).toContain('transport');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('command shape sanity', () => {
  it('health command exposes a tui spec under the health group', () => {
    expect(health.tuiSpec.group).toBe('health');
    expect(health.tuiSpec.label).toMatch(/health/i);
  });
});
