import { describe, it, expect, beforeEach } from 'vitest';
import { defineHarpaCommand } from '../lib/command.js';
import { resetEnvCacheForTests } from '../lib/env-runtime.js';

const ENV = {
  HARPA_API_URL: 'http://localhost:8787',
};

describe('defineHarpaCommand', () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    Object.assign(process.env, ENV);
  });

  it('returns matching citty command meta + tui spec', () => {
    const cmd = defineHarpaCommand({
      meta: { name: 'pong', description: 'reply pong' },
      args: { json: { type: 'boolean', description: 'json' } },
      tui: {
        group: 'misc',
        label: 'Pong',
        requiresToken: false,
        args: {},
      },
      execute: () => ({
        request: async () => ({ data: { ok: true }, response: new Response(null, { status: 200 }) }),
        format: (d) => `pong ${JSON.stringify(d)}`,
      }),
    });

    const meta = cmd.cittyCommand.meta as { name?: string; description?: string };
    expect(meta.name).toBe('pong');
    expect(meta.description).toBe('reply pong');
    expect(cmd.tuiSpec.group).toBe('misc');
    expect(cmd.tuiSpec.label).toBe('Pong');
    expect(cmd.tuiSpec.requiresToken).toBe(false);
  });

  it('execute() returns a usable request thunk + formatter (shared with TUI)', async () => {
    const cmd = defineHarpaCommand({
      meta: { name: 'echo', description: 'echo' },
      tui: { group: 'misc', label: 'Echo', requiresToken: false, args: {} },
      execute: ({ env }) => ({
        request: async () => ({
          data: { url: env.HARPA_API_URL },
          response: new Response(null, { status: 200 }),
        }),
        format: (d) => `url=${(d as { url: string }).url}`,
      }),
    });

    const exec = cmd.execute({
      env: { HARPA_API_URL: 'http://x', HARPA_DEBUG: '0' },
      args: { _: [] } as never,
    });
    const result = await exec.request();
    expect(result.data).toEqual({ url: 'http://x' });
    expect(exec.format(result.data!)).toBe('url=http://x');
  });
});
