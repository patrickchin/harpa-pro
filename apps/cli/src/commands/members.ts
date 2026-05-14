/**
 * `harpa projects members` — project membership management.
 *
 *   harpa projects members list   <projectId>                     → GET    /projects/{id}/members
 *   harpa projects members add    <projectId> --phone <p> [--role] → POST   /projects/{id}/members
 *   harpa projects members remove <projectId> <userId>            → DELETE /projects/{id}/members/{userId}
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import { renderMemberList } from '../lib/render.js';
import type { ExitCode } from '../lib/error.js';

export interface MembersHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// --- list -------------------------------------------------------------

export interface MembersListArgs extends MembersHandlerOptions {
  projectId: string;
}

export function membersList(args: MembersListArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.GET('/projects/{id}/members', {
        params: { path: { id: args.projectId } },
      }),
    format: (data) => renderMemberList(data),
  });
}

export const membersListCommand = defineCommand({
  meta: { name: 'list', description: 'List members of a project.' },
  args: {
    projectId: { type: 'positional', required: true, description: 'Project ID (UUID).' },
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
      request: () =>
        client.GET('/projects/{id}/members', {
          params: { path: { id: String(args.projectId) } },
        }),
      format: (data) => renderMemberList(data),
    });
  },
});

// --- add --------------------------------------------------------------

export interface MembersAddArgs extends MembersHandlerOptions {
  projectId: string;
  phone: string;
  role?: 'owner' | 'editor' | 'viewer';
}

export function membersAdd(args: MembersAddArgs): Promise<ExitCode> {
  const body: { phone: string; role?: 'owner' | 'editor' | 'viewer' } = { phone: args.phone };
  if (args.role !== undefined) body.role = args.role;
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/projects/{id}/members', {
        params: { path: { id: args.projectId } },
        body,
      }),
    format: (data) =>
      `${chalk.green('✓')} Added member ${chalk.bold(data.displayName ?? data.phone)} (${data.userId}) as ${data.role}`,
  });
}

export const membersAddCommand = defineCommand({
  meta: { name: 'add', description: 'Add a member to a project (owner only).' },
  args: {
    projectId: { type: 'positional', required: true, description: 'Project ID (UUID).' },
    phone: { type: 'string', required: true, description: 'E.164 phone number to invite.' },
    role: { type: 'string', description: 'Role: owner | editor | viewer (default editor).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const body: { phone: string; role?: 'owner' | 'editor' | 'viewer' } = {
      phone: String(args.phone),
    };
    if (typeof args.role === 'string' && args.role.length > 0) {
      if (args.role !== 'owner' && args.role !== 'editor' && args.role !== 'viewer') {
        process.stderr.write(
          chalk.red(`Error: --role must be one of owner|editor|viewer (got ${args.role})\n`),
        );
        process.exit(2);
      }
      body.role = args.role;
    }
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.POST('/projects/{id}/members', {
          params: { path: { id: String(args.projectId) } },
          body,
        }),
      format: (data) =>
        `${chalk.green('✓')} Added member ${chalk.bold(data.displayName ?? data.phone)} (${data.userId}) as ${data.role}`,
    });
  },
});

// --- remove -----------------------------------------------------------

export interface MembersRemoveArgs extends MembersHandlerOptions {
  projectId: string;
  userId: string;
}

export function membersRemove(args: MembersRemoveArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.DELETE('/projects/{id}/members/{userId}', {
        params: { path: { id: args.projectId, userId: args.userId } },
      }),
    format: () => `${chalk.green('✓')} Removed member ${args.userId} from project ${args.projectId}`,
    formatJson: () => JSON.stringify({ ok: true }, null, 2),
  });
}

export const membersRemoveCommand = defineCommand({
  meta: { name: 'remove', description: 'Remove a member from a project (owner only).' },
  args: {
    projectId: { type: 'positional', required: true, description: 'Project ID (UUID).' },
    userId: { type: 'positional', required: true, description: 'User ID to remove (UUID).' },
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
      request: () =>
        client.DELETE('/projects/{id}/members/{userId}', {
          params: {
            path: { id: String(args.projectId), userId: String(args.userId) },
          },
        }),
      format: () =>
        `${chalk.green('✓')} Removed member ${args.userId} from project ${args.projectId}`,
      formatJson: () => JSON.stringify({ ok: true }, null, 2),
    });
  },
});

// --- group ------------------------------------------------------------

export const membersCommand = defineCommand({
  meta: { name: 'members', description: 'Manage project members.' },
  subCommands: {
    list: membersListCommand,
    add: membersAddCommand,
    remove: membersRemoveCommand,
  },
});
