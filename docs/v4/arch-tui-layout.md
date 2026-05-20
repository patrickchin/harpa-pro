# TUI v4 — split-pane rendering layer (OpenTUI + Solid, on Bun)

> **⚠️ Layout / information-hierarchy superseded by
> [`arch-tui-layout-v2.md`](arch-tui-layout-v2.md).** The OpenTUI +
> Solid stack, `Prompter` contract, `UiStore`, and Bun entry-point
> described below are still authoritative. The visual layout
> (status bar, viewport title, "action" panel title, log tail) and
> the per-screen viewport templates have been redesigned — read
> v2 first for any new layout work.
>
> **Status:** design, not yet implemented. Successor to the *rendering
> and prompt* half of [`arch-tui-app.md`](arch-tui-app.md) and
> [`arch-tui-nav.md`](arch-tui-nav.md). Replaces every line-oriented
> `@clack/prompts` call (`select`, `text`, `confirm`, `note`,
> `intro`/`outro`, log helpers) with a static two-pane OpenTUI surface
> rendered by `@opentui/solid`.
>
> **What is *not* changing.** The screen hierarchy, the `currentProject`
> / `currentReport` context, prefill semantics, `defineHarpaCommand`,
> the shared `execute()` factory, `performRequest`, the credentials
> store, sign-in/out, env handling, `Developer › Raw API`, and the
> registry / leaf model are all preserved verbatim. Read
> [`arch-tui-nav.md`](arch-tui-nav.md) for the screen tree and
> [`arch-tui-app.md`](arch-tui-app.md) for the state machine — those
> docs remain authoritative for everything above the rendering seam.
>
> **Read first:** [`pitfalls.md`](pitfalls.md) (Pitfalls 5, 10, 13),
> [`arch-tui-app.md`](arch-tui-app.md), [`arch-tui-nav.md`](arch-tui-nav.md),
> [`arch-cli.md`](arch-cli.md), and the implementation under
> `apps/cli/src/tui/`.

[opentui]: https://opentui.com/docs/getting-started
[opentui-gh]: https://github.com/sst/opentui
[arch-tui-app]: arch-tui-app.md
[arch-tui-nav]: arch-tui-nav.md
[arch-cli]: arch-cli.md
[pitfalls]: pitfalls.md

---

## 1. Problem statement

The shipped TUI is a stack of `@clack/prompts` calls. That gave us a
testable state machine and a working screen hierarchy, but the UX is
fundamentally line-oriented: every screen render is a fresh `intro` →
`note` → `select` block that scrolls the terminal, and the user has no
persistent view of "where am I" beyond the last `note(...)` block
clack drew. The information we *do* fetch (`currentProject`,
`currentReport`, header counts) disappears off-screen the moment the
user picks an action that itself prints output.

We want a real two-pane TUI: a static **viewport pane** on the left
that always shows the current screen's state (the resource header,
the list under it, sign-in status, the rendered output of the last
action), and an **interaction pane** on the right that holds the
action menu, prompts, and inline status. Both visible at all times.
Both repaint without scrolling. Resize-aware. Keyboard-driven.

The decisions in the brief are taken as given: **OpenTUI** with the
**Solid binding**, **Bun** runtime, static split-pane layout,
screen-based navigation preserved.

**Acceptance contract for v4 layout:**

1. `harpa tui` launches under `bun` (not `node`/`tsx`), boots OpenTUI's
   Solid renderer, paints a two-pane root, and never scrolls the
   terminal once mounted (the UI is full-screen, alt-screen-buffer).
2. **Left pane (viewport)** shows the current screen's `header` plus a
   scrollable body containing the screen-specific content (list of
   projects, list of reports, note bodies, the rendered result of the
   last action). It is read-only — no input lands there. It tracks
   `Session` state reactively: when `currentProject` / `currentReport`
   changes, the viewport updates without a re-mount.
3. **Right pane (interaction)** hosts exactly one of: an action-menu
   list, a single-field prompt, a multi-field form, a confirm dialog,
   or an in-flight spinner. Only one is active at a time, and only the
   right pane can receive keyboard focus.
4. **Status bar** along the bottom shows: API URL, signed-in user (or
   "not signed in"), breadcrumb of the screen stack (`Projects → P12 →
   Reports → #4`), and the current keymap hint (`↑/↓ select · ↵ open ·
   esc back · ? help · q quit`).
5. **Navigation parity.** Every screen and every action defined under
   `arch-tui-nav.md` is reachable. Prefill works identically. `← back`,
   `Refresh`, `Quit`, Ctrl-C semantics all match v3.
