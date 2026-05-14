/**
 * Error rendering + exit-code mapping for @harpa/cli.
 *
 * Contract (see docs/v4/arch-cli.md §"Output contract"):
 *   0  success
 *   1  generic
 *   2  validation (HTTP 400, 422)
 *   3  auth (HTTP 401, 403, or missing HARPA_TOKEN)
 *   4  not-found (HTTP 404)
 *   5  rate-limit (HTTP 429)
 *   6  server (HTTP 5xx)
 *   7  network / transport
 *
 * Errors always go to stderr. Human format includes the API error
 * envelope (code, message) and the request id; --json prints the raw
 * envelope to stderr; HARPA_DEBUG=1 additionally dumps headers + body.
 */
import chalk from 'chalk';

export const EXIT = {
  OK: 0,
  GENERIC: 1,
  VALIDATION: 2,
  AUTH: 3,
  NOT_FOUND: 4,
  RATE_LIMIT: 5,
  SERVER: 6,
  TRANSPORT: 7,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export function mapStatusToExitCode(status: number): ExitCode {
  if (status >= 200 && status < 300) return EXIT.OK;
  if (status === 400 || status === 422) return EXIT.VALIDATION;
  if (status === 401 || status === 403) return EXIT.AUTH;
  if (status === 404) return EXIT.NOT_FOUND;
  if (status === 429) return EXIT.RATE_LIMIT;
  if (status >= 500 && status < 600) return EXIT.SERVER;
  return EXIT.GENERIC;
}

export interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  requestId?: string;
}

export interface PrintErrorOptions {
  json?: boolean;
  debug?: boolean;
  stderr?: NodeJS.WritableStream;
}

/**
 * Render an API error response. `body` is the parsed JSON envelope (may
 * be undefined if the response wasn't JSON). `status` is the HTTP status
 * code; `headers` provides request id / rate-limit metadata.
 */
export function printError(
  status: number,
  body: ErrorEnvelope | undefined,
  headers: Headers,
  opts: PrintErrorOptions = {},
): void {
  const out = opts.stderr ?? process.stderr;
  const requestId = headers.get('x-request-id') ?? body?.requestId ?? 'unknown';

  if (opts.json) {
    const payload = body ?? { error: { code: 'UNKNOWN', message: `HTTP ${status}` }, requestId };
    out.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }

  const code = body?.error?.code ?? 'UNKNOWN';
  const message = body?.error?.message ?? `HTTP ${status}`;
  out.write(chalk.red(`Error: ${status} ${code}`) + '\n');
  out.write(message + '\n');
  out.write(chalk.dim(`\nRequest ID: ${requestId}`) + '\n');

  if (status === 429) {
    const retryAfter = headers.get('retry-after');
    if (retryAfter) {
      out.write(chalk.yellow(`Retry after: ${retryAfter}s`) + '\n');
    }
  }

  if (opts.debug) {
    out.write(chalk.dim('\nResponse headers:') + '\n');
    headers.forEach((v: string, k: string) => out.write(chalk.dim(`  ${k}: ${v}`) + '\n'));
    if (body !== undefined) {
      out.write(chalk.dim('\nResponse body:') + '\n');
      out.write(JSON.stringify(body, null, 2) + '\n');
    }
  }
}

/**
 * Print a transport / network error (fetch threw, JSON parse failed, etc).
 * Always exits with code 7 (TRANSPORT).
 */
export function printTransportError(err: unknown, opts: PrintErrorOptions = {}): void {
  const out = opts.stderr ?? process.stderr;
  const message = err instanceof Error ? err.message : String(err);

  if (opts.json) {
    out.write(
      JSON.stringify(
        { error: { code: 'TRANSPORT_ERROR', message }, requestId: 'n/a' },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  out.write(chalk.red('Error: transport / network failure') + '\n');
  out.write(message + '\n');

  if (opts.debug && err instanceof Error && err.stack) {
    out.write(chalk.dim('\n' + err.stack) + '\n');
  }
}
