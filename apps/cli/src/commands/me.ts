/**
 * `harpa me` — current user routes.
 *
 *   harpa me get             → GET   /me
 *   harpa me update          → PATCH /me        (--display-name, --company-name)
 *   harpa me usage           → GET   /me/usage
 *
 * Like `commands/auth.ts`, each command exports a pure `meXxx(args)`
 * helper used by integration tests plus a citty `defineCommand` wrapper
 * used by `bin harpa`.
 */
import { defineCommand } from 'citty';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import { renderUser, renderUsage } from '../lib/render.js';
import type { ExitCode } from '../lib/error.js';

export interface MeHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// --- me get -----------------------------------------------------------

export function meGet(args: MeHandlerOptions): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () => args.client.GET('/me', {}),
    format: (data) => renderUser(data.user),
  });
}

export const meGetCommand = defineCommand({
  meta: { name: 'get', description: 'Show the current user profile.' },
  args: {
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.GET('/me', {}),
      format: (data) => renderUser(data.user),
    });
  },
});

// --- me update --------------------------------------------------------

export interface MeUpdateArgs extends MeHandlerOptions {
  displayName?: string;
  companyName?: string;
}

export function meUpdate(args: MeUpdateArgs): Promise<ExitCode> {
  const body: { displayName?: string; companyName?: string } = {};
  if (args.displayName !== undefined) body.displayName = args.displayName;
  if (args.companyName !== undefined) body.companyName = args.companyName;

  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () => args.client.PATCH('/me', { body }),
    format: (data) => renderUser(data.user),
  });
}

export const meUpdateCommand = defineCommand({
  meta: { name: 'update', description: 'Update display name / company name.' },
  args: {
    'display-name': { type: 'string', description: 'New display name (1–120 chars).' },
    'company-name': { type: 'string', description: 'New company name (1–120 chars).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const body: { displayName?: string; companyName?: string } = {};
    const displayName = args['display-name'];
    const companyName = args['company-name'];
    if (typeof displayName === 'string' && displayName.length > 0) body.displayName = displayName;
    if (typeof companyName === 'string' && companyName.length > 0) body.companyName = companyName;

    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.PATCH('/me', { body }),
      format: (data) => renderUser(data.user),
    });
  },
});

// --- me usage ---------------------------------------------------------

export function meUsage(args: MeHandlerOptions): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () => args.client.GET('/me/usage', {}),
    format: (data) => renderUsage(data),
  });
}

export const meUsageCommand = defineCommand({
  meta: { name: 'usage', description: 'Show monthly + total usage counts.' },
  args: {
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.GET('/me/usage', {}),
      format: (data) => renderUsage(data),
    });
  },
});

// --- group ------------------------------------------------------------

export const meCommand = defineCommand({
  meta: { name: 'me', description: 'Current user (profile + usage).' },
  subCommands: {
    get: meGetCommand,
    update: meUpdateCommand,
    usage: meUsageCommand,
  },
});