6. **Prompter contract preserved.** The existing `Prompter` interface
   (`text`, `multiline`, `filePath`, `select`, `confirm`, `note`, `log`,
   `intro`, `outro`, `isCancel`) keeps its shape so the entire existing
   scripted-prompter test suite continues to drive the TUI logic
   unchanged. We swap the *implementation* (clack → OpenTUI/Solid
   adapter); the *signature* and the cancel-token semantics are the
   contract.
7. **Default wiring is exercised.** The OpenTUI prompter is covered by
   at least one pty smoke test that drives a full sign-in → open
   project → open report → add note flow against the live in-process
   API (Pitfall 13). Scripted-prompter unit tests cover screen logic.
8. `harpa tui --help` snapshot still passes the help-drift gate.
9. Bun runtime is **scoped to `apps/cli` only**. The rest of the repo
   (`apps/mobile`, `packages/api`, `packages/api-contract`,
   `packages/ai-fixtures`, `apps/marketing`, `apps/docs`) keeps pnpm +
   Node. CI for those packages does not change.

**Canonical-source files this design touches:**

- `apps/cli/package.json` — add Bun-specific bin (`bun ./dist/index.js`
  or `bun ./src/index.ts`), add `@opentui/core`, `@opentui/solid`,
  `solid-js` deps. Replace `@clack/prompts` runtime dependency (kept
  only as a transitional dev-dep until v4 lands fully).
- `apps/cli/src/index.ts` — shebang and binary entry are unchanged at
  the surface (still `harpa tui`), but the bin script is now Bun.
- `apps/cli/src/tui/prompter.ts` — keep the `Prompter` *interface* and
  `scriptedPrompter` verbatim. Replace `clackPrompter()` with
  `opentuiPrompter()` backed by the Solid renderer. The clack module
  is removed from the runtime path.
- New: `apps/cli/src/tui/ui/` — Solid components for the root layout
  (`AppRoot`, `ViewportPane`, `InteractionPane`, `StatusBar`), the
  prompt widgets (`SelectList`, `TextInput`, `Multiline`, `Confirm`,
  `Spinner`, `LogStream`), and the per-screen viewport bodies (project
  list, report list, note list, etc.).
- New: `apps/cli/src/tui/ui/store.ts` — Solid signals + stores wrapping
  `Session` so the viewport pane reacts to state mutations without
  imperative repaint calls.
- `apps/cli/src/tui/screen.ts` — `Screen.header()` shape extended (see
  §3.4) so a screen can also contribute viewport *body* content, not
  just title + lines. Backwards-compatible: existing screens that
  return only `HeaderInfo` render a header-only viewport.
- `apps/cli/src/tui/app.ts` — `runApp` keeps its signature; under the
  hood it mounts the Solid root once and pumps state transitions
  through Solid signals instead of re-entering a `for(;;)` over
  `prompter.select`.
- `.github/workflows/*` — CLI jobs gain a `oven-sh/setup-bun@v2` step;
  Node steps for non-CLI packages are unchanged. See §6.

---

## 2. Alternatives considered

The "rendering library = OpenTUI/Solid" and "runtime = Bun" decisions
are taken as given by the brief, so this section enumerates the
alternatives that are *still open* under those constraints.

### Alt A — Replace the `Prompter` interface with a Solid-native API

Drop the `text`/`select`/`confirm` method bag entirely; expose Solid
signals (`menu`, `currentPrompt`, `submit`) and let screens write to
them directly. Tests would assert against the signal graph.

- **Pros:** More idiomatic Solid. No "imperative wrapper around a
  reactive renderer" impedance mismatch. Direct mapping from
  state-of-the-world to pixels.
- **Cons:** Throws away the entire existing test suite — every
  scripted-prompter test in `apps/cli/src/__tests__/tui/**` is built
  around the imperative `text`/`select`/`confirm` API. Maps directly
  onto Pitfall 10: a "test phase later" debt of rewriting ~all TUI
  tests in the same PR that swaps the renderer. Also makes the migration
  un-incremental — we can't ship the renderer swap without
  simultaneously rewriting every screen/flow to a different reactive
  shape. **Rejected.**

### Alt B — Headless prompter + Solid view layer, fed from a queue (chosen)

