# TUI for `@harpa/cli` (`harpa tui`)

> **Successor:** the user-facing behaviour described below — flat menu
> of every citty leaf, in-memory-only token, no startup auth gating —
> is superseded by [`arch-tui-app.md`](arch-tui-app.md) (state machine,
> persisted credentials, flows over raw leaves). The `defineHarpaCommand`
> / `defineTuiEntry` / `Prompter` / `performRequest` contracts in this
> document remain authoritative for the leaf layer.

> **Purpose:** Interactive, menu-driven shell that wraps the existing
> `@harpa/cli` commands using [`@clack/prompts`][clack]. Pick a command
> → answer prompts → see a rendered result → return to the menu.
>
> **Non-goals (explicit carve-outs):**
> - Not a replacement for the flag-driven CLI. The TUI calls the same
>   command logic; flag mode stays the supported automation surface.
> - No config file, no persisted login (mirrors `arch-cli.md`'s
>   non-goals). The TUI may keep a token **in-memory for the running
>   session** only.
> - No multi-pane UI, no full-screen takeover (clack is line-oriented).
>   If we ever want a TUI canvas, that's a separate doc.
> - No watch / streaming / live-tail features in v1.
>
> Lessons applied: [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests),
> [Pitfall 5](pitfalls.md#pitfall-5--auth-glue-done-late-env-handling-brittle),
> [Pitfall 10](pitfalls.md#pitfall-10--coverage--docs--tests-in-p5p6p7-instead-of-inline),
> [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken).

[clack]: https://github.com/bombshell-dev/clack

## 1. Problem statement

`@harpa/cli` exposes ~37 routes via citty subcommands. For exploratory
debugging — where you don't remember the exact flag names, want to see
what `--kind` accepts, or need to chain auth → list → pick id → drill
in — the flag interface is high-friction. We want a single entry point
(`harpa tui`) that renders the command tree as a menu, prompts for
arguments with sensible per-arg widgets (phone, uuid, select,
multiline), runs the same handler the citty command runs, prints the
same rendered result, and loops back to the menu.

**Acceptance contract:**

1. `harpa tui` boots, parses env via `getEnv()`, renders a top-level
   menu of command groups.
2. Selecting a leaf command opens a sequence of clack prompts derived
   from a single source of truth co-located with that command.
3. Submitting calls the **same execution function** the citty command
   calls (no re-exec of the process, no HTTP-level duplication).
4. Result renders via the same `lib/render.ts` formatters the citty
   path uses, displayed via `p.log.message` / `p.note`.
5. Errors render via `lib/error.ts` formatters and **return the user
   to the menu** — they never exit the process (except on root-level
   "Quit").
6. Ctrl-C / clack-cancel at any prompt aborts that command and returns
   to the menu. Ctrl-C twice (or selecting "Quit") exits cleanly.
7. Every interactive flow is covered by a Vitest test using a scripted
   fake prompter (see §6).
8. Help text for `harpa tui --help` ships in the help-drift snapshot
   gate alongside the other commands.

**Canonical-source files this design touches:**
- `apps/cli/src/index.ts` — mount the new `tuiCommand`.
- `apps/cli/src/commands/*.ts` — refactored to export both a citty
  command and a TUI spec from one `defineHarpaCommand()` call.
- `apps/cli/src/lib/run.ts` — split `runRequest` so the request logic
  is reusable from the TUI without `process.exit`.
- New: `apps/cli/src/tui/*` (entry, registry, prompts, session, render).

## 2. Alternatives considered

### Alt A — Re-exec the citty command

`harpa tui` collects answers, then `spawn`s the same node process with
`harpa <group> <cmd> --flag value …`. The TUI knows nothing about
execution; it only renders prompts and pipes stdio.

- **Pros:** Zero refactor of existing commands. Hard wall between TUI
  and command logic.
- **Cons:** Doubles the per-command latency (cold-start Node). Output
  capture for in-TUI rendering is awkward (we'd have to parse stdout).
  Errors can't be styled inside clack. Token captured during an
  interactive `auth otp verify` cannot be reused for the next command
  without writing to disk — violates the "no config file" non-goal.
  **Rejected.**

### Alt B — Pure citty introspection

Walk `main.subCommands` recursively, build a clack flow from each
command's `args` declaration only.

- **Pros:** No duplication; the citty spec is the single source.
- **Cons:** citty's `args` carry only `type: 'string' | 'boolean' |
  'number'` + description. We can't distinguish "uuid" from "phone"
  from "free text" → every text prompt is a bare `p.text()`. We
  also can't pre-populate a select for `--kind voice|image|document`
  without parsing the description string, which is brittle. The TUI
  fundamentally needs **richer arg metadata** than the citty surface
  exposes. **Rejected** as primary design (but its introspection
  approach informs the test in §6 — every citty command must have a
  matching TUI spec, asserted by a unit test).

### Alt C — Co-located dual definition via `defineHarpaCommand()` (chosen)

A single helper `defineHarpaCommand({ meta, args, run, tui })` returns
`{ cittyCommand, tuiSpec }`. The `args` block stays canonical for citty
(types, descriptions, help text). The `tui` block adds per-arg prompt
metadata (`kind: 'text' | 'select' | 'uuid' | 'phone' | 'multiline' |
'confirm'`, options for selects, defaults, validators, "skip if"
predicates). The `run` function is shared — citty calls it through
`runRequest`, the TUI calls a non-exiting variant.

- **Pros:** Single source per command. citty path is unchanged for
  flag users. TUI metadata lives next to the command it describes, so
  drift is local and easy to review. Validators (e.g. UUID shape) run
  identically in both surfaces. Cancellation/error semantics are
  encoded once.
- **Cons:** Small refactor of `health.ts` and a small new helper file.
  Every new command must remember to fill in `tui` (mitigated by a
  registry-completeness test in §6).
- **Chosen.**

## 3. Design

### 3.1 Layout

```
apps/cli/
  src/
    commands/
      health.ts                # exports { cittyCommand, tuiSpec }
      auth.ts                  # (future) same pattern
      ...
    lib/
      command.ts               # NEW: defineHarpaCommand() helper + types
      run.ts                   # SPLIT: performRequest() (pure) + printAndExit()
      env-runtime.ts           # unchanged
      client.ts                # unchanged
      error.ts                 # unchanged
      render.ts                # (future) shared renderers used by both paths
    tui/
      index.ts                 # tuiCommand (the citty subcommand)
      registry.ts              # collects all tuiSpecs into a menu tree
      menu.ts                  # render top-level + group menus (clack select)
      prompt.ts                # arg-kind → clack prompt mapping
      session.ts               # in-memory env override (e.g. inline token)
      execute.ts               # invokes the shared run function, renders result
      prompter.ts              # Prompter interface + clack adapter (DI seam)
    __tests__/
      tui/
        registry.test.ts       # every citty command has a tuiSpec
        prompt.test.ts         # kind → prompt mapping + validators
        menu.test.ts           # nav: enter group, back, quit
        execute.test.ts        # scripted prompter drives a real command
        help.snapshot.test.ts  # `harpa tui --help` snapshot
```

### 3.2 `defineHarpaCommand()` contract

```ts
// apps/cli/src/lib/command.ts
import { type CommandDef } from 'citty';

export type ArgPrompt =
  | { kind: 'text'; placeholder?: string; default?: string; validate?: (s: string) => string | undefined }
  | { kind: 'multiline'; placeholder?: string }
  | { kind: 'uuid'; placeholder?: string }
  | { kind: 'phone'; placeholder?: string }   // e.g. +15551234567
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

export interface TuiSpec<Args extends Record<string, unknown>> {
  /** Top-level menu group, e.g. 'auth', 'projects', 'reports'. */
  group: string;
  /** Human label in the group's submenu. */
  label: string;
  /** Short description for the menu hint. */
  hint?: string;
  /** Per-arg prompt config keyed by the citty arg name. */
  args: { [K in keyof Args]: TuiArgSpec };
  /** Run flag — when true, this command requires HARPA_TOKEN; the TUI
   *  redirects to the auth flow if the session has no token. */
  requiresToken: boolean;
}

export interface HarpaCommand<Args extends Record<string, unknown>> {
  cittyCommand: CommandDef;
  tuiSpec: TuiSpec<Args>;
}

export function defineHarpaCommand<Args extends Record<string, unknown>>(
  def: {
    meta: { name: string; description: string };
    args: CommandDef['args'];               // citty arg defs (kept verbatim)
    tui: Omit<TuiSpec<Args>, never>;        // TUI sidecar
    run: (ctx: { args: Args; json?: boolean; verbose?: boolean }) => Promise<void>;
  },
): HarpaCommand<Args>;
```

The `run` function is the **shared execution path**. The citty wrapper
adapts citty's `{ args }` shape and global `--json` / `--verbose` flags
to call it. The TUI calls it with the collected answers + `json: false,
verbose: false`.

> **Why one `run` and not two?** Anything that exits the process
> (`runRequest`'s `process.exit`) must live in the citty *adapter*, not
> in `run`. We split `lib/run.ts` so `run` calls `performRequest()`
> which returns a `RequestOutcome` — citty turns that into stdout +
> exit code, the TUI turns it into a clack message + menu return.

### 3.3 `lib/run.ts` split

```ts
export type RequestOutcome<T> =
  | { kind: 'ok'; data: T; response: Response }
  | { kind: 'apiError'; status: number; body: ErrorEnvelope | undefined; response: Response }
  | { kind: 'transport'; error: unknown }
  | { kind: 'missingToken'; error: MissingTokenError };

export async function performRequest<T>(
  request: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<RequestOutcome<T>>;

// citty adapter (current `runRequest` behaviour):
export async function runRequest<T>(opts: RunRequestOptions<T>): Promise<never>;
```

`runRequest` becomes a thin shell around `performRequest` + the
existing print/exit logic. The TUI never calls `runRequest`; it calls
`performRequest` and renders the outcome inside the clack flow.

### 3.4 TUI entry, menu, navigation

```ts
// apps/cli/src/commands/tui-command.ts (or tui/index.ts)
export const tuiCommand = defineCommand({
  meta: { name: 'tui', description: 'Interactive menu-driven shell.' },
  async run() {
    const env = getEnv();                 // fail fast (same as other cmds)
    const session = createSession(env);   // in-memory token store
    p.intro(chalk.cyan('harpa tui'));
    try {
      await mainLoop(session, defaultPrompter());
    } finally {
      p.outro('Goodbye.');
    }
  },
});
```

**Menu states:**

```
[main]
  > auth     – sign in, sign out
    me       – profile + usage
    projects – manage projects
    reports  – generate / inspect reports
    notes    – note CRUD
    files    – upload / presign / fetch URLs
    voice    – transcribe / summarise
    settings – AI provider settings
    health   – API health check
    quit
[group]
  > <command 1>
    <command 2>
    ...
    ← back
[command] (clack prompt sequence per tuiSpec.args)
  → on submit: run, render outcome, "Press enter to continue" → group
  → on cancel: return to group
```

**Cancellation rules (Pitfall 5 echo — no `setTimeout` / no
fire-and-forget):**

- Every clack prompt is `await`ed. After every await we check
  `p.isCancel(value)`. If cancelled, the current command-level
  function `return`s; control returns to the caller (group menu).
- The root `mainLoop` only exits when the user picks `quit` from the
  main menu. Ctrl-C at the *main* menu prompt is treated as `quit`.
- No `setTimeout` anywhere in `tui/`. ESLint guard already in place
  for `app/(auth)/` is extended to `apps/cli/src/tui/`.

### 3.5 Auth flow inside the TUI

If a selected command has `requiresToken: true` and the session has no
token, the TUI redirects to an inline auth flow:

```
Auth required. Sign in now?
  > Yes (OTP)
    No, cancel
[Yes]
  Phone (+15551234567): ____
  Code:                 ____
  → calls auth.otp.start.run({ phone })
  → calls auth.otp.verify.run({ phone, code, raw: true })
  → session.setToken(token)
  → returns to the original command's prompt sequence
```

The token is held in `session` only — never written to disk. When
`harpa tui` exits, the token is gone. This stays inside the "no
keychain / no config" non-goal of `arch-cli.md`.

### 3.6 Prompter interface (DI seam for tests)

`@clack/prompts` is hostile to unit testing (real TTY). We wrap it:

```ts
export interface Prompter {
  text(opts: { label: string; placeholder?: string; default?: string;
               validate?: (s: string) => string | undefined }): Promise<string | symbol>;
  select<T extends string>(opts: { label: string;
               options: ReadonlyArray<{ value: T; label: string; hint?: string }> }):
               Promise<T | symbol>;
  confirm(opts: { label: string; default?: boolean }): Promise<boolean | symbol>;
  multiline(opts: { label: string; placeholder?: string }): Promise<string | symbol>;
  note(message: string, title?: string): void;
  logError(message: string): void;
  logSuccess(message: string): void;
  isCancel(value: unknown): value is symbol;
}

export function clackPrompter(): Prompter;     // production wiring
export function scriptedPrompter(steps: PromptStep[]): Prompter;  // tests
```

The TUI takes a `Prompter` argument (`mainLoop(session, prompter)`).
Production uses `clackPrompter()`; tests use `scriptedPrompter([…])`.

**Pitfall 13 echo:** `clackPrompter()` is the *default wiring* —
covered by at least one E2E-style test in §6 (`pty` smoke test). The
scripted prompter is the negative/branch-test surface only.

### 3.7 Output rendering

The TUI never uses `--json`. Outcomes render via `lib/render.ts` (the
same human-readable formatters the citty path uses with `--json=false`)
and are passed to `p.note(text, title)`. Errors render via the same
`printError` formatter wrapped to capture into a string buffer instead
of writing to `process.stderr`, then displayed via
`prompter.logError(text)`.

API metadata (`x-request-id`, rate-limit headers) is always shown after
the command output in dim text — equivalent to the citty `--verbose`
mode, since interactive users almost always want it.

## 4. Pitfalls addressed

| Pitfall | How |
|---|---|
| [1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests) | TUI ships with unit + integration tests in the same PR; no "TUI tests later" phase. Coverage gate same as the rest of `apps/cli/src/`. |
| [5](pitfalls.md#pitfall-5--auth-glue-done-late-env-handling-brittle) | TUI auth flow uses awaited promises only; no `setTimeout`. Env via `getEnv()` — no `process.env.X!`. ESLint `no-restricted-syntax` for `setTimeout` extended to `apps/cli/src/tui/`. |
| [10](pitfalls.md#pitfall-10--coverage--docs--tests-in-p5p6p7-instead-of-inline) | Each commit in §7 ships its own tests + doc edits (this file + help snapshot). |
| [13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken) | The default `clackPrompter()` is exercised by a `node-pty` smoke test (TUI.6). Scripted prompter is for branch tests only. The TUI uses the **real** `performRequest()` against a Testcontainers Postgres + in-process Hono app — no HTTP mocking. |

## 5. Contract details

### 5.1 `tuiSpec` example (auth otp verify)

```ts
export const otpVerifyCommand = defineHarpaCommand({
  meta: { name: 'verify', description: 'Verify an OTP code.' },
  args: {
    phone: { type: 'positional', description: 'E.164 phone number', required: true },
    code:  { type: 'positional', description: '6-digit code',       required: true },
    raw:   { type: 'boolean',    description: 'Print just the token' },
  },
  tui: {
    group: 'auth',
    label: 'Verify OTP',
    hint: 'Confirm a one-time passcode and sign in',
    requiresToken: false,
    args: {
      phone: { label: 'Phone', required: true,
               prompt: { kind: 'phone', placeholder: '+15551234567' } },
      code:  { label: 'Code',  required: true,
               prompt: { kind: 'text', validate: (s) => /^\d{6}$/.test(s) ? undefined : 'must be 6 digits' } },
      raw:   { label: 'Print raw token?', required: false,
               prompt: { kind: 'confirm', default: false },
               skipWhen: () => true /* hidden in TUI; always false */ },
    },
  },
  async run({ args }) { /* shared with citty */ },
});
```

### 5.2 Menu copy / layout (frozen for snapshot test)

```
harpa tui
─────────────────
◇  Select an action

│  ● auth      Sign in or out
│  ○ me        Your profile and usage
│  ○ projects  Manage projects
│  ○ reports   Inspect and generate reports
│  ○ notes     Note CRUD
│  ○ files     Upload / presign / fetch
│  ○ voice     Transcribe and summarise
│  ○ settings  AI provider settings
│  ○ health    API health check
│  ○ quit
```

Verbatim text is asserted by `help.snapshot.test.ts` and
`menu.test.ts`.

### 5.3 Registry-completeness test (Pitfall 13-shaped)

`registry.test.ts` walks the citty command tree mounted under `main`
and asserts that every leaf command has a matching `tuiSpec`. New
commands without `tui:` fail the test in the same PR that adds them.

```ts
it('every CLI command has a TUI entry', () => {
  const cittyLeaves = walkCommands(main);          // ['auth otp start', ...]
  const tuiLeaves   = walkTui(registry);
  expect(new Set(tuiLeaves)).toEqual(new Set(cittyLeaves));
});
```

## 6. Testing strategy

| Layer | Tool | What it asserts |
|---|---|---|
| Unit | Vitest | `defineHarpaCommand` shape, `performRequest` outcomes, prompt mapping (`ArgPrompt` → expected clack call), session token store, validators (UUID/phone/number). |
| Registry | Vitest | citty tree ⊆ TUI registry (and vice versa). No stubs — uses the real exported `main` command. |
| Behaviour | Vitest + `scriptedPrompter` | Drives an end-to-end menu flow (e.g. "main → health → submit → outcome rendered → press enter → main → quit") against a Testcontainers-backed Hono app via `app.fetch`. Asserts: prompts shown in order, payload rendered, returned to menu, exit code 0. **No HTTP mocking.** |
| Default wiring | Vitest + `node-pty` | One smoke test (TUI.6) spawns `node dist/index.js tui`, scripts a happy-path interaction, asserts terminal output. This is the only test exercising `clackPrompter()` as the default — Pitfall 13 defence. |
| Help drift | Vitest snapshot | `harpa tui --help` text. |

**Fixture mode:** behaviour tests inherit `AI_FIXTURE_MODE=replay` and
`R2_FIXTURE_MODE=replay` from the existing `packages/api` setup. No
real LLM / R2 / Twilio in CI.

**Coverage gate:** TUI files (`apps/cli/src/tui/**`) sit under the same
`≥ 80% lines` gate already proposed for the CLI in `arch-cli.md`.

## 7. Implementation checklist (one commit each)

> **Status (TUI.0 – TUI.7 shipped on `feat/tui`).** All eight steps
> below are landed. The follow-on commit
> `feat(cli): register every CLI leaf in the TUI menu` adds
> `tui/entries.ts` so every remaining citty leaf (`auth`, `me`,
> `projects`, `reports`, `notes`, `files`, `voice`, `settings`) is
> exposed in the TUI via `defineTuiEntry()` — a sidecar variant of
> `defineHarpaCommand()` that attaches a `tuiSpec` to an existing
> citty command without rewriting its `run` block. Only
> `files upload` stays opted out (multi-step presign → PUT → register).

1. **TUI.0 — Refactor `lib/run.ts` into `performRequest` + adapter.**
   Behaviour-preserving split. Existing `health` integration test
   stays green; add a `performRequest.test.ts` that asserts each
   outcome variant against the in-process app.
   `refactor(cli): split runRequest into pure performRequest + exit adapter`

2. **TUI.1 — `defineHarpaCommand()` helper + migrate `health`.**
   Adds `lib/command.ts`. Re-exports unchanged `healthCommand` via
   the helper. Unit test for the helper.
   `refactor(cli): introduce defineHarpaCommand and migrate health`

3. **TUI.2 — Prompter interface + clack adapter + scripted fake.**
   Adds `tui/prompter.ts` and unit tests for the scripted prompter.
   No menu yet.
   `feat(cli): add Prompter abstraction with clack and scripted impls`

4. **TUI.3 — Registry + main/group menus.**
   Adds `tui/registry.ts`, `tui/menu.ts`, `tui/session.ts`. Mounts
   `harpa tui` in `src/index.ts`. Tests cover navigation
   (main→group→back→quit) using the scripted prompter; no commands
   executable yet (only `health` registered).
   `feat(cli): add 'harpa tui' menu navigation with health entry`

5. **TUI.4 — Prompt mapping + execute path.**
   Adds `tui/prompt.ts` and `tui/execute.ts`. End-to-end behaviour
   test: scripted prompter drives `main → health → submit`, asserts
   rendered API response and return to menu.
   `feat(cli): wire TUI prompt mapping and execution for health command`

6. **TUI.5 — Registry-completeness test + help snapshot.**
   Adds `registry.test.ts` and `help.snapshot.test.ts`. Updates
   `scripts/check-cli-help-drift.sh` to include `harpa tui --help`.
   `test(cli): registry-completeness and help-drift snapshot for tui`

7. **TUI.6 — `node-pty` default-wiring smoke test.**
   Adds one PTY-driven test that spawns the built bin, scripts a
   happy-path interaction (main → health → submit → quit), asserts
   stdout contains the rendered response. Adds `node-pty` as a dev
   dependency. CI job updated.
   `test(cli): pty smoke test for default clack prompter wiring`

8. **TUI.7 — Docs polish + cross-links.**
   Cross-links `docs/v4/architecture.md` index → this doc, adds
   "TUI quickstart" subsection to `arch-cli.md`, and notes the
   `harpa tui` entry in root `README.md`. (Only needed if not already
   touched in TUI.4.)
   `docs(cli): cross-link arch-tui and add quickstart`

Subsequent command groups (`auth`, `me`, `projects`, …) land in the
same commit as their citty counterpart per `arch-cli.md` (CLI.2–CLI.11);
each must ship its `tuiSpec` and one TUI behaviour test in the same
PR. The registry-completeness test (TUI.5) is the gate.

## 8. Open questions / carve-outs

1. **Persisted session between `harpa tui` runs?** No — explicit
   non-goal here, matches `arch-cli.md`'s "no config file" rule.
   Revisit if we add a `~/.harparc` per a separate ADR. *Carve-out
   tracked here, not in a plan doc.*
2. **Stdin piping into TUI prompts?** No. The TUI is interactive-only;
   automation uses flag mode.
3. **Multi-step "workflows" (e.g. create project → create report →
   add note in one menu)?** Not in v1. The menu is one command per
   selection. If demand surfaces, add a `workflows/` submenu in a
   follow-up doc.
4. **`harpa tui --resume`** (replay last command with same args)?
   Out of scope. The session keeps state in memory only.
5. **Theming / colour customisation?** Use clack defaults; chalk
   already used by `lib/render.ts`. No theming knobs in v1.

[arch-cli]: arch-cli.md
[pitfalls]: pitfalls.md
