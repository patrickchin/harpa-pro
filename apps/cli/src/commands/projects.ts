/**
 * `harpa projects` — project CRUD.
 *
 *   harpa projects list                            → GET    /projects
 *   harpa projects create --name ...               → POST   /projects
 *   harpa projects get <id>                        → GET    /projects/{id}
 *   harpa projects update <id> --name ...          → PATCH  /projects/{id}
 *   harpa projects delete <id>                     → DELETE /projects/{id}
 *
 * Pagination on `list`: `--cursor <c>` / `--limit <n>`.
 *
 * Members commands (CLI.5) live in a sibling file but are spliced
 * into the `projects` subcommand tree here.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import { renderProject, renderProjectList } from '../lib/render.js';
import { membersCommand } from './members.js';
import type { ExitCode } from '../lib/error.js';

export interface ProjectsHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// --- list -------------------------------------------------------------

export interface ProjectsListArgs extends ProjectsHandlerOptions {
  cursor?: string;
  limit?: number;
}

export function projectsList(args: ProjectsListArgs): Promise<ExitCode> {
  const query: Record<string, string | number> = {};
  if (args.cursor) query.cursor = args.cursor;
  if (args.limit !== undefined) query.limit = args.limit;

  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.GET('/projects', {
        params: { query },
      }),
    format: (data) => renderProjectList(data),
  });
}

export const projectsListCommand = defineCommand({
  meta: { name: 'list', description: 'List projects you have access to.' },
  args: {
    cursor: { type: 'string', description: 'Pagination cursor from a previous page.' },
    limit: { type: 'string', description: 'Page size (1–100, default 20).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const query: Record<string, string | number> = {};
    if (args.cursor) query.cursor = String(args.cursor);
    if (args.limit) {
      const n = Number(args.limit);
      if (!Number.isFinite(n) || n < 1) {
        process.stderr.write(chalk.red(`Error: --limit must be a positive integer (got ${args.limit})\n`));
        process.exit(2);
      }
      query.limit = n;
    }
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.GET('/projects', { params: { query } }),
      format: (data) => renderProjectList(data),
    });
  },
});

// --- create -----------------------------------------------------------

export interface ProjectsCreateArgs extends ProjectsHandlerOptions {
  name: string;
  clientName?: string;
  address?: string;
}

export function projectsCreate(args: ProjectsCreateArgs): Promise<ExitCode> {
  const body: { name: string; clientName?: string; address?: string } = { name: args.name };
  if (args.clientName !== undefined) body.clientName = args.clientName;
  if (args.address !== undefined) body.address = args.address;

  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () => args.client.POST('/projects', { body }),
    format: (data) => `${chalk.green('✓')} Created project ${chalk.bold(data.name)} (${data.id})`,
  });
}

export const projectsCreateCommand = defineCommand({
  meta: { name: 'create', description: 'Create a new project.' },
  args: {
    name: { type: 'string', description: 'Project name (1–200 chars).', required: true },
    'client-name': { type: 'string', description: 'Client / customer name (≤200 chars).' },
    address: { type: 'string', description: 'Site address (≤500 chars).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const body: { name: string; clientName?: string; address?: string } = { name: String(args.name) };
    const clientName = args['client-name'];
    const address = args.address;
    if (typeof clientName === 'string' && clientName.length > 0) body.clientName = clientName;
    if (typeof address === 'string' && address.length > 0) body.address = address;
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.POST('/projects', { body }),
      format: (data) => `${chalk.green('✓')} Created project ${chalk.bold(data.name)} (${data.id})`,
    });
  },
});

// --- get --------------------------------------------------------------

export interface ProjectsGetArgs extends ProjectsHandlerOptions {
  id: string;
}

export function projectsGet(args: ProjectsGetArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.GET('/projects/{id}', { params: { path: { id: args.id } } }),
    format: (data) => renderProject(data),
  });
}

export const projectsGetCommand = defineCommand({
  meta: { name: 'get', description: 'Show project details.' },
  args: {
    id: { type: 'positional', required: true, description: 'Project ID (UUID).' },
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
        client.GET('/projects/{id}', { params: { path: { id: String(args.id) } } }),
      format: (data) => renderProject(data),
    });
  },
});

// --- update -----------------------------------------------------------

export interface ProjectsUpdateArgs extends ProjectsHandlerOptions {
  id: string;
  name?: string;
  clientName?: string;
  address?: string;
}

export function projectsUpdate(args: ProjectsUpdateArgs): Promise<ExitCode> {
  const body: { name?: string; clientName?: string; address?: string } = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.clientName !== undefined) body.clientName = args.clientName;
  if (args.address !== undefined) body.address = args.address;

  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.PATCH('/projects/{id}', {
        params: { path: { id: args.id } },
        body,
      }),
    format: (data) => `${chalk.green('✓')} Updated project ${chalk.bold(data.name)} (${data.id})`,
  });
}

export const projectsUpdateCommand = defineCommand({
  meta: { name: 'update', description: 'Update project fields.' },
  args: {
    id: { type: 'positional', required: true, description: 'Project ID (UUID).' },
    name: { type: 'string', description: 'New name (1–200 chars).' },
    'client-name': { type: 'string', description: 'New client name (≤200 chars).' },
    address: { type: 'string', description: 'New address (≤500 chars).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const body: { name?: string; clientName?: string; address?: string } = {};
    if (typeof args.name === 'string' && args.name.length > 0) body.name = args.name;
    const clientName = args['client-name'];
    const address = args.address;
    if (typeof clientName === 'string' && clientName.length > 0) body.clientName = clientName;
    if (typeof address === 'string' && address.length > 0) body.address = address;
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.PATCH('/projects/{id}', {
          params: { path: { id: String(args.id) } },
          body,
        }),
      format: (data) => `${chalk.green('✓')} Updated project ${chalk.bold(data.name)} (${data.id})`,
    });
  },
});

// --- delete -----------------------------------------------------------

export interface ProjectsDeleteArgs extends ProjectsHandlerOptions {
  id: string;
}

export function projectsDelete(args: ProjectsDeleteArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.DELETE('/projects/{id}', { params: { path: { id: args.id } } }),
    format: () => `${chalk.green('✓')} Deleted project ${args.id}`,
    formatJson: () => JSON.stringify({ ok: true }, null, 2),
  });
}

export const projectsDeleteCommand = defineCommand({
  meta: { name: 'delete', description: 'Delete a project (owner only).' },
  args: {
    id: { type: 'positional', required: true, description: 'Project ID (UUID).' },
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
        client.DELETE('/projects/{id}', { params: { path: { id: String(args.id) } } }),
      format: () => `${chalk.green('✓')} Deleted project ${args.id}`,
      formatJson: () => JSON.stringify({ ok: true }, null, 2),
    });
  },
});

// --- group ------------------------------------------------------------

export const projectsCommand = defineCommand({
  meta: { name: 'projects', description: 'Project CRUD + members.' },
  subCommands: {
    list: projectsListCommand,
    create: projectsCreateCommand,
    get: projectsGetCommand,
    update: projectsUpdateCommand,
    delete: projectsDeleteCommand,
    members: membersCommand,
  },
});
