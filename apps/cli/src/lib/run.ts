/**
 * Shared helpers used by every command handler.
 *
 * `runRequest` wraps an openapi-fetch call so that:
 *   - 2xx responses go through the supplied formatter (human or JSON)
 *   - non-2xx responses render the API error envelope to stderr and
 *     exit with the mapped exit code (see lib/error.ts)
 *   - thrown errors (network / parse) render via `printTransportError`
 *     and exit 7
 *
 * Every command goes through this helper so the output contract is
 * enforced in one place.
 */
import chalk from 'chalk';
import { EXIT, mapStatusToExitCode, printError, printTransportError, type ErrorEnvelope } from './error.js';
import { MissingTokenError } from './client.js';

export interface GlobalFlags {
  json?: boolean;
  verbose?: boolean;
}

export interface RunRequestOptions<T> extends GlobalFlags {
  /** Called for 2xx; should return the string to write to stdout, or undefined to skip. */
  format: (data: T) => string | undefined;
  /** Called for 2xx in `--json` mode; defaults to JSON-stringifying `data`. */
  formatJson?: (data: T) => string;
  /** Underlying request thunk; returns openapi-fetch shape. */
  request: () => Promise<{ data?: T; error?: unknown; response: Response }>;
  /** Print verbose response metadata when `--verbose` is set. */
  stdout?: NodeJS.WritableStream;
}

export async function runRequest<T>(opts: RunRequestOptions<T>): Promise<never> {
  const out = opts.stdout ?? process.stdout;
  const debug = process.env.HARPA_DEBUG === '1';

  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await opts.request();
  } catch (err) {
    if (err instanceof MissingTokenError) {
      process.stderr.write(chalk.red('Error: ' + err.message) + '\n');
      process.exit(err.exitCode);
    }
    printTransportError(err, { json: opts.json, debug });
    process.exit(EXIT.TRANSPORT);
  }

  const { data, error, response } = result;
  const status = response.status;

  if (status >= 200 && status < 300 && data !== undefined) {
    if (opts.json) {
      const json = opts.formatJson ? opts.formatJson(data) : JSON.stringify(data, null, 2);
      out.write(json + '\n');
    } else {
      const formatted = opts.format(data);
      if (formatted !== undefined && formatted !== '') out.write(formatted + '\n');
    }
    if (opts.verbose) writeVerbose(response, out);
    process.exit(EXIT.OK);
  }

  printError(status, error as ErrorEnvelope | undefined, response.headers, {
    json: opts.json,
    debug,
  });
  process.exit(mapStatusToExitCode(status));
}

function writeVerbose(response: Response, out: NodeJS.WritableStream): void {
  const reqId = response.headers.get('x-request-id');
  const replay = response.headers.get('idempotent-replay');
  const rlLimit = response.headers.get('x-ratelimit-limit');
  const rlRemaining = response.headers.get('x-ratelimit-remaining');

  out.write(chalk.dim('\n--- response metadata ---') + '\n');
  if (reqId) out.write(chalk.dim(`Request ID: ${reqId}`) + '\n');
  if (replay) out.write(chalk.dim(`Idempotent replay: ${replay}`) + '\n');
  if (rlLimit && rlRemaining) {
    out.write(chalk.dim(`Rate limit: ${rlRemaining}/${rlLimit} remaining`) + '\n');
  }
}
