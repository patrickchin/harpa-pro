/**
 * `harpa voice` — transcribe / summarize voice notes.
 *
 *   harpa voice transcribe --file-id <uuid> [--fixture <name>] [--idempotency-key <k>]
 *   harpa voice summarize  --transcript <text> [--fixture <name>] [--idempotency-key <k>]
 *
 * Both routes are AI-provider-backed and accept the standard
 * `Idempotency-Key` header (server-side dedupe). Pass `--fixture` to
 * pin a recorded fixture name when running against an in-process /
 * fixture-mode API. With no `--fixture`, the API falls back to
 * `transcribe.basic` / `summarize.basic`.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import type { ExitCode } from '../lib/error.js';

export interface VoiceHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// --- transcribe -------------------------------------------------------

export interface VoiceTranscribeArgs extends VoiceHandlerOptions {
  fileId: string;
  fixtureName?: string;
  idempotencyKey?: string;
}

export function voiceTranscribe(args: VoiceTranscribeArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/voice/transcribe', {
        body: {
          fileId: args.fileId,
          ...(args.fixtureName ? { fixtureName: args.fixtureName } : {}),
        },
        ...(args.idempotencyKey
          ? { headers: { 'idempotency-key': args.idempotencyKey } }
          : {}),
      }),
    format: (data) => `${chalk.bold('Transcript:')} ${data.transcript}`,
  });
}

export const voiceTranscribeCommand = defineCommand({
  meta: { name: 'transcribe', description: 'Transcribe a recorded voice file.' },
  args: {
    'file-id': { type: 'string', required: true, description: 'Voice file UUID.' },
    fixture: { type: 'string', description: 'Pin a fixture name (replay mode).' },
    'idempotency-key': { type: 'string', description: 'Idempotency-Key header value.' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const fileId = String(args['file-id']);
    const fixtureName = args.fixture ? String(args.fixture) : undefined;
    const idempotencyKey = args['idempotency-key'] ? String(args['idempotency-key']) : undefined;
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.POST('/voice/transcribe', {
          body: {
            fileId,
            ...(fixtureName ? { fixtureName } : {}),
          },
          ...(idempotencyKey ? { headers: { 'idempotency-key': idempotencyKey } } : {}),
        }),
      format: (data) => `${chalk.bold('Transcript:')} ${data.transcript}`,
    });
  },
});

// --- summarize --------------------------------------------------------

export interface VoiceSummarizeArgs extends VoiceHandlerOptions {
  transcript: string;
  fixtureName?: string;
  idempotencyKey?: string;
}

export function voiceSummarize(args: VoiceSummarizeArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/voice/summarize', {
        body: {
          transcript: args.transcript,
          ...(args.fixtureName ? { fixtureName: args.fixtureName } : {}),
        },
        ...(args.idempotencyKey
          ? { headers: { 'idempotency-key': args.idempotencyKey } }
          : {}),
      }),
    format: (data) => `${chalk.bold('Summary:')} ${data.summary}`,
  });
}

export const voiceSummarizeCommand = defineCommand({
  meta: { name: 'summarize', description: 'Summarize a transcript via AI.' },
  args: {
    transcript: { type: 'string', required: true, description: 'Transcript text to summarize.' },
    fixture: { type: 'string', description: 'Pin a fixture name (replay mode).' },
    'idempotency-key': { type: 'string', description: 'Idempotency-Key header value.' },
    json: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
  async run({ args }) {
    const env = getEnv();
    requireToken(env);
    const client = createApiClient(env);
    const transcript = String(args.transcript);
    const fixtureName = args.fixture ? String(args.fixture) : undefined;
    const idempotencyKey = args['idempotency-key'] ? String(args['idempotency-key']) : undefined;
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.POST('/voice/summarize', {
          body: {
            transcript,
            ...(fixtureName ? { fixtureName } : {}),
          },
          ...(idempotencyKey ? { headers: { 'idempotency-key': idempotencyKey } } : {}),
        }),
      format: (data) => `${chalk.bold('Summary:')} ${data.summary}`,
    });
  },
});

export const voiceCommand = defineCommand({
  meta: { name: 'voice', description: 'Voice transcription + summarization.' },
  subCommands: {
    transcribe: voiceTranscribeCommand,
    summarize: voiceSummarizeCommand,
  },
});