Keep the `Prompter` interface verbatim. Implement `opentuiPrompter()`
as a thin async-imperative façade that, on each `text`/`select`/etc.
call, pushes a `PromptRequest` onto a Solid store, awaits a Solid
signal for the resolution, and returns the answer. The viewport pane
subscribes to a separate `ViewportStore` populated by the screen
driver. The two stores plus a `StatusStore` are the entire reactive
surface; everything above stays untouched.

- **Pros:** Existing screens, flows, scripted prompter, tests all keep
  working unchanged. The renderer swap is a pure substitution behind a
  stable seam. The viewport pane is fed by the *same* `Session` + the
  *same* `Screen.header()` / new `Screen.body()` data the existing
  driver already computes — we just give it a reactive home instead of
  re-rendering as text per loop. Migrates the codebase one screen at a
  time if needed (the viewport-body extension is opt-in).
- **Cons:** A small impedance mismatch — Solid is reactive, our screen
  driver is a `for(;;)` loop awaiting prompts. We bridge by treating
  the screen driver as a long-lived async task that *commands* the UI
  via the stores, and treating user keystrokes as Solid signals that
  *resolve* the awaited prompts. This is well-trodden territory
  (opencode does the same).
- **Chosen.**

### Alt C — Side-by-side launch (`harpa tui` clack, `harpa tui-x` OpenTUI)

Ship both surfaces for one release, gate the new one behind a flag.

- **Pros:** Minimises blast radius if OpenTUI/Bun bites us.
- **Cons:** Doubles the surface we own forever (we'd need to delete
  it eventually anyway, and Pitfall 10 says "no later phases"). Doubles
  the test matrix. Bun-only `tui-x` plus Node `tui` means two CI
  toolchains for `apps/cli` instead of one. The decision has already
  been taken to commit to OpenTUI/Bun — a feature flag is just
  rebranded indecision. **Rejected.**

### Alt D — Bun for the whole monorepo

Migrate `apps/mobile`, `packages/api`, `packages/api-contract`, etc.
off pnpm + Node onto Bun while we're already touching `apps/cli`.

- **Pros:** One toolchain everywhere.
- **Cons:** Out of scope for this design. Expo / Metro / EAS expect
  Node + pnpm; the API runs on Fly via a Node base image and is
  Testcontainers-driven (Bun in Testcontainers is fine but unproven
  in our setup). The brief explicitly limits Bun to `apps/cli`.
  **Rejected.**

---

## 3. Design

### 3.1 Layout

```
apps/cli/
  src/
    index.ts                         # bin entry (unchanged surface; runs under bun)
    commands/…                       # citty leaves, unchanged
    lib/…                            # env, run, client, command, error, render — unchanged
    tui/
      index.ts                       # boots Solid root, calls runApp — surface unchanged
      app.ts                         # runApp (now drives stores, not a for-loop on selects)
      state.ts                       # bootState — unchanged
      session.ts                     # Session + AppState — unchanged
      credentials.ts                 # unchanged
      registry.ts / registry-find.ts # unchanged
      flow.ts                        # Flow shape — unchanged
      flows/*.ts                     # unchanged
      screen.ts                      # Screen interface extended: header + optional body()
      screens/*.ts                   # existing screens unchanged; opt-in body() per screen
      execute.ts                     # unchanged (writes outcome to ViewportStore via prompter)
      prompt.ts                      # collectArgs — unchanged
      prompter.ts                    # Prompter interface unchanged
                                     #   - clackPrompter()    [REMOVED]
                                     #   - opentuiPrompter()  [NEW]
                                     #   - scriptedPrompter() [unchanged]
      ui/
        AppRoot.tsx                  # <box flexDirection="row"> root with both panes
        ViewportPane.tsx             # left: header + body + recent log
        InteractionPane.tsx          # right: switches on currentPrompt kind
        StatusBar.tsx                # bottom: api url, user, breadcrumb, keymap
        widgets/
          SelectList.tsx             # ↑/↓ + ↵, hint column, scroll on overflow
          TextField.tsx              # single-line text with validate hook
          MultilineField.tsx         # multi-line with ↵ to submit, alt-↵ for newline
          FilePathField.tsx          # text + ~ expansion + existence hint
          ConfirmDialog.tsx          # y/n with default
          Spinner.tsx                # in-flight indicator
          LogStream.tsx              # log lines in viewport, capped at N
        store.ts                     # createUiStore() — see §3.3
        keymap.ts                    # global key bindings (esc=back, q=quit, ?=help)
        theme.ts                     # color tokens (chalk-equivalent via OpenTUI)
    __tests__/
      tui/
        prompter-opentui.test.ts     # NEW: unit tests for opentuiPrompter against UiStore
        ui/store.test.ts             # NEW: store transitions
        ui/widgets/*.test.tsx        # NEW: per-widget keystroke → submit
        smoke/pty-flow.test.ts       # NEW: pty smoke test, drives a real flow under bun
        screens/…                    # existing scripted-prompter tests, unchanged
```

