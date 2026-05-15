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
import {
  EXIT,
  type ExitCode,
  mapStatusToExitCode,
  printError,
  printTransportError,
  type ErrorEnvelope,
} from './error.js';
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
  /** Output stream for success rendering; defaults to process.stdout. */
  stdout?: NodeJS.WritableStream;
  /** Output stream for error rendering; defaults to process.stderr. */
  stderr?: NodeJS.WritableStream;
}

/**
 * Pure core: runs the request, writes output, returns the exit code.
 * Never calls `process.exit`, so it is safe to use from tests.
 */
export async function executeRequest<T>(opts: RunRequestOptions<T>): Promise<ExitCode> {
  const out = opts.stdout ?? process.stdout;
  const err = opts.stderr ?? process.stderr;
  const debug = process.env.HARPA_DEBUG === '1';

  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await opts.request();
  } catch (e) {
    if (e instanceof MissingTokenError) {
      err.write(chalk.red('Error: ' + e.message) + '\n');
      return e.exitCode;
    }
    printTransportError(e, { json: opts.json, debug, stderr: err });
    return EXIT.TRANSPORT;
  }

  const { data, error, response } = result;
  const status = response.status;

  if (status >= 200 && status < 300) {
    if (opts.json) {
      const json = opts.formatJson
        ? opts.formatJson(data as T)
        : JSON.stringify(data ?? {}, null, 2);
      out.write(json + '\n');
    } else {
      const formatted = opts.format(data as T);
      if (formatted !== undefined && formatted !== '') out.write(formatted + '\n');
    }
    if (opts.verbose) writeVerbose(response, err);
    return EXIT.OK;
  }

  printError(status, error as ErrorEnvelope | undefined, response.headers, {
    json: opts.json,
    debug,
    stderr: err,
  });
  return mapStatusToExitCode(status);
}

/**
 * Thin wrapper used by every citty command handler: runs `executeRequest`
 * and process.exits with the resulting code. Typed as `never` because the
 * process is gone by the time control would return.
 */
export async function runRequest<T>(opts: RunRequestOptions<T>): Promise<never> {
  const code = await executeRequest(opts);
  process.exit(code);
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
