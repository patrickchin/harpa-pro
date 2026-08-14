/**
 * `harpa projects members` — project membership management.
 *
 *   harpa projects members list   <projectId>                      → GET    /projects/{id}/members
 *   harpa projects members add    <projectId> --email <e> [--role] → POST   /projects/{id}/members
 *   harpa projects members remove <projectId> <email>              → GET members → DELETE /projects/{id}/members/{userId}
 *
 * Members are addressed by email (the better-auth identity). The
 * `remove` flow resolves email → userId by scanning the project's
 * member list before issuing the DELETE.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest } from '../lib/run.js';
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
      args.client.GET('/projects/{project}/members', {
        params: { path: { project: args.projectId } },
      }),
    format: (data) => renderMemberList(data),
  });
}

export const membersListCommand = defineCommand({
  meta: { name: 'list', description: 'List members of a project.' },
  args: {
    projectId: { type: 'positional', required: true, description: 'Project slug (e.g. prj_xxxxxxxx).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    process.exit(
      await membersList({
        client,
        json: args.json,
        verbose: args.verbose,
        projectId: String(args.projectId),
      }),
    );
  },
});

// --- add --------------------------------------------------------------

export interface MembersAddArgs extends MembersHandlerOptions {
  projectId: string;
  email: string;
  role?: 'owner' | 'editor' | 'viewer';
}

export function membersAdd(args: MembersAddArgs): Promise<ExitCode> {
  const body: { email: string; role?: 'owner' | 'editor' | 'viewer' } = { email: args.email };
  if (args.role !== undefined) body.role = args.role;
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/projects/{project}/members', {
        params: { path: { project: args.projectId } },
        body,
      }),
    format: (data) =>
      `${chalk.green('✓')} Added member ${chalk.bold(data.displayName ?? data.email)} ${chalk.dim(`<${data.email}>`)} as ${data.role}`,
  });
}

export const membersAddCommand = defineCommand({
  meta: { name: 'add', description: 'Add a member to a project (owner only).' },
  args: {
    projectId: { type: 'positional', required: true, description: 'Project slug (e.g. prj_xxxxxxxx).' },
    email: { type: 'string', required: true, description: 'Email address of the member to invite.' },
    role: { type: 'string', description: 'Role: owner | editor | viewer (default editor).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    let role: MembersAddArgs['role'];
    if (typeof args.role === 'string' && args.role.length > 0) {
      if (args.role !== 'owner' && args.role !== 'editor' && args.role !== 'viewer') {
        process.stderr.write(
          chalk.red(`Error: --role must be one of owner|editor|viewer (got ${args.role})\n`),
        );
        process.exit(2);
      }
      role = args.role;
    }
    process.exit(
      await membersAdd({
        client,
        json: args.json,
        verbose: args.verbose,
        projectId: String(args.projectId),
        email: String(args.email),
        role,
      }),
    );
  },
});

// --- remove -----------------------------------------------------------

export interface MembersRemoveArgs extends MembersHandlerOptions {
  projectId: string;
  email: string;
}

export async function membersRemove(args: MembersRemoveArgs): Promise<ExitCode> {
  // Resolve email → userId by fetching the member list
  const listRes = await args.client.GET('/projects/{project}/members', {
    params: { path: { project: args.projectId } },
  });
  if (listRes.error || !listRes.data) {
    const out = args.stderr ?? process.stderr;
    out.write(chalk.red(`Error: could not fetch members for project ${args.projectId}\n`));
    return 1 as ExitCode;
  }
  const member = listRes.data.items.find((m) => m.email === args.email);
  if (!member) {
    const out = args.stderr ?? process.stderr;
    out.write(chalk.red(`Error: no member with email ${args.email} in project ${args.projectId}\n`));
    return 4 as ExitCode;
  }
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.DELETE('/projects/{project}/members/{user}', {
        params: { path: { project: args.projectId, user: member.userId } },
      }),
    format: () =>
      `${chalk.green('✓')} Removed ${chalk.bold(member.displayName ?? args.email)} ${chalk.dim(`<${args.email}>`)} from project ${args.projectId}`,
    formatJson: () => JSON.stringify({ ok: true }, null, 2),
  });
}

export const membersRemoveCommand = defineCommand({
  meta: { name: 'remove', description: 'Remove a member from a project (owner only).' },
  args: {
    projectId: { type: 'positional', required: true, description: 'Project slug (e.g. prj_xxxxxxxx).' },
    email: { type: 'positional', required: true, description: 'Email address of the member to remove.' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    process.exit(
      await membersRemove({
        client,
        json: args.json,
        verbose: args.verbose,
        projectId: String(args.projectId),
        email: String(args.email),
      }),
    );
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
