/**
 * `harpa files` — file lifecycle: presign → PUT to R2 → register → signed GET.
 *
 *   harpa files presign  --kind --content-type --size      → POST /files/presign
 *   harpa files register --kind --file-key --size --content-type → POST /files
 *   harpa files url <fileId>                               → GET  /files/{id}/url
 *
 * Plus a convenience helper:
 *
 *   harpa files upload --file <path> --kind <k> [--content-type <ct>]
 *
 * which chains presign → streaming PUT (via global fetch) → register and
 * prints the final file record. The PUT body is streamed via
 * `fs.createReadStream()` — large files do not buffer in memory.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import { EXIT, type ExitCode } from '../lib/error.js';

export type FileKind = 'voice' | 'image' | 'document' | 'pdf';

export interface FilesHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// --- presign ----------------------------------------------------------

export interface FilesPresignArgs extends FilesHandlerOptions {
  kind: FileKind;
  contentType: string;
  sizeBytes: number;
}

export function filesPresign(args: FilesPresignArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/files/presign', {
        body: {
          kind: args.kind,
          contentType: args.contentType,
          sizeBytes: args.sizeBytes,
        },
      }),
    format: (data) =>
      [
        `${chalk.green('✓')} Presigned upload URL`,
        `  File key:   ${data.fileKey}`,
        `  Upload URL: ${data.uploadUrl}`,
        `  Expires at: ${data.expiresAt}`,
      ].join('\n'),
  });
}

export const filesPresignCommand = defineCommand({
  meta: { name: 'presign', description: 'Mint a presigned upload URL for R2.' },
  args: {
    kind: { type: 'string', required: true, description: 'voice | image | document | pdf' },
    'content-type': { type: 'string', required: true, description: 'MIME type.' },
    size: { type: 'string', required: true, description: 'Size in bytes.' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const kind = parseKind(String(args.kind));
    const contentType = String(args['content-type']);
    const sizeBytes = Number(args.size);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      process.stderr.write(chalk.red(`Error: --size must be a positive integer\n`));
      process.exit(2);
    }
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.POST('/files/presign', { body: { kind, contentType, sizeBytes } }),
      format: (data) =>
        [
          `${chalk.green('✓')} Presigned upload URL`,
          `  File key:   ${data.fileKey}`,
          `  Upload URL: ${data.uploadUrl}`,
          `  Expires at: ${data.expiresAt}`,
        ].join('\n'),
    });
  },
});

// --- register ---------------------------------------------------------

export interface FilesRegisterArgs extends FilesHandlerOptions {
  kind: FileKind;
  fileKey: string;
  sizeBytes: number;
  contentType: string;
}

export function filesRegister(args: FilesRegisterArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/files', {
        body: {
          kind: args.kind,
          fileKey: args.fileKey,
          sizeBytes: args.sizeBytes,
          contentType: args.contentType,
        },
      }),
    format: (data) =>
      `${chalk.green('✓')} Registered file ${chalk.bold(data.id)} (${data.kind}, ${data.sizeBytes} bytes)`,
  });
}

export const filesRegisterCommand = defineCommand({
  meta: { name: 'register', description: 'Register an uploaded file in the database.' },
  args: {
    kind: { type: 'string', required: true, description: 'voice | image | document | pdf' },
    'file-key': { type: 'string', required: true, description: 'Server-built file key from presign.' },
    size: { type: 'string', required: true, description: 'Size in bytes.' },
    'content-type': { type: 'string', required: true, description: 'MIME type.' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const kind = parseKind(String(args.kind));
    const sizeBytes = Number(args.size);
    const fileKey = String(args['file-key']);
    const contentType = String(args['content-type']);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      process.stderr.write(chalk.red(`Error: --size must be a positive integer\n`));
      process.exit(2);
    }
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.POST('/files', { body: { kind, fileKey, sizeBytes, contentType } }),
      format: (data) =>
        `${chalk.green('✓')} Registered file ${chalk.bold(data.id)} (${data.kind}, ${data.sizeBytes} bytes)`,
    });
  },
});

// --- url --------------------------------------------------------------

export interface FilesUrlArgs extends FilesHandlerOptions {
  fileId: string;
}

export function filesUrl(args: FilesUrlArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.GET('/files/{id}/url', {
        params: { path: { id: args.fileId } },
      }),
    format: (data) =>
      [
        `${chalk.green('✓')} Signed download URL`,
        `  URL:        ${data.url}`,
        `  Expires at: ${data.expiresAt}`,
      ].join('\n'),
  });
}

export const filesUrlCommand = defineCommand({
  meta: { name: 'url', description: 'Mint a signed GET URL for a file.' },
  args: {
    fileId: { type: 'positional', required: true, description: 'File ID (UUID).' },
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
        client.GET('/files/{id}/url', { params: { path: { id: String(args.fileId) } } }),
      format: (data) =>
        [
          `${chalk.green('✓')} Signed download URL`,
          `  URL:        ${data.url}`,
          `  Expires at: ${data.expiresAt}`,
        ].join('\n'),
    });
  },
});

// --- upload helper ----------------------------------------------------

export interface FilesUploadArgs extends FilesHandlerOptions {
  file: string;
  kind: FileKind;
  contentType?: string;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export interface FilesUploadResult {
  fileId: string;
  fileKey: string;
  sizeBytes: number;
  contentType: string;
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.m4a': 'audio/m4a',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Pure helper: presign → PUT → register. Returns the registered file's
 * id + metadata. Stream-based so files of any size flow through without
 * buffering. The caller passes in the fetch implementation used for the
 * R2 PUT — injectable for in-process tests.
 */