The non-`tui/ui/` directories are touched only at the seams (renamed
methods? no — same signatures). The bulk of the new code is in
`tui/ui/`.

### 3.2 Two-pane visual layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ViewportPane (flex 2)                  │ InteractionPane (flex 1)       │
│                                        │                                │
│  ┌──────────────────────────────────┐  │  Action                        │
│  │  Project: Acme HQ Build (acme)  │  │   ▸ Add text note              │
│  │  Acme Ltd · 123 Main St          │  │     Upload media               │
│  │  3 members · 12 reports          │  │     View notes                 │
│  └──────────────────────────────────┘  │     Generate report            │
│                                        │     Finalize                   │
│  Reports                               │     Edit metadata              │
│  #12 (final)  2024-05-04  4 notes      │     Delete report              │
│  #11 (draft)  2024-05-03  2 notes      │     Refresh                    │
│  #10 (draft)  2024-05-02  0 notes      │     ← back                     │
│  …                                     │                                │
│                                        │                                │
│  ── log ──                             │                                │
│  ✓ Created note nt_01HX… in #11        │                                │
│  ✓ Report #11 generated                │                                │
│                                        │                                │
├─────────────────────────────────────────────────────────────────────────┤
│ acme/12 · alice@harpa.dev · https://api.harpapro.com                    │
│ ↑/↓ select · ↵ open · esc back · ? help · q quit                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Sizing rules:

- `ViewportPane` flex `2`, `InteractionPane` flex `1`, with a minimum
  of 40 cols and 24 rows total. On terminals smaller than `80 × 24`
  the layout collapses to a single pane (interaction only) and the
  status bar shows a "viewport hidden — resize to ≥ 80 cols" hint.
- The viewport's body region is scrollable (PgUp/PgDn while interaction
  has focus, mediated by the keymap — focus stays in the right pane).
- A short log tail (default 5 lines) sits at the bottom of the viewport
  for `prompter.log.*` and `prompter.note()` output. Full output is
  available via `?` → "Show log".
- Status bar is exactly two rows: line 1 dynamic context (api url,
  user, breadcrumb), line 2 keymap hint.

OpenTUI's flexbox + `<box>`/`<text>` primitives express this directly;
no custom layout engine.

### 3.3 The UI store — `createUiStore()`

```ts
// apps/cli/src/tui/ui/store.ts
import { createStore } from 'solid-js/store';
import { createSignal } from 'solid-js';

export type PromptRequest =
  | { kind: 'select'; label: string; options: ReadonlyArray<{ value: string; label: string; hint?: string }>; initial?: string }
  | { kind: 'text'; label: string; placeholder?: string; default?: string; validate?: (s: string) => string | undefined }
  | { kind: 'multiline'; label: string; placeholder?: string }
  | { kind: 'filePath'; label: string; placeholder?: string; validate?: (s: string) => string | undefined }
  | { kind: 'confirm'; label: string; default?: boolean };

export type PromptResolution =
  | { kind: 'text';     value: string }
  | { kind: 'select';   value: string }
  | { kind: 'confirm';  value: boolean }
  | { kind: 'cancel' };

export interface ViewportState {
  readonly title: string;
  readonly headerLines: ReadonlyArray<string>;
  readonly body?: ViewportBody;            // §3.4
  readonly logTail: ReadonlyArray<LogEntry>;
}

export interface StatusState {
  readonly apiUrl: string;
  readonly user?: string;
  readonly breadcrumb: ReadonlyArray<string>;
  readonly keymapHint: string;
}

export interface UiStore {
  viewport: ViewportState;
  status: StatusState;
  currentPrompt?: PromptRequest;
  inFlight?: { label: string };
  /** Resolves the awaited prompter call; cleared by the prompter façade. */
  resolve(r: PromptResolution): void;
  /** Pushes a log entry (capped to N). */
  log(entry: LogEntry): void;
  /** Replaces the viewport snapshot. */
  setViewport(v: Partial<ViewportState>): void;
  setStatus(s: Partial<StatusState>): void;
  setInFlight(v: { label: string } | undefined): void;
  setPrompt(p: PromptRequest | undefined): void;
}
```

The OpenTUI prompter:

