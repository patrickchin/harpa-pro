/**
 * `harpa reports` — report CRUD.
 *
 *   harpa reports list   <projectId> [--cursor] [--limit]   → GET    /projects/{id}/reports
 *   harpa reports create <projectId> [--visit-date]         → POST   /projects/{id}/reports
 *   harpa reports get    <reportId>                         → GET    /reports/{reportId}
 *   harpa reports update <reportId> [--visit-date]          → PATCH  /reports/{reportId}
 *   harpa reports delete <reportId>                         → DELETE /reports/{reportId}
 *
 * AI-side commands (generate/finalize/regenerate/pdf) live in
 * `commands/reports-ai.ts` (CLI.7) and are spliced into the
 * `reports` subcommand tree here.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import { renderReport, renderReportList } from '../lib/render.js';
import {
  reportsGenerateCommand,
  reportsRegenerateCommand,
  reportsFinalizeCommand,
  reportsPdfCommand,
} from './reports-ai.js';
import type { ExitCode } from '../lib/error.js';

export interface ReportsHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// --- list -------------------------------------------------------------

export interface ReportsListArgs extends ReportsHandlerOptions {
  projectId: string;
  cursor?: string;
  limit?: number;
}

export function reportsList(args: ReportsListArgs): Promise<ExitCode> {
  const query: Record<string, string | number> = {};
  if (args.cursor) query.cursor = args.cursor;
  if (args.limit !== undefined) query.limit = args.limit;
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.GET('/projects/{id}/reports', {
        params: { path: { id: args.projectId }, query },
      }),
    format: (data) => renderReportList(data),
  });
}

export const reportsListCommand = defineCommand({
  meta: { name: 'list', description: 'List reports for a project.' },
  args: {
    projectId: { type: 'positional', required: true, description: 'Project ID (UUID).' },
    cursor: { type: 'string', description: 'Pagination cursor.' },
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
      request: () =>
        client.GET('/projects/{id}/reports', {
          params: { path: { id: String(args.projectId) }, query },
        }),
      format: (data) => renderReportList(data),
    });
  },
});

// --- create -----------------------------------------------------------

export interface ReportsCreateArgs extends ReportsHandlerOptions {
  projectId: string;
  visitDate?: string;
}

export function reportsCreate(args: ReportsCreateArgs): Promise<ExitCode> {
  const body: { visitDate?: string } = {};
  if (args.visitDate !== undefined) body.visitDate = args.visitDate;
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/projects/{id}/reports', {
        params: { path: { id: args.projectId } },
        body,
      }),
    format: (data) => `${chalk.green('✓')} Created report ${chalk.bold(data.id)} (${data.status})`,
  });
}

export const reportsCreateCommand = defineCommand({
  meta: { name: 'create', description: 'Create a new draft report.' },
  args: {
    projectId: { type: 'positional', required: true, description: 'Project ID (UUID).' },
    'visit-date': { type: 'string', description: 'Visit date (ISO yyyy-mm-dd).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const body: { visitDate?: string } = {};
    const visitDate = args['visit-date'];
    if (typeof visitDate === 'string' && visitDate.length > 0) body.visitDate = visitDate;
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.POST('/projects/{id}/reports', {
          params: { path: { id: String(args.projectId) } },
          body,
        }),
      format: (data) => `${chalk.green('✓')} Created report ${chalk.bold(data.id)} (${data.status})`,
    });
  },
});

// --- get --------------------------------------------------------------

export interface ReportsGetArgs extends ReportsHandlerOptions {
  reportId: string;
}

export function reportsGet(args: ReportsGetArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.GET('/reports/{reportId}', {
        params: { path: { reportId: args.reportId } },
      }),
    format: (data) => renderReport(data),
  });
}

export const reportsGetCommand = defineCommand({
  meta: { name: 'get', description: 'Show report details.' },
  args: {
    reportId: { type: 'positional', required: true, description: 'Report ID (UUID).' },
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
        client.GET('/reports/{reportId}', {
          params: { path: { reportId: String(args.reportId) } },
        }),
      format: (data) => renderReport(data),
    });
  },
});

// --- update -----------------------------------------------------------

export interface ReportsUpdateArgs extends ReportsHandlerOptions {
  reportId: string;
  visitDate?: string | null;
}

export function reportsUpdate(args: ReportsUpdateArgs): Promise<ExitCode> {
  const body: { visitDate?: string | null } = {};
  if (args.visitDate !== undefined) body.visitDate = args.visitDate;
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.PATCH('/reports/{reportId}', {
        params: { path: { reportId: args.reportId } },
        body,
      }),
    format: (data) => `${chalk.green('✓')} Updated report ${chalk.bold(data.id)}`,
  });
}

export const reportsUpdateCommand = defineCommand({
  meta: { name: 'update', description: 'Update report fields (draft only).' },
  args: {
    reportId: { type: 'positional', required: true, description: 'Report ID (UUID).' },
    'visit-date': { type: 'string', description: 'Visit date (ISO yyyy-mm-dd).' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const body: { visitDate?: string } = {};
    const visitDate = args['visit-date'];
    if (typeof visitDate === 'string' && visitDate.length > 0) body.visitDate = visitDate;
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.PATCH('/reports/{reportId}', {
          params: { path: { reportId: String(args.reportId) } },
          body,
        }),
      format: (data) => `${chalk.green('✓')} Updated report ${chalk.bold(data.id)}`,
    });
  },
});

// --- delete -----------------------------------------------------------

export interface ReportsDeleteArgs extends ReportsHandlerOptions {
  reportId: string;
}

export function reportsDelete(args: ReportsDeleteArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.DELETE('/reports/{reportId}', {
        params: { path: { reportId: args.reportId } },
      }),
    format: () => `${chalk.green('✓')} Deleted report ${args.reportId}`,
    formatJson: () => JSON.stringify({ ok: true }, null, 2),
  });
}

export const reportsDeleteCommand = defineCommand({
  meta: { name: 'delete', description: 'Delete a draft report.' },
  args: {
    reportId: { type: 'positional', required: true, description: 'Report ID (UUID).' },
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
        client.DELETE('/reports/{reportId}', {
          params: { path: { reportId: String(args.reportId) } },
        }),
      format: () => `${chalk.green('✓')} Deleted report ${args.reportId}`,
      formatJson: () => JSON.stringify({ ok: true }, null, 2),
    });
  },
});

// --- group ------------------------------------------------------------

export const reportsCommand = defineCommand({
  meta: { name: 'reports', description: 'Report CRUD + AI generation.' },
  subCommands: {
    list: reportsListCommand,
    create: reportsCreateCommand,
    get: reportsGetCommand,
    update: reportsUpdateCommand,
    delete: reportsDeleteCommand,
    generate: reportsGenerateCommand,
    regenerate: reportsRegenerateCommand,
    finalize: reportsFinalizeCommand,
    pdf: reportsPdfCommand,
  },
});
