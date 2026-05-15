/**
 * `harpa settings` — user AI provider settings.
 *
 *   harpa settings ai get
 *   harpa settings ai set --vendor <v> --model <m>
 *
 * Vendor must be one of kimi|openai|anthropic|google|zai|deepseek.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import { renderAiSettings, type AiSettingsLike } from '../lib/render.js';
import type { ExitCode } from '../lib/error.js';

export type Vendor = 'kimi' | 'openai' | 'anthropic' | 'google' | 'zai' | 'deepseek';

const VENDORS: readonly Vendor[] = ['kimi', 'openai', 'anthropic', 'google', 'zai', 'deepseek'];

export interface SettingsHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export function settingsAiGet(args: SettingsHandlerOptions): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () => args.client.GET('/settings/ai'),
    format: (data) => renderAiSettings(data as AiSettingsLike),
  });
}

export const settingsAiGetCommand = defineCommand({
  meta: { name: 'get', description: 'Read AI provider settings.' },
  args: { json: { type: 'boolean' }, verbose: { type: 'boolean' } },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.GET('/settings/ai'),
      format: (data) => renderAiSettings(data as AiSettingsLike),
    });
  },
});

export interface SettingsAiSetArgs extends SettingsHandlerOptions {
  vendor?: Vendor;
  model?: string;
}

export function settingsAiSet(args: SettingsAiSetArgs): Promise<ExitCode> {
  const body: { vendor?: Vendor; model?: string } = {};
  if (args.vendor) body.vendor = args.vendor;
  if (args.model) body.model = args.model;
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () => args.client.PATCH('/settings/ai', { body }),
    format: (data) =>
      `${chalk.green('✓')} AI settings updated\n${renderAiSettings(data as AiSettingsLike)}`,
  });
}

function parseVendor(v: string): Vendor {
  if (!(VENDORS as readonly string[]).includes(v)) {
    process.stderr.write(
      chalk.red(`Error: --vendor must be one of ${VENDORS.join('|')} (got ${v})\n`),
    );
    process.exit(2);
  }
  return v as Vendor;
}

export const settingsAiSetCommand = defineCommand({
  meta: { name: 'set', description: 'Update AI provider settings.' },
  args: {
    vendor: { type: 'string', description: `One of ${VENDORS.join('|')}.` },
    model: { type: 'string', description: 'Model identifier.' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    if (!args.vendor && !args.model) {
      process.stderr.write(chalk.red('Error: pass at least one of --vendor / --model.\n'));
      process.exit(2);
    }
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const body: { vendor?: Vendor; model?: string } = {};
    if (args.vendor) body.vendor = parseVendor(String(args.vendor));
    if (args.model) body.model = String(args.model);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.PATCH('/settings/ai', { body }),
      format: (data) =>
        `${chalk.green('✓')} AI settings updated\n${renderAiSettings(data as AiSettingsLike)}`,
    });
  },
});

export const settingsAiCommand = defineCommand({
  meta: { name: 'ai', description: 'AI provider settings.' },
  subCommands: { get: settingsAiGetCommand, set: settingsAiSetCommand },
});

export const settingsCommand = defineCommand({
  meta: { name: 'settings', description: 'User settings.' },
  subCommands: { ai: settingsAiCommand },
});