```ts
export function opentuiPrompter(ui: UiStore): Prompter {
  const ask = <T>(req: PromptRequest, toResult: (r: PromptResolution) => T | Cancel) =>
    new Promise<T | Cancel>((resolve) => {
      ui.setPrompt(req);
      const off = onResolve((r) => {
        ui.setPrompt(undefined);
        off();
        resolve(toResult(r));
      });
    });

  return {
    text: (o) => ask({ kind: 'text', ...o, label: o.label }, (r) =>
      r.kind === 'cancel' ? CANCEL : (r as any).value),
    select: (o) => ask({ kind: 'select', ...o }, (r) =>
      r.kind === 'cancel' ? CANCEL : (r as any).value),
    // …confirm, multiline, filePath similarly
    note: (msg, title) => ui.log({ kind: 'note', title, message: msg }),
    log: {
      info:    (m) => ui.log({ kind: 'info',    message: m }),
      success: (m) => ui.log({ kind: 'success', message: m }),
      warn:    (m) => ui.log({ kind: 'warn',    message: m }),
      error:   (m) => ui.log({ kind: 'error',   message: m }),
    },
    intro: () => { /* no-op — replaced by static StatusBar */ },
    outro: () => { /* no-op — final teardown handled by index.ts */ },
    isCancel: (v): v is Cancel => v === CANCEL,
  };
}
```

Key properties:

- **Sequential by construction.** The screen driver awaits one
  `prompter.x()` at a time, exactly like today. The store only ever
  holds zero or one `currentPrompt`. The widget mounted in
  `InteractionPane` is fully determined by `currentPrompt.kind`.
- **No setTimeout, no fire-and-forget.** Resolution is the
  user-pressing-↵ keystroke handler calling `ui.resolve()`. Cancel is
  the keystroke handler for `Esc` or Ctrl-C, calling
  `ui.resolve({ kind: 'cancel' })`. (Pitfall 5.)
- **Tests don't see this.** `scriptedPrompter` does not go through the
  store; it implements `Prompter` directly. The store + opentui adapter
  is a *production*-wiring concern, covered separately by `ui/widgets/*`
  unit tests and the pty smoke test.

### 3.4 Screen ↔ viewport contract

`Screen` already has `header(ctx): HeaderInfo | undefined`. We extend
it with an optional `body(ctx): ViewportBody | undefined`:

```ts
// apps/cli/src/tui/screen.ts (extended; back-compatible)

export type ViewportBody =
  | { kind: 'list';     items: ReadonlyArray<ViewportListItem> }
  | { kind: 'detail';   sections: ReadonlyArray<{ title?: string; lines: ReadonlyArray<string> }> }
  | { kind: 'result';   content: string }      // raw text from a leaf render
  | { kind: 'empty';    hint?: string };

export interface ViewportListItem {
  readonly label: string;
  readonly hint?: string;
  /** Whether this item maps to an action in `actions()` — purely
   *  informational; selection still happens in the interaction pane. */
  readonly mirrorsAction?: string;
}

export interface Screen {
  readonly id: string;
  header(ctx: ScreenContext): Promise<HeaderInfo | undefined>;
  body?(ctx: ScreenContext): Promise<ViewportBody | undefined>;   // NEW, optional
  actions(ctx: ScreenContext): ReadonlyArray<ScreenAction>;
  backLabel?: string;
  onExit?(ctx: ScreenContext): void;
}
```

The `runScreen` driver (under §3.5) calls both `header()` and `body()`
on entry and after any `refreshHeader`-flagged action. Both are
written into the `UiStore.viewport` snapshot in a single update so the
Solid view repaints once per refresh.

