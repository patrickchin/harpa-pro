/**
 * `harpa auth` — better-auth email-OTP login flow + logout.
 *
 *   harpa auth otp start  <email>         → POST /api/auth/email-otp/send-verification-otp
 *   harpa auth otp verify <email> <code>  → POST /api/auth/sign-in/email-otp
 *   harpa auth logout                     → POST /api/auth/sign-out
 *
 * The better-auth endpoints are NOT part of the OpenAPI contract (they
 * live under `/api/auth/**` and are owned by `auth.handler` in the API),
 * so these handlers go through raw `fetch` against `HARPA_API_URL`
 * rather than the typed openapi-fetch client used by the rest of the
 * CLI. The bearer token is returned both in the `set-auth-token`
 * response header and in the response body's `token` field — we read
 * the body for shell-friendly access.
 *
 * Implementation functions (`authOtpStart`, `authOtpVerify`,
 * `authLogout`) are exported separately from the citty `defineCommand`
 * wrappers so integration tests can call them with an in-process
 * `app.fetch`-wired fetch and assert exit codes without process.exit
 * tearing down the test runner.
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { executeRequest, runRequest } from '../lib/run.js';
import type { ExitCode } from '../lib/error.js';

export interface AuthHandlerOptions {
  /** Base API URL, e.g. `http://localhost:8787`. */
  apiUrl: string;
  /** Custom fetch (used by in-process integration tests). Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Bearer token for authenticated calls (sign-out). */
  token?: string;
  json?: boolean;
  verbose?: boolean;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

/**
 * Wrap a raw `fetch` call to `<apiUrl>/api/auth/<path>` so it returns
 * the same `{ data, error, response }` shape that openapi-fetch gives
 * us, letting `executeRequest` render success / errors uniformly.
 */
async function callAuth<T>(
  apiUrl: string,
  fetchImpl: typeof fetch,
  path: string,
  body: unknown,
  token?: string,
): Promise<{ data?: T; error?: unknown; response: Response }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetchImpl(`${apiUrl}/api/auth/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  let parsed: unknown;
  const text = await response.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: { code: 'NON_JSON', message: text } };
    }
  }
  if (response.ok) return { data: parsed as T, response };
  return { error: parsed, response };
}

function resolveFetch(opts: AuthHandlerOptions): typeof fetch {
  return opts.fetch ?? globalThis.fetch;
}

// --- otp start --------------------------------------------------------

export interface AuthOtpStartArgs extends AuthHandlerOptions {
  email: string;
}

export function authOtpStart(args: AuthOtpStartArgs): Promise<ExitCode> {
  return executeRequest({
    json: args.json,
    verbose: args.verbose,
    stdout: args.stdout,
    stderr: args.stderr,
    request: () =>
      callAuth<{ success?: boolean }>(
        args.apiUrl,
        resolveFetch(args),
        'email-otp/send-verification-otp',
        { email: args.email, type: 'sign-in' },
      ),
    format: () => `${chalk.green('✓')} OTP sent to ${chalk.bold(args.email)}.`,
  });
}

export const otpStartCommand = defineCommand({
  meta: { name: 'start', description: 'Send a sign-in OTP to an email address.' },
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
    const env = getEnv();
    const email = String(args.email);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        callAuth<{ success?: boolean }>(
          env.HARPA_API_URL,
          globalThis.fetch,
          'email-otp/send-verification-otp',
          { email, type: 'sign-in' },
        ),
      format: () => `${chalk.green('✓')} OTP sent to ${chalk.bold(email)}.`,
    });
  },
});

// --- otp verify -------------------------------------------------------

interface OtpVerifyResponse {
  token: string;
  user: {
    id: string;
    email: string;
    displayName?: string | null;
    name?: string | null;
  };
}

export interface AuthOtpVerifyArgs extends AuthHandlerOptions {
  email: string;
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
      callAuth<OtpVerifyResponse>(
        args.apiUrl,
        resolveFetch(args),
        'sign-in/email-otp',
        { email: args.email, otp: args.code },
      ),
    format: (data) => {
      if (args.raw) return data.token;
      const name = data.user.displayName ?? data.user.name ?? data.user.email;
      return [
        `${chalk.green('✓')} Verified as ${chalk.bold(name)} ${chalk.dim(`<${data.user.email}>`)}`,
        '',
        chalk.dim('Export the token to use authenticated commands:'),
        `  export HARPA_TOKEN=${data.token}`,
      ].join('\n');
    },
  });
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
    const env = getEnv();
    const email = String(args.email);
    const code = String(args.code);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        callAuth<OtpVerifyResponse>(
          env.HARPA_API_URL,
          globalThis.fetch,
          'sign-in/email-otp',
          { email, otp: code },
        ),
      format: (data) => {
        if (args.raw) return data.token;
        const name = data.user.displayName ?? data.user.name ?? data.user.email;
        return [
          `${chalk.green('✓')} Verified as ${chalk.bold(name)} ${chalk.dim(`<${data.user.email}>`)}`,
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
    request: () =>
      callAuth<{ success?: boolean }>(
        args.apiUrl,
        resolveFetch(args),
        'sign-out',
        {},
        args.token,
      ),
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
    if (!env.HARPA_TOKEN) {
      process.stderr.write(
        chalk.red('Error: HARPA_TOKEN is not set. Nothing to log out of.\n'),
      );
      process.exit(3);
    }
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () =>
        callAuth<{ success?: boolean }>(
          env.HARPA_API_URL,
          globalThis.fetch,
          'sign-out',
          {},
          env.HARPA_TOKEN,
        ),
      format: () =>
        `${chalk.green('✓')} Logged out. The bearer token is no longer valid; unset HARPA_TOKEN.`,
    });
  },
});

// --- group commands ---------------------------------------------------

export const otpCommand = defineCommand({
  meta: { name: 'otp', description: 'Email OTP login (start, verify).' },
  subCommands: {
    start: otpStartCommand,
    verify: otpVerifyCommand,
  },
});

export const authCommand = defineCommand({
  meta: { name: 'auth', description: 'Authentication (email OTP login, logout).' },
  subCommands: {
    otp: otpCommand,
    logout: logoutCommand,
  },
});
