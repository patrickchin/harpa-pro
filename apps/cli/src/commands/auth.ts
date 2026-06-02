/**
 * `harpa auth` — email-OTP login flow + logout.
 *
 *   harpa auth otp start <email>          → POST /api/auth/email-otp/send-verification-otp
 *   harpa auth otp verify <email> <code>  → POST /api/auth/email-otp/verify-otp
 *   harpa auth logout                     → POST /api/auth/sign-out
 *
 * These endpoints are served by better-auth's internal router (not the
 * OpenAPI contract), so they are called via raw fetch rather than the
 * typed openapi-fetch client.
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
import { requireToken } from '../lib/client.js';
import type { ExitCode } from '../lib/error.js';

export interface AuthHandlerOptions {
  baseUrl?: string;
  token?: string;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

async function authPost(
  baseUrl: string,
  path: string,
  body: Record<string, string>,
  token?: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// --- otp start --------------------------------------------------------

export interface AuthOtpStartArgs extends AuthHandlerOptions {
  email: string;
}

export async function authOtpStart(args: AuthOtpStartArgs): Promise<ExitCode> {
  const env = getEnv();
  const baseUrl = args.baseUrl ?? env.HARPA_API_URL;
  const out = args.stdout ?? process.stdout;
  const err = args.stderr ?? process.stderr;
  const { ok, status, data } = await authPost(baseUrl, '/api/auth/email-otp/send-verification-otp', {
    email: args.email,
    type: 'sign-in',
  });
  if (!ok) {
    const msg = (data as Record<string, string> | null)?.message ?? `HTTP ${status}`;
    err.write(chalk.red(`Error: ${msg}\n`));
    return 1 as ExitCode;
  }
  if (args.json) {
    out.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    out.write(`${chalk.green('✓')} OTP sent to ${args.email}.\n`);
  }
  return 0 as ExitCode;
}

export const otpStartCommand = defineCommand({
  meta: { name: 'start', description: 'Send an email OTP to sign in.' },
  args: {
    email: {
      type: 'positional',
      required: true,
      description: 'Email address to send the OTP to.',
    },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const code = await authOtpStart({ email: String(args.email), json: args.json });
    if (code !== 0) process.exit(code);
  },
});

// --- otp verify -------------------------------------------------------

export interface AuthOtpVerifyArgs extends AuthHandlerOptions {
  email: string;
  code: string;
  /** When true, prints only the bearer token (no decoration) for shell capture. */
  raw?: boolean;
}

export async function authOtpVerify(args: AuthOtpVerifyArgs): Promise<ExitCode> {
  const env = getEnv();
  const baseUrl = args.baseUrl ?? env.HARPA_API_URL;
  const out = args.stdout ?? process.stdout;
  const err = args.stderr ?? process.stderr;
  const { ok, status, data } = await authPost(baseUrl, '/api/auth/email-otp/verify-otp', {
    email: args.email,
    otp: args.code,
    type: 'sign-in',
  });
  if (!ok) {
    const msg = (data as Record<string, string> | null)?.message ?? `HTTP ${status}`;
    err.write(chalk.red(`Error: ${msg}\n`));
    return 1 as ExitCode;
  }
  const { user, session } = data as { user: { displayName?: string | null; email: string }; session: { token: string } };
  if (args.json) {
    out.write(JSON.stringify(data, null, 2) + '\n');
  } else if (args.raw) {
    out.write(session.token + '\n');
  } else {
    const name = user.displayName ?? user.email;
    out.write(
      [
        `${chalk.green('✓')} Verified as ${chalk.bold(name)} ${chalk.dim(`<${user.email}>`)}`,
        '',
        chalk.dim('Export the token to use authenticated commands:'),
        `  export HARPA_TOKEN=${session.token}`,
      ].join('\n') + '\n',
    );
  }
  return 0 as ExitCode;
}

export const otpVerifyCommand = defineCommand({
  meta: { name: 'verify', description: 'Verify an email OTP code and mint a bearer token.' },
  args: {
    email: {
      type: 'positional',
      required: true,
      description: 'Email address that received the OTP.',
    },
    code: {
      type: 'positional',
      required: true,
      description: 'OTP code (6 digits).',
    },
    raw: {
      type: 'boolean',
      description: 'Print only the bearer token to stdout (no formatting).',
    },
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const exitCode = await authOtpVerify({
      email: String(args.email),
      code: String(args.code),
      raw: args.raw,
      json: args.json,
    });
    if (exitCode !== 0) process.exit(exitCode);
  },
});

// --- logout -----------------------------------------------------------

export type AuthLogoutArgs = AuthHandlerOptions;

export async function authLogout(args: AuthLogoutArgs): Promise<ExitCode> {
  const env = getEnv();
  const baseUrl = args.baseUrl ?? env.HARPA_API_URL;
  const token = args.token ?? env.HARPA_TOKEN;
  const out = args.stdout ?? process.stdout;
  const err = args.stderr ?? process.stderr;
  const { ok, status, data } = await authPost(baseUrl, '/api/auth/sign-out', {}, token);
  if (!ok) {
    const msg = (data as Record<string, string> | null)?.message ?? `HTTP ${status}`;
    err.write(chalk.red(`Error: ${msg}\n`));
    return 1 as ExitCode;
  }
  out.write(`${chalk.green('✓')} Logged out. The bearer token is no longer valid; unset HARPA_TOKEN.\n`);
  return 0 as ExitCode;
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
    const exitCode = await authLogout({ json: args.json });
    if (exitCode !== 0) process.exit(exitCode);
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