Migration policy: existing screens (Projects, Project Home, Reports
List, Report Home, Notes List, Notes Action, Upload, Members) gain a
`body()` implementation **in the same PR that ports them onto v4**;
none of them silently render header-only after the migration. Adding a
new screen without `body()` is allowed (it's typed optional), but
review should ask for one if the screen has a list or detail to show.

The result of a leaf execution (rendered by `lib/render.ts`) is
written to the viewport via `ui.setViewport({ body: { kind: 'result',
content } })` from `execute.ts`, so the user sees the last action's
output above the action menu without it scrolling away. The next
header refresh restores the resource header in its place.

### 3.5 Driver changes — `runApp` and `runScreen` under Solid

`runApp` and `runScreen` keep their signatures and bodies almost
verbatim. The only changes:

1. Before the top-level `for(;;)` they push the current
   `session.state` summary into `UiStore.status` (and re-push it after
   every flow returns). `stateLabel(session)` becomes a status-bar
   formatter rather than a `prompter.select` label.
2. `runScreen` calls both `header()` and `body()` and writes the result
   into `UiStore.viewport` before its `prompter.select(...)` call (the
   action picker). It also pushes a breadcrumb entry on entry and pops
   it on exit, so the StatusBar always shows the live screen stack.
3. `execute.ts`'s success branch — currently `prompter.note(rendered,
   title)` — instead does `ui.setViewport({ body: { kind: 'result',
   content: rendered } })` plus a one-line success log entry.

Cancellation semantics are preserved: the interaction pane's
`Esc`/Ctrl-C handler calls `ui.resolve({ kind: 'cancel' })`, the
prompter façade returns `CANCEL`, the existing screen logic interprets
it as "back" exactly as today.

### 3.6 Keymap

| Key | Context | Action |
|-----|---------|--------|
| ↑ / ↓ | SelectList | Move cursor |
| ↵ | SelectList / TextField / Confirm | Submit |
| Esc | any prompt | Cancel current prompt → screen treats as `← back` |
| Ctrl-C | top-level menu | Quit |
| Ctrl-C | inside screen action | Cancel → return to that screen's menu |
| Ctrl-C | inside leaf's own prompt | Cancel the leaf only (existing semantics) |
| PgUp / PgDn | always | Scroll viewport body |
| ? | always | Toggle help overlay |
| q | top-level menu | Quit (alias for Ctrl-C at root) |
| Alt-↵ | Multiline | Insert newline |

`?` opens a transient overlay listing every binding for the current
context. The overlay is itself a Solid component; it doesn't go
through the prompter.

### 3.7 Bun migration scope (recap)

| Surface | Before | After | Why |
|---------|--------|-------|-----|
| `apps/cli` runtime | Node ≥ 20 via `tsx` (dev) / built `dist` (prod) | **Bun ≥ 1.1** for both | OpenTUI requires Bun today |
| `apps/cli/package.json` `engines` | `node` | `bun` only (and remove `tsx`) | Single runtime |
| `apps/cli` bin | `node ./dist/index.js` | `bun ./src/index.ts` (no precompile in dev), `bun build --compile` for distributable single-file binary | Bun's TS support eliminates the `tsc` build step in dev |
| `apps/cli` install | `pnpm install` at repo root (hoisted) | **still `pnpm install`** at repo root (Bun reads `node_modules`) — no Bun lockfile in the repo | Avoids dual-lockfile drift; `pnpm` remains workspace authority |
| `apps/cli` test runner | `vitest` | **`vitest`** (Vitest runs under Bun via `bun --bun vitest`) — fallback: keep Node for tests if Bun-Vitest interop bites us; integration smoke test is the only test that *must* run under bun-pty | Minimise test churn |
| `apps/cli` integration test (pty) | `node-pty` under Node | `node-pty` under **Bun** (verified to work; opencode does this) | Same |
| Other workspaces | pnpm + Node | **unchanged** | Out of scope |
| CI: `cli` job(s) | Node setup | `oven-sh/setup-bun@v2` + `pnpm install` + `bun --bun vitest run` | One extra step |
| CI: other jobs | Node setup | **unchanged** | Out of scope |

Hard rules:

- No Bun-isms leak into shared packages. `packages/api-contract` and
  `packages/ai-fixtures` consumed by `apps/cli` remain pure ESM that
  Node + Bun both run. Lint rule (`no-restricted-imports`) blocks
  `bun:*` imports outside `apps/cli/src/tui/ui/`.
- The pnpm workspace remains the source of truth for dependency
  resolution. No `bun.lockb` checked in.
- `node-linker=hoisted` is preserved (Expo dependency); Bun reads that
  layout fine.

### 3.8 Distribution

Two artifacts:

1. **Dev / monorepo use.** `bun ./apps/cli/src/index.ts tui` —
   no build, fast feedback.
2. **End-user binary.** `bun build --compile --minify
   apps/cli/src/index.ts --outfile harpa` produces a single-file
   self-contained executable per platform. CI publishes this for
   `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64` on tag.
   The previous `npm install -g @harpa/cli` path (which assumed Node)
   is deprecated; the README is updated accordingly.

The `harpa` flag CLI surface (everything *not* `tui`) keeps the same
behaviour — it's all just Bun executing the same citty entry. No
behavioural change for the non-TUI subcommands.

---

## 4. Test plan

| Layer | Test | Replaces / adds |
|-------|------|-----------------|
| `Prompter` interface | All existing `scriptedPrompter` tests for screens, flows, execute, prompt | **Unchanged** (the contract is the contract) |
| `opentuiPrompter` ↔ `UiStore` | `prompter-opentui.test.ts`: drives the façade with manual `ui.resolve()` calls, asserts `text/select/confirm/cancel` round-trip and that `setPrompt(undefined)` is called after every resolution | New |
| `UiStore` reducer | `ui/store.test.ts`: viewport/status/log transitions, log tail capped at N, prompt-set-and-clear invariants | New |
| Widget keystrokes | `ui/widgets/*.test.tsx`: render with OpenTUI's test renderer, dispatch keystrokes, assert resolve calls | New |
| Screen ↔ viewport | One screen test per screen asserting `body()` shape (typed snapshot, not pixel) — e.g. project home returns `{ kind: 'detail', sections: [...] }` with the right header line count | New (small) |
| Pty smoke | `smoke/pty-flow.test.ts`: spawns `bun apps/cli/src/index.ts tui` under `node-pty` against the live in-process API; drives sign-in → projects → open → reports → open → add text note; asserts the persisted note in the DB and the rendered viewport line. Runs in CI. | New — this is the Pitfall 13 default-wiring proof |
| Help drift | `harpa tui --help` snapshot | Unchanged |

Coverage gate for `apps/cli/src/tui/ui/` is the same as the rest of
`apps/cli` (≥ 90% line). The pty smoke test counts toward the
default-wiring rule for `opentuiPrompter()` (Pitfall 13).

---

## 5. Pitfalls addressed

- **Pitfall 5 (auth glue / env handling).** No `setTimeout` in the new
  UI. Prompts resolve synchronously off keystroke events; sign-in
  remains the existing `await verifyOtp; await fetchProfile` chain.
  Env handling (`parseEnvLoose`) is unchanged.
- **Pitfall 10 (no test/docs/cleanup later).** The renderer swap ships
  with: (a) this design doc, (b) the new widget + store tests, (c) the
  pty smoke test, (d) the removed `@clack/prompts` dependency, (e) the
  updated CI workflow, (f) README install instructions, all in the
  same phase plan (see §6). There is no "OpenTUI polish phase".
- **Pitfall 13 (DI stub becomes the spec).** The pty smoke test
  exercises `opentuiPrompter()` end-to-end against the live API with
  no DI substitution — the production wiring is the thing under test.
  `scriptedPrompter` is reserved for negative-path / branch coverage
  in screens.
- **Pitfall 14 (CLI / contract drift).** Unaffected by this change —
  contract regeneration and `pnpm --filter @harpa/cli build` (now `bun
  build`) still run in CI on any API-route diff.

---

## 6. Phased implementation plan

Each item ≈ one commit. Order matters (later items depend on earlier
ones). All commits land in `apps/cli` and `docs/v4/` only, except
where noted.

**Phase L0 — design land (this PR).**

1. `docs(tui): land arch-tui-layout.md, banner arch-tui-nav.md` —
   this document, plus the forward-reference banner on
   `arch-tui-nav.md`, plus a row in `architecture.md`'s section index.

**Phase L1 — Bun toolchain in apps/cli (no UI change yet).**

2. `chore(cli): adopt Bun runtime for apps/cli` — update
   `apps/cli/package.json` (`engines`, scripts: `dev`, `build`, `test`,
   `start`), update root README's CLI install section, add
   `bunfig.toml` if needed. CI: add `oven-sh/setup-bun@v2` to the cli
   job; verify existing flag CLI + clack TUI still work under Bun (no
   functional change). Keep clack as a runtime dep for this commit.
3. `ci(cli): build single-file binary via bun build --compile` — add a
   release workflow that produces `harpa` binaries for the four
   target platforms on tag; documents the new install path.

**Phase L2 — OpenTUI scaffolding under the prompter seam.**

4. `feat(cli): add @opentui/core + @opentui/solid + solid-js deps` —
   `pnpm --filter @harpa/cli add` the three deps. Verify build green.
5. `feat(tui): UiStore + opentuiPrompter` — `tui/ui/store.ts`,
   `tui/ui/keymap.ts`, `tui/ui/theme.ts`, and the new
   `opentuiPrompter()` in `prompter.ts`. **Not yet wired** —
   `runApp` still uses `clackPrompter()`. Tests: `store.test.ts`,
   `prompter-opentui.test.ts` (drives the façade with manual
   `ui.resolve` calls, asserts text/select/confirm/cancel).
6. `feat(tui): AppRoot + ViewportPane + InteractionPane + StatusBar` —
   the Solid components, no logic, statically driven by a stubbed
   store. Snapshot-style assertions on rendered output via OpenTUI's
   test renderer.
7. `feat(tui): widget components (SelectList, TextField, MultilineField,
   FilePathField, ConfirmDialog, Spinner, LogStream)` — each with its
   own keystroke unit test.

**Phase L3 — wire the new renderer.**

8. `feat(tui): mount Solid root and switch default prompter to
   opentuiPrompter` — `tui/index.ts` now mounts `AppRoot`, creates a
   `UiStore`, instantiates `opentuiPrompter(ui)`, and passes that into
   `runApp`. `intro`/`outro` become no-ops; status bar takes their
   place. `runApp` pushes status updates to the store before each
   top-level select. Existing scripted-prompter tests still pass —
   they never touch the store. The clack runtime dep is removed in
   this commit.
9. `feat(tui): Screen.body() extension + ViewportStore wiring` — extend
   `Screen` interface (back-compatible), update `runScreen` to call
   both `header()` and `body()` and write into `UiStore.viewport`,
   plus breadcrumb push/pop. Update `execute.ts` success branch to
   write the rendered result as `{ kind: 'result' }` into the viewport
   instead of `prompter.note(...)`.
10. `feat(tui): screens — implement body() for projects, project-home,
    reports list, report-home, notes list, notes action, upload,
    members` — one commit per screen if reviewer prefers (8 sub-commits
    acceptable); each adds a typed-snapshot test for its `body()`.

**Phase L4 — end-to-end proof and cleanup.**

11. `test(tui): pty smoke flow — sign-in → project → report → add note`
    — runs `bun apps/cli/src/index.ts tui` under `node-pty` against
    the in-process live API (no DI substitutions for the prompter).
    Asserts the DB side-effect. This is the Pitfall 13 gate.
12. `chore(cli): remove @clack/prompts from deps + lint rule` — drop
    the package fully, add an `eslint` `no-restricted-imports` rule
    blocking `@clack/prompts` anywhere in `apps/cli/src/`.
13. `docs(tui): README + arch-cli — new install + run instructions` —
    document the Bun runtime, the single-file binary, the two-pane
    behaviour, the keymap. Update `arch-cli.md` to cross-link.

Exit gate for "TUI v4 done":

- `pnpm --filter @harpa/cli test` green under Bun.
- `pnpm --filter @harpa/cli test:integration` (pty smoke) green in CI.
- `harpa tui` runs from a single-file Bun binary on linux-x64 in CI
  (smoke: spawn, send `q`, expect exit 0).
- No `@clack/prompts` in `apps/cli/package.json` or `node_modules`
  resolution graph.
- `arch-tui-nav.md` banner points at this doc; section index in
  `architecture.md` lists this doc.

---

## 7. Open questions / explicit carve-outs

- **Vitest under Bun.** Vitest supports Bun via `bun --bun vitest run`,
  but if interop bites (esp. for Solid component tests that use
  OpenTUI's test renderer), we keep the unit/widget tests on Node-Vitest
  and only the pty smoke test on Bun. Decided in commit L2.5 based on
  what actually works. Recorded as a checklist item; not gating this
  design.
- **Mouse support.** OpenTUI supports mouse events. Out of scope for
  v4 — keyboard only. Picked up later if user feedback asks for it
  (no plan-doc placeholder; tracked here).
- **Theming / dark-mode-aware colours.** v4 ships with one theme
  (`tui/ui/theme.ts`). Theme variants are a follow-up.
- **Single-file Windows binary.** Bun's `--compile` supports
  `windows-x64` but our existing CLI never targeted Windows; we ship
  the four Unix targets only. Windows users run the JS entry under
  Bun directly. Carve-out.
- **Richer upload flow (`path → presign → R2 PUT → register → auto-note`).**
  Already a carve-out from `arch-tui-app.md §6 step 8` and
  `arch-tui-nav.md §7`; unchanged by this design. The new upload
  screen renders the existing leaves; the unified flow is still future
  work.
- **Replacing the v2 flow layer with screens everywhere.** Account,
  sign-in/out, set-api-url, developer-raw-api remain `Flow` objects.
  Migrating them to `Screen`s is optional cosmetics — done only if a
  flow gains useful viewport content. Tracked in the screen-tree doc,
  not here.
