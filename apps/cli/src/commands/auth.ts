/**
 * `harpa auth` — OTP login flow + logout.
 *
 *   harpa auth otp start <phone>          → POST /auth/otp/start
 *   harpa auth otp verify <phone> <code>  → POST /auth/otp/verify
 *   harpa auth logout                     → POST /auth/logout
 *
 * The implementation functions (`authOtpStart`, `authOtpVerify`,
 * `authLogout`) are exported separately from the citty `defineCommand`
 * wrappers so integration tests can call them with an in-process
 * `app.fetch`-wired client and assert exit codes without process.exit
 * tearing down the test runner.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient, requireToken, type ApiClient } from '../lib/client.js';
import { executeRequest, runRequest } from '../lib/run.js';
import type { ExitCode } from '../lib/error.js';

export interface AuthHandlerOptions {
  client: ApiClient;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

// --- otp start --------------------------------------------------------

export interface AuthOtpStartArgs extends AuthHandlerOptions {
  phone: string;
}

export function authOtpStart(args: AuthOtpStartArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/auth/otp/start', { body: { phone: args.phone } }),
    format: (data) =>
      `${chalk.green('✓')} OTP sent. Verification ID: ${data.verificationId}`,
  });
}

export const otpStartCommand = defineCommand({
  meta: { name: 'start', description: 'Send an OTP to a phone number.' },
  args: {
    phone: {
      type: 'positional',
      required: true,
      description: 'E.164 phone number (e.g. +15551234567).',
    },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    const client = createApiClient(env);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.POST('/auth/otp/start', { body: { phone: args.phone } }),
      format: (data) =>
        `${chalk.green('✓')} OTP sent. Verification ID: ${data.verificationId}`,
    });
  },
});

// --- otp verify -------------------------------------------------------

export interface AuthOtpVerifyArgs extends AuthHandlerOptions {
  phone: string;
  code: string;
  /** When true, prints only the bearer token (no decoration) for shell capture. */
  raw?: boolean;
}

export function authOtpVerify(args: AuthOtpVerifyArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      args.client.POST('/auth/otp/verify', {
        body: { phone: args.phone, code: args.code },
      }),
    format: (data) => {
      if (args.raw) return data.token;
      const name = data.user.displayName ?? data.user.phone;
      return [
        `${chalk.green('✓')} Verified as ${chalk.bold(name)} (${data.user.id})`,
        '',
        chalk.dim('Export the token to use authenticated commands:'),
        `  export HARPA_TOKEN=${data.token}`,
      ].join('\n');
    },
  });
}

export const otpVerifyCommand = defineCommand({
  meta: { name: 'verify', description: 'Verify an OTP code and mint a bearer token.' },
  args: {
    phone: {
      type: 'positional',
      required: true,
      description: 'E.164 phone number that received the OTP.',
    },
    code: {
      type: 'positional',
      required: true,
      description: 'OTP code (4–8 digits).',
    },
    raw: {
      type: 'boolean',
      description: 'Print only the bearer token to stdout (no formatting).',
    },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    const client = createApiClient(env);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        client.POST('/auth/otp/verify', {
          body: { phone: args.phone, code: args.code },
        }),
      format: (data) => {
        if (args.raw) return data.token;
        const name = data.user.displayName ?? data.user.phone;
        return [
          `${chalk.green('✓')} Verified as ${chalk.bold(name)} (${data.user.id})`,
          '',
          chalk.dim('Export the token to use authenticated commands:'),
          `  export HARPA_TOKEN=${data.token}`,
        ].join('\n');
      },
    });
  },
});

// --- logout -----------------------------------------------------------

export type AuthLogoutArgs = AuthHandlerOptions;

export function authLogout(args: AuthLogoutArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () => args.client.POST('/auth/logout', {}),
    format: () =>
      `${chalk.green('✓')} Logged out. The bearer token is no longer valid; unset HARPA_TOKEN.`,
  });
}

export const logoutCommand = defineCommand({
  meta: {
    name: 'logout',
    description: 'Revoke the current session token (requires HARPA_TOKEN).',
  },
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
      request: () => client.POST('/auth/logout', {}),
      format: () =>
        `${chalk.green('✓')} Logged out. The bearer token is no longer valid; unset HARPA_TOKEN.`,
    });
  },
});

// --- group commands ---------------------------------------------------

export const otpCommand = defineCommand({
  meta: { name: 'otp', description: 'OTP login (start, verify).' },
  subCommands: {
    start: otpStartCommand,
    verify: otpVerifyCommand,
  },
});

export const authCommand = defineCommand({
  meta: { name: 'auth', description: 'Authentication (OTP login, logout).' },
  subCommands: {
    otp: otpCommand,
    logout: logoutCommand,
  },
});
