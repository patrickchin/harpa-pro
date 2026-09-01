/**
 * `harpa reports` AI-side subcommands (CLI.7).
 *
 *   harpa reports generate   <reportId> [--fixture <name>] [--idempotency-key <uuid>]
 *   harpa reports regenerate <reportId> [--fixture <name>] [--idempotency-key <uuid>]
 *   harpa reports finalize   <reportId>
 *   harpa reports pdf        <reportId>
 *
 * Idempotency: when `--idempotency-key` is provided, it is sent as the
 * `idempotency-key` request header, overriding `HARPA_IDEMPOTENCY_KEY`
 * from the environment for this call. The server replays the previous
 * response and sets `idempotent-replay: true` (visible in `--verbose`).
 *
 * AI fixture mode is opt-in via `--fixture <name>` (server expects the
 * `fixtureName` body property).
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest } from '../lib/run.js';
import { renderReport } from '../lib/render.js';
import type { ExitCode } from '../lib/error.js';

export interface ReportsAiHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  idempotencyKey?: string;
}

function headersFor(opts: { idempotencyKey?: string }): Record<string, string> | undefined {
  if (!opts.idempotencyKey) return undefined;
  return { 'idempotency-key': opts.idempotencyKey };
}

// --- generate ---------------------------------------------------------

export interface ReportsGenerateArgs extends ReportsAiHandlerOptions {
  project: string; number: number;
  fixtureName?: string;
}

export function reportsGenerate(args: ReportsGenerateArgs): Promise<ExitCode> {
  const body: { fixtureName?: string } = {};
  if (args.fixtureName) body.fixtureName = args.fixtureName;
  const headers = headersFor(args);
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/projects/{project}/reports/{number}/generate', {
        params: { path: { project: args.project, number: args.number } },
        body,
        ...(headers ? { headers } : {}),
      }),
    format: (data) =>
      `${chalk.green('✓')} Generated report #${data.report.number} ${chalk.dim(data.report.id)}\n${renderReport(data.report)}`,
  });
}

export const reportsGenerateCommand = defineCommand({
  meta: { name: 'generate', description: 'Generate a draft body for a report from notes (AI).' },
  args: {
    project: { type: 'positional', required: true, description: 'Project slug (e.g. prj_xxxxxxxx).' }, number: { type: 'positional', required: true, description: 'Report number within the project.' },
    fixture: { type: 'string', description: 'Fixture name (replay mode).' },
    'idempotency-key': { type: 'string', description: 'Override idempotency key for this call.' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const idemKey = args['idempotency-key'];
    process.exit(await reportsGenerate({
      client,
      project: String(args.project),
      number: Number(args.number),
      fixtureName: typeof args.fixture === 'string' && args.fixture.length > 0 ? args.fixture : undefined,
      idempotencyKey: typeof idemKey === 'string' && idemKey.length > 0 ? idemKey : undefined,
      json: args.json,
      verbose: args.verbose,
    }));
  },
});

// --- regenerate -------------------------------------------------------

export interface ReportsRegenerateArgs extends ReportsAiHandlerOptions {
  project: string; number: number;
  fixtureName?: string;
}

export function reportsRegenerate(args: ReportsRegenerateArgs): Promise<ExitCode> {
  const body: { fixtureName?: string } = {};
  if (args.fixtureName) body.fixtureName = args.fixtureName;
  const headers = headersFor(args);
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/projects/{project}/reports/{number}/regenerate', {
        params: { path: { project: args.project, number: args.number } },
        body,
        ...(headers ? { headers } : {}),
      }),
    format: (data) =>
      `${chalk.green('✓')} Regenerated report #${data.report.number} ${chalk.dim(data.report.id)}\n${renderReport(data.report)}`,
  });
}

export const reportsRegenerateCommand = defineCommand({
  meta: { name: 'regenerate', description: 'Replace report body with a freshly generated one (AI).' },
  args: {
    project: { type: 'positional', required: true, description: 'Project slug (e.g. prj_xxxxxxxx).' }, number: { type: 'positional', required: true, description: 'Report number within the project.' },
    fixture: { type: 'string', description: 'Fixture name (replay mode).' },
    'idempotency-key': { type: 'string', description: 'Override idempotency key for this call.' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const idemKey = args['idempotency-key'];
    process.exit(await reportsRegenerate({
      client,
      project: String(args.project),
      number: Number(args.number),
      fixtureName: typeof args.fixture === 'string' && args.fixture.length > 0 ? args.fixture : undefined,
      idempotencyKey: typeof idemKey === 'string' && idemKey.length > 0 ? idemKey : undefined,
      json: args.json,
      verbose: args.verbose,
    }));
  },
});

// --- finalize ---------------------------------------------------------

export interface ReportsFinalizeArgs extends ReportsAiHandlerOptions {
  project: string; number: number;
}

export function reportsFinalize(args: ReportsFinalizeArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/projects/{project}/reports/{number}/finalize', {
        params: { path: { project: args.project, number: args.number } },
      }),
    format: (data) =>
      `${chalk.green('✓')} Finalized report #${data.report.number} ${chalk.dim(data.report.id)}\n${renderReport(data.report)}`,
  });
}

export const reportsFinalizeCommand = defineCommand({
  meta: { name: 'finalize', description: 'Freeze a draft report (status → finalized).' },
  args: {
    project: { type: 'positional', required: true, description: 'Project slug (e.g. prj_xxxxxxxx).' }, number: { type: 'positional', required: true, description: 'Report number within the project.' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    process.exit(await reportsFinalize({
      client,
      project: String(args.project),
      number: Number(args.number),
      json: args.json,
      verbose: args.verbose,
    }));
  },
});

// --- unfinalize -------------------------------------------------------

export interface ReportsUnfinalizeArgs extends ReportsAiHandlerOptions {
  project: string; number: number;
}

export function reportsUnfinalize(args: ReportsUnfinalizeArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/projects/{project}/reports/{number}/unfinalize', {
        params: { path: { project: args.project, number: args.number } },
      }),
    format: (data) =>
      `${chalk.green('✓')} Unfinalized report #${data.report.number} ${chalk.dim(data.report.id)}\n${renderReport(data.report)}`,
  });
}

export const reportsUnfinalizeCommand = defineCommand({
  meta: { name: 'unfinalize', description: 'Flip a finalized report back to draft.' },
  args: {
    project: { type: 'positional', required: true, description: 'Project slug (e.g. prj_xxxxxxxx).' }, number: { type: 'positional', required: true, description: 'Report number within the project.' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    process.exit(await reportsUnfinalize({
      client,
      project: String(args.project),
      number: Number(args.number),
      json: args.json,
      verbose: args.verbose,
    }));
  },
});

// --- pdf --------------------------------------------------------------

export interface ReportsPdfArgs extends ReportsAiHandlerOptions {
  project: string; number: number;
}

export function reportsPdf(args: ReportsPdfArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/projects/{project}/reports/{number}/pdf', {
        params: { path: { project: args.project, number: args.number } },
      }),
    format: (data) =>
      `${chalk.green('✓')} PDF ready\n  URL:        ${data.url}\n  Expires at: ${data.expiresAt}`,
  });
}

export const reportsPdfCommand = defineCommand({
  meta: { name: 'pdf', description: 'Render the report to PDF and return a signed URL.' },
  args: {
    project: { type: 'positional', required: true, description: 'Project slug (e.g. prj_xxxxxxxx).' }, number: { type: 'positional', required: true, description: 'Report number within the project.' },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    process.exit(await reportsPdf({
      client,
      project: String(args.project),
      number: Number(args.number),
      json: args.json,
      verbose: args.verbose,
    }));
  },
});
