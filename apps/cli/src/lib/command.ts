/**
 * `defineHarpaCommand()` — single source of truth for CLI commands.
 *
 * Each command exports the citty command (for the flag-driven CLI),
 * a `tuiSpec` (for the menu-driven `harpa tui`), and a shared
 * `execute(ctx)` factory that builds the underlying API request +
 * formatter. Citty calls execute through `runRequest` (print + exit);
 * the TUI calls execute through `performRequest` (returns an outcome,
 * loop continues).
 *
 * For commands that pre-date this helper, use `defineTuiEntry()` to
 * attach a TUI sidecar to an existing citty command without rewriting
 * its handler. Both helpers produce the same `HarpaCommand` shape.
 *
 * See docs/v4/arch-tui.md §3.2.
 */
import { defineCommand, type ArgsDef, type CommandDef, type ParsedArgs } from 'citty';
import { type CliEnv } from './env.js';
import { getEnv } from './env-runtime.js';
import { runRequest } from './run.js';
import { createApiClient, requireToken, type ApiClient } from './client.js';

/**
 * Per-arg prompt metadata, keyed by the citty arg name. Kept separate
 * from citty's ArgDef so we can express richer widgets (uuid, phone,
 * select, multiline, confirm) than citty's `type` exposes.
 */
export type ArgPrompt =
  | { kind: 'text'; placeholder?: string; default?: string; validate?: (s: string) => string | undefined }
  | { kind: 'multiline'; placeholder?: string }
  | { kind: 'uuid'; placeholder?: string }
  | { kind: 'phone'; placeholder?: string }
  | { kind: 'select'; options: ReadonlyArray<{ value: string; label: string; hint?: string }> }
  | { kind: 'confirm'; default?: boolean }
  | { kind: 'number'; min?: number; max?: number; default?: number };

export interface TuiArgSpec {
  /** Prompt label shown to the user. */
  label: string;
  /** clack prompt kind + per-kind options. */
  prompt: ArgPrompt;
  /** Skip this prompt entirely if predicate returns true. */
  skipWhen?: (answers: Record<string, unknown>) => boolean;
  /** Whether the arg is required for the underlying call. */
  required: boolean;
}

export interface TuiSpec<A extends ArgsDef> {
  /** Top-level menu group, e.g. 'auth', 'projects'. */
  group: string;
  /** Human label in the group's submenu. */
  label: string;
  /** Short description for the menu hint. */
  hint?: string;
  /**
   * Full citty path to this leaf, e.g. ['auth', 'otp', 'start']. Used
   * by the registry-completeness gate to map TUI entries back to the
   * citty tree. Defaults to `[group, <cittyCommand.meta.name>]`.
   */
  cittyPath?: ReadonlyArray<string>;
  /** Per-arg prompt config keyed by the citty arg name. */
  args: { [K in keyof A]?: TuiArgSpec };
  /** When true the command needs HARPA_TOKEN; TUI offers the auth flow first. */
  requiresToken: boolean;
}

/**
 * Result of building a single API call: the openapi-fetch thunk + the
 * human formatter. Used by both `runRequest` (CLI) and the TUI execute
 * path so the wire payload and rendering are identical.
 *
 * Note: `format` / `formatJson` take `any` so each command's inline
 * callback can dereference response fields without a redundant cast.
 * The wire payload remains strongly typed via `request` (which carries
 * the openapi-fetch return type), and the format function is only ever
 * called from this codebase — it never crosses a public surface.
 */
export interface CommandExecution<T> {
  request: () => Promise<{ data?: T; error?: unknown; response: Response }>;
  /** Render success in human mode. Return undefined to skip stdout. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format: (data: any) => string | undefined;
  /** Render success in `--json` mode. Defaults to `JSON.stringify`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatJson?: (data: any) => string;
}

export interface HarpaCommandContext<A extends ArgsDef> {
  client: ApiClient;
  env: CliEnv;
  args: ParsedArgs<A>;
}

export interface HarpaCommand<A extends ArgsDef, T = unknown> {
  cittyCommand: CommandDef<A>;
  tuiSpec: TuiSpec<A>;
  /** Build the request + formatter for the given client/args. */
  execute: (ctx: HarpaCommandContext<A>) => CommandExecution<T>;
}

export interface DefineHarpaCommandInput<A extends ArgsDef, T> {
  meta: { name: string; description: string };
  args?: A;
  tui: TuiSpec<A>;
  execute: (ctx: HarpaCommandContext<A>) => CommandExecution<T>;
}

/**
 * Build the citty command and TUI spec from one source. The citty `run`
 * hands off to `runRequest` (print + exit); the TUI calls `execute`
 * directly through `performRequest`.
 */
export function defineHarpaCommand<A extends ArgsDef, T>(
  def: DefineHarpaCommandInput<A, T>,
): HarpaCommand<A, T> {
  const cittyCommand = defineCommand<A>({
    meta: { name: def.meta.name, description: def.meta.description },
    args: def.args,
    async run({ args }) {
      const env = getEnv();
      if (def.tui.requiresToken) requireToken(env);
      const client = createApiClient(env);
      const exec = def.execute({ client, env, args });
      await runRequest({
        json: Boolean((args as Record<string, unknown>).json),
        verbose: Boolean((args as Record<string, unknown>).verbose),
        request: exec.request,
        format: exec.format,
        ...(exec.formatJson ? { formatJson: exec.formatJson } : {}),
      });
    },
  });

  return {
    cittyCommand,
    tuiSpec: def.tui,
    execute: def.execute,
  };
}

/* -------------------------------------------------------------------------- */
/*  defineTuiEntry — attach a TUI sidecar to an existing citty command.       */
/* -------------------------------------------------------------------------- */

export interface DefineTuiEntryInput<A extends ArgsDef, T> {
  cittyCommand: CommandDef<A>;
  tui: TuiSpec<A>;
  execute: (ctx: HarpaCommandContext<A>) => CommandExecution<T>;
}

/**
 * For commands whose citty wrapper exists and whose handler is reused
 * by integration tests: produce a `HarpaCommand` that points at the
 * existing citty command, supplies a `tuiSpec`, and gives the TUI its
 * own `execute` factory. The TUI call path stays decoupled from the
 * citty `run` block, so we don't disturb existing behaviour while we
 * fill in coverage incrementally.
 */
export function defineTuiEntry<A extends ArgsDef, T>(
  def: DefineTuiEntryInput<A, T>,
): HarpaCommand<A, T> {
  return {
    cittyCommand: def.cittyCommand,
    tuiSpec: def.tui,
    execute: def.execute,
  };
}
