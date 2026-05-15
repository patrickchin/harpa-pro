/**
 * `harpa notes` — note CRUD.
 *
 *   harpa notes list   <reportId>                                → GET    /reports/{reportId}/notes
 *   harpa notes create <reportId> --kind --body --file-id        → POST   /reports/{reportId}/notes
 *   harpa notes update <noteId> --body                           → PATCH  /notes/{noteId}
 *   harpa notes delete <noteId>                                  → DELETE /notes/{noteId}
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import { renderNote, renderNoteList } from '../lib/render.js';
import type { ExitCode } from '../lib/error.js';

export type NoteKind = 'text' | 'voice' | 'image' | 'document';

export interface NotesHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// --- list -------------------------------------------------------------

export interface NotesListArgs extends NotesHandlerOptions {
  reportId: string;
  cursor?: string;
  limit?: number;
}

export function notesList(args: NotesListArgs): Promise<ExitCode> {
  const query: Record<string, string | number> = {};
  if (args.cursor) query.cursor = args.cursor;
  if (args.limit !== undefined) query.limit = args.limit;
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.GET('/reports/{reportId}/notes', {
        params: { path: { reportId: args.reportId }, query },
      }),
    format: (data) => renderNoteList(data),
  });
}

export const notesListCommand = defineCommand({
  meta: { name: 'list', description: 'List notes on a report.' },
  args: {
    reportId: { type: 'positional', required: true, description: 'Report ID (UUID).' },
    cursor: { type: 'string', description: 'Pagination cursor.' },
    limit: { type: 'string', description: 'Page size (1–100).' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
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
        process.stderr.write(chalk.red(`Error: --limit must be a positive integer\n`));
        process.exit(2);
      }
      query.limit = n;
    }
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.GET('/reports/{reportId}/notes', {
          params: { path: { reportId: String(args.reportId) }, query },
        }),
      format: (data) => renderNoteList(data),
    });
  },
});

// --- create -----------------------------------------------------------

export interface NotesCreateArgs extends NotesHandlerOptions {
  reportId: string;
  kind: NoteKind;
  body?: string;
  fileId?: string;
  transcript?: string;
}

export function notesCreate(args: NotesCreateArgs): Promise<ExitCode> {
  const body: { kind: NoteKind; body?: string; fileId?: string; transcript?: string } = {
    kind: args.kind,
  };
  if (args.body !== undefined) body.body = args.body;
  if (args.fileId !== undefined) body.fileId = args.fileId;
  if (args.transcript !== undefined) body.transcript = args.transcript;
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/reports/{reportId}/notes', {
        params: { path: { reportId: args.reportId } },
        body,
      }),
    format: (data) => `${chalk.green('✓')} Created note ${chalk.bold(data.id)}`,
  });
}

export const notesCreateCommand = defineCommand({
  meta: { name: 'create', description: 'Create a note on a report.' },
  args: {
    reportId: { type: 'positional', required: true, description: 'Report ID (UUID).' },
    kind: { type: 'string', required: true, description: 'text | voice | image | document.' },
    body: { type: 'string', description: 'Note text body.' },
    'file-id': { type: 'string', description: 'Attached file ID (for voice/image/document).' },
    transcript: { type: 'string', description: 'Transcript (voice notes).' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const kind = String(args.kind);
    if (kind !== 'text' && kind !== 'voice' && kind !== 'image' && kind !== 'document') {
      process.stderr.write(
        chalk.red(`Error: --kind must be one of text|voice|image|document (got ${kind})\n`),
      );
      process.exit(2);
    }
    const body: { kind: NoteKind; body?: string; fileId?: string; transcript?: string } = {
      kind: kind as NoteKind,
    };
    if (typeof args.body === 'string' && args.body.length > 0) body.body = args.body;
    const fileId = args['file-id'];
    if (typeof fileId === 'string' && fileId.length > 0) body.fileId = fileId;
    if (typeof args.transcript === 'string' && args.transcript.length > 0) {
      body.transcript = args.transcript;
    }
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.POST('/reports/{reportId}/notes', {
          params: { path: { reportId: String(args.reportId) } },
          body,
        }),
      format: (data) => `${chalk.green('✓')} Created note ${chalk.bold(data.id)}`,
    });
  },
});

// --- update -----------------------------------------------------------

export interface NotesUpdateArgs extends NotesHandlerOptions {
  noteId: string;
  body: string | null;
}

export function notesUpdate(args: NotesUpdateArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.PATCH('/notes/{noteId}', {
        params: { path: { noteId: args.noteId } },
        body: { body: args.body },
      }),
    format: (data) => `${chalk.green('✓')} Updated note ${chalk.bold(data.id)}\n${renderNote(data)}`,
  });
}

export const notesUpdateCommand = defineCommand({
  meta: { name: 'update', description: 'Update a note body.' },
  args: {
    noteId: { type: 'positional', required: true, description: 'Note ID (UUID).' },
    body: { type: 'string', required: true, description: 'New body text (pass empty string to clear).' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const newBody = args.body === '' ? null : String(args.body);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.PATCH('/notes/{noteId}', {
          params: { path: { noteId: String(args.noteId) } },
          body: { body: newBody },
        }),
      format: (data) =>
        `${chalk.green('✓')} Updated note ${chalk.bold(data.id)}\n${renderNote(data)}`,
    });
  },
});

// --- delete -----------------------------------------------------------

export interface NotesDeleteArgs extends NotesHandlerOptions {
  noteId: string;
}

export function notesDelete(args: NotesDeleteArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.DELETE('/notes/{noteId}', {
        params: { path: { noteId: args.noteId } },
      }),
    format: () => `${chalk.green('✓')} Deleted note ${args.noteId}`,
    formatJson: () => JSON.stringify({ ok: true }, null, 2),
  });
}

export const notesDeleteCommand = defineCommand({
  meta: { name: 'delete', description: 'Delete a note.' },
  args: {
    noteId: { type: 'positional', required: true, description: 'Note ID (UUID).' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.DELETE('/notes/{noteId}', {
          params: { path: { noteId: String(args.noteId) } },
        }),
      format: () => `${chalk.green('✓')} Deleted note ${args.noteId}`,
      formatJson: () => JSON.stringify({ ok: true }, null, 2),
    });
  },
});

// --- group ------------------------------------------------------------

export const notesCommand = defineCommand({
  meta: { name: 'notes', description: 'Note CRUD on reports.' },
  subCommands: {
    list: notesListCommand,
    create: notesCreateCommand,
    update: notesUpdateCommand,
    delete: notesDeleteCommand,
  },
});
