/**
 * `harpa settings` — user AI provider settings.
 *
 *   harpa settings ai get
 *   harpa settings ai set --vendor openai --model gpt-4.1-mini
 *   harpa settings ai set --clear      # clear any user override; use server default
 *
 * Catalogue lives in `@harpa/api-contract`'s `AI_MODELS`. The
 * settings row is paired-nullable: `{vendor, model}` are either
 * both null (= use server default) or both set.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest } from '../lib/run.js';
import { renderAiSettings, type AiSettingsLike } from '../lib/render.js';
import type { ExitCode } from '../lib/error.js';

export type Vendor = 'openai';

const VENDORS: readonly Vendor[] = ['openai'];

type SettingsBody = { vendor: Vendor | null; model: string | null };

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
    process.exit(await settingsAiGet({ client, json: args.json, verbose: args.verbose }));
  },
});

export interface SettingsAiSetArgs extends SettingsHandlerOptions {
  /** Either pass both `vendor` + `model` to pin a choice, or pass
   *  `clear: true` to send `{null, null}` (= use server default). */
  vendor?: Vendor;
  model?: string;
  clear?: boolean;
}

export function settingsAiSet(args: SettingsAiSetArgs): Promise<ExitCode> {
  const body: SettingsBody = args.clear
    ? { vendor: null, model: null }
    : { vendor: args.vendor ?? null, model: args.model ?? null };
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
    clear: {
      type: 'boolean',
      description: 'Clear the user override (use server default).',
    },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    let settings: Pick<SettingsAiSetArgs, 'clear' | 'vendor' | 'model'>;
    if (args.clear) {
      settings = { clear: true };
    } else {
      if (!args.vendor || !args.model) {
        process.stderr.write(
          chalk.red(
            'Error: pass both --vendor and --model, or pass --clear to use the server default.\n',
          ),
        );
        process.exit(2);
      }
      settings = {
        vendor: parseVendor(String(args.vendor)),
        model: String(args.model),
      };
    }
    process.exit(
      await settingsAiSet({ client, json: args.json, verbose: args.verbose, ...settings }),
    );
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