export async function uploadFile(
  args: FilesUploadArgs,
): Promise<{ exitCode: ExitCode; result?: FilesUploadResult }> {
  const stderr = args.stderr ?? process.stderr;
  const fetchImpl = args.fetchImpl ?? fetch;

  let fileStat;
  try {
    fileStat = await stat(args.file);
  } catch (e) {
    stderr.write(chalk.red(`Error: cannot read file ${args.file}: ${(e as Error).message}\n`));
    return { exitCode: EXIT.TRANSPORT };
  }
  const sizeBytes = fileStat.size;
  if (sizeBytes <= 0) {
    stderr.write(chalk.red(`Error: file ${args.file} is empty\n`));
    return { exitCode: EXIT.VALIDATION };
  }
  const contentType = args.contentType ?? guessContentType(args.file);

  // 1. Presign.
  const presignResp = await args.client.POST('/files/presign', {
    body: { kind: args.kind, contentType, sizeBytes },
  });
  if (presignResp.error || !presignResp.data) {
    stderr.write(chalk.red(`Error: presign failed (HTTP ${presignResp.response.status})\n`));
    return { exitCode: EXIT.GENERIC };
  }
  const { uploadUrl, fileKey } = presignResp.data;

  // 2. PUT to R2 (streaming).
  const stream = createReadStream(args.file);
  let putResp: Response;
  try {
    // node fetch accepts a ReadableStream / async iterable body when duplex='half'.
    const init = {
      method: 'PUT',
      duplex: 'half',
      body: stream,
      headers: { 'content-type': contentType, 'content-length': String(sizeBytes) },
    } as unknown as RequestInit;
    putResp = await fetchImpl(uploadUrl, init);
  } catch (e) {
    stderr.write(chalk.red(`Error: upload PUT failed: ${(e as Error).message}\n`));
    return { exitCode: EXIT.TRANSPORT };
  }
  if (!putResp.ok) {
    stderr.write(chalk.red(`Error: upload PUT failed (HTTP ${putResp.status})\n`));
    return { exitCode: EXIT.GENERIC };
  }

  // 3. Register.
  const regResp = await args.client.POST('/files', {
    body: { kind: args.kind, fileKey, sizeBytes, contentType },
  });
  if (regResp.error || !regResp.data) {
    stderr.write(chalk.red(`Error: register failed (HTTP ${regResp.response.status})\n`));
    return { exitCode: EXIT.GENERIC };
  }

  return {
    exitCode: EXIT.OK,
    result: {
      fileId: regResp.data.id,
      fileKey: regResp.data.fileKey,
      sizeBytes: regResp.data.sizeBytes,
      contentType: regResp.data.contentType,
    },
  };
}

export async function filesUpload(args: FilesUploadArgs): Promise<ExitCode> {
  const stdout = args.stdout ?? process.stdout;
  const { exitCode, result } = await uploadFile(args);
  if (exitCode === EXIT.OK && result) {
    if (args.json) {
      stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      stdout.write(
        `${chalk.green('✓')} Uploaded ${args.file}\n` +
          `  File ID:    ${result.fileId}\n` +
          `  File key:   ${result.fileKey}\n` +
          `  Size:       ${result.sizeBytes} bytes\n` +
          `  Type:       ${result.contentType}\n`,
      );
    }
  }
  return exitCode;
}

export const filesUploadCommand = defineCommand({
  meta: { name: 'upload', description: 'Presign → PUT → register a local file in one step.' },
  args: {
    file: { type: 'string', required: true, description: 'Path to the local file.' },
    kind: { type: 'string', required: true, description: 'voice | image | document | pdf' },
    'content-type': { type: 'string', description: 'Override the auto-detected MIME type.' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const kind = parseKind(String(args.kind));
    const contentTypeRaw = args['content-type'];
    const exit = await filesUpload({
      client,
      file: String(args.file),
      kind,
      ...(typeof contentTypeRaw === 'string' && contentTypeRaw.length > 0
        ? { contentType: contentTypeRaw }
        : {}),
      json: args.json,
      verbose: args.verbose,
    });
    process.exit(exit);
  },
});

// --- group + helpers --------------------------------------------------

function parseKind(kind: string): FileKind {
  if (kind !== 'voice' && kind !== 'image' && kind !== 'document' && kind !== 'pdf') {
    process.stderr.write(
      chalk.red(`Error: --kind must be one of voice|image|document|pdf (got ${kind})\n`),
    );
    process.exit(2);
  }
  return kind;
}

export const filesCommand = defineCommand({
  meta: { name: 'files', description: 'File presign / register / signed-URL / upload.' },
  subCommands: {
    presign: filesPresignCommand,
    register: filesRegisterCommand,
    url: filesUrlCommand,
    upload: filesUploadCommand,
  },
});
