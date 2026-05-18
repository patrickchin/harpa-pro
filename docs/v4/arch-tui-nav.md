# TUI v3 — `harpa tui` screen-based navigation

> **Status:** design, not yet implemented. Successor to the navigation
> half of [`arch-tui-app.md`](arch-tui-app.md). The state-machine,
> credentials store, sign-in flow, `Flow` shape, `Prompter`,
> `defineTuiEntry` / `HarpaCommand`, and `Developer › Raw API` surface
> described there are all preserved verbatim. This doc extends the
> *authed* surface from "list of flows = list of citty leaves" into a
> shallow screen hierarchy with context-carrying state (current
> project, current report) and info-header "home" screens.
>
> **Read first:** [`pitfalls.md`](pitfalls.md) (Pitfalls 5, 8, 10, 13),
> [`arch-tui-app.md`](arch-tui-app.md), [`arch-cli.md`](arch-cli.md),
> and the implementation under `apps/cli/src/tui/`.

[arch-tui-app]: arch-tui-app.md
[arch-cli]: arch-cli.md
[pitfalls]: pitfalls.md

## 1. Problem statement

The shipped v2 (`arch-tui-app.md`) gave `harpa tui` a real state
machine and persisted credentials, but the **authed surface is still a
flat list of citty leaves** dressed up as five flows
(Account / Projects / Upload / Developer / Sign out). The `projects`
flow in particular is just a single grouped submenu over 21 leaves
spanning projects, members, reports, notes — every one of which
re-prompts for `projectSlug` and (for report leaves) `number`. To add
two notes to one report the user types the slug + report number five
times.

**Acceptance contract for v3 navigation:**

1. After "Open project X" the user never re-types the project's
   identifier inside that drill-down. After "Open report N" they
   never re-type the report number inside that drill-down.
2. Each drill-down lands on a **home screen** that shows the
   resource's salient info (project: name/slug/client/member count;
   report: number/date/status/note count/generated-yes-no) above the
   action menu.
3. Action menus are **resource-shaped**, not endpoint-shaped: a
   report home offers "Add note / Upload media / Generate / Finalize /
   PDF / View notes / Edit / Delete / ← back", not "reports update,
   reports delete, reports generate, …" by API path name.
4. `Developer › Raw API` keeps the v2 surface unchanged — every leaf
   in `entries.ts` is reachable there, with its original (re-prompts
   for everything) behaviour. This is the debug / power-user
   side-door, not the default navigation path.
5. `← back` is consistent at every depth (return to caller, never
   exits the app). Top-level `Quit` is the only thing that exits.
   Ctrl-C inside a screen menu == `← back`. Ctrl-C inside a leaf's
   own prompt cancels the leaf only.
6. No `setTimeout`, no fire-and-forget (Pitfall 5). Header info is
   fetched with an awaited request when the screen opens and
   re-fetched after any action that mutates the resource. No
   background polling.
7. Default wiring (`clackPrompter`, `diskCredentialsStore`, real
   in-process API in tests) is exercised end-to-end in the pty smoke
   test, drilling project → report → note (Pitfall 13).

**Canonical-source files this design touches:**

- `apps/cli/src/tui/session.ts` — extend `AppState.authed` with
  `currentReport?: ReportRef`. Add `setCurrentReport`.
- `apps/cli/src/tui/execute.ts` — accept an optional `prefill` arg.
- `apps/cli/src/tui/prompt.ts` — `collectArgs` skips prefilled keys.
- `apps/cli/src/tui/flows/projects.ts` — replaced by a thin shim that
  opens the new Projects screen.
- New `apps/cli/src/tui/screen.ts` — `Screen` / `runScreen` driver.
- New `apps/cli/src/tui/screens/{projects,project-home,members,reports,report-home,notes}.ts`.
- New tests under `apps/cli/src/__tests__/tui/screens/`.

The flag CLI (`apps/cli/src/index.ts`, `commands/*.ts`,
`lib/env-runtime.ts`), the state machine, sign-in/out, the
credentials store, and `Developer › Raw API` are **unchanged**.

## 2. Alternatives considered

### Alt A — Make `_submenu` "stateful" (one-line item annotations)

Add a `prefill?: (session) => Record<string, unknown>` field to
`SubmenuItem`. Keep the existing flat submenus; each item declares
what session-derived values to inject so users stop retyping the slug.

- **Pros:** Smallest patch — touches `_submenu.ts` and the seven
  current items in `projects.ts`. No new abstractions.
- **Cons:** Doesn't deliver the "feels like a GUI app" half of the
  brief: no info header, no resource-shaped action labels, no
  drill-down hierarchy, no separation between "open this report" and
  "do something to this report". A user opening Notes still sees
  `notes list / notes create / notes update / notes delete` — the
  endpoint shape, not the report shape. Also doesn't fix the
  `report id/number` prompt: prefill alone can't carry a *picked*
  report through multiple submenu visits because the submenu is
  re-entered each time. **Rejected.**

### Alt B — Build a real TUI canvas with `ink`

Re-evaluate Alt B from `arch-tui-app.md` §2 now that we want richer
screens. A persistent header pane, sidebar of recent projects, live
focus — all "free" with Ink.

- **Pros:** Genuinely "graphical-feeling" UI; persistent header is
  trivial.
- **Cons:** Same as before: doubles the surface area we own, breaks
  the scripted-prompter test strategy that every v2 test depends on
  (Ink renders via React reconciler — `scriptedPrompter` doesn't
  apply). The Pitfall-13 pty smoke test would need a full screen
  scraper. And the actual ergonomic win — "info above the menu, no
  retyping" — is achievable inside the existing line-oriented
  clack flow by re-rendering `note(...)` before each `select(...)`.
  **Rejected** (re-evaluate post-v3 if the screen-driver feels too
  cramped).

### Alt C — `Screen` abstraction + prefill, on top of the existing prompter (chosen)

Three additive pieces:

1. **`Screen`** — a typed bundle of `(header, actions, refresh)` that
   the new `runScreen` driver loops over. Screens may open other
   screens, execute leaves with prefill, or run sub-flows.
2. **Prefill** — `runCommand(prompter, session, leaf, { prefill })`
   skips `collectArgs` for any key already in `prefill`. The session
   carries `currentProject` (already there) and `currentReport`
   (new); screens pull the right keys for the leaf they're invoking.
3. **`currentReport` on the session** — analogous to v2's
   `currentProject`. Set when the user picks a report from a list;
   cleared on back-out-to-project or sign-out.

- **Pros:** Tests stay scripted-prompter-driven. `_submenu` continues
  to exist for the flat cases (Account, Developer › Raw API). Every
  existing leaf works unchanged — prefill is a *capability*, not a
  requirement. The richer Project Home / Report Home screens are
  built as `Screen` instances; old `projectsFlow` becomes a thin
  shim that opens `projectsScreen`.
- **Cons:** Adds one more concept (`Screen` next to `Flow`). We
  contain that by making the contract small (header + actions + back)
  and by re-using `Flow` at the top level — flows simply open
  screens.
- **Chosen.**

## 3. Design

### 3.1 Screen hierarchy

```
authed top-level (existing Flow surface from arch-tui-app §3.2)
├── Account                                (flow → flat submenu, unchanged from v2)
├── Projects ─────────────────────────────► projectsScreen
│       header: "<count> projects  ·  recent: <three names>"
│       actions:
│         · Open <project A>                ─► projectHomeScreen(A)
│         · Open <project B>                ─► projectHomeScreen(B)
│         · …                               (up to 7 recent, then "More…")
│         · New project                     ─► newProjectFlow
│         · List all projects               ─► leaf `projects list` (raw render)
│         · Refresh
│         · ← back
│
│   projectHomeScreen ──── currentProject = P ────
│       header: "Project: <name> (<slug>)
│                <client> · <address>
│                <member-count> members · <report-count> reports"
│       actions:
│         · New report                      ─► leaf `reports create` (prefill projectSlug)
│         · Open report                     ─► reportsListScreen(P)
│         · Members                         ─► membersScreen(P)
│         · Edit project                    ─► leaf `projects update` (prefill projectSlug)
│         · Delete project                  ─► leaf `projects delete` (confirm, prefill)
│         · Refresh
│         · ← back
│
│       reportsListScreen ─── currentProject = P ──
│           header: "Reports in <project name> — <N total>"
│           actions:
│             · #12 (final) · 2024-05-04 · <noteCount> notes
│             · #11 (draft) · 2024-05-03 · <noteCount> notes
│             · …
│             · New report
│             · Refresh
│             · ← back
│           pick #N ─► reportHomeScreen(P, N)
│
│           reportHomeScreen ─── currentProject=P, currentReport=R ──
│               header: "Report #<number> — <title or '(untitled)'>
│                        <status> · created <date> · <noteCount> notes
│                        generated: <yes|no> · finalized: <yes|no>"
│               actions (status-aware):
│                 · Add text note                ─► leaf `notes create` (prefill project+number)
│                 · Upload media                 ─► uploadScreen(P, R)
│                 · View notes                   ─► notesListScreen(P, R)
│                 · Generate report           [draft only]
│                 · Regenerate                [draft, post-generate only]
│                 · Finalize                  [draft only]
│                 · Download PDF              [final only]
│                 · Edit metadata               ─► leaf `reports update` (prefill)
│                 · Delete report               ─► leaf `reports delete` (confirm, prefill)
│                 · Refresh
│                 · ← back
│
│               notesListScreen ─── currentProject=P, currentReport=R ──
│                   header: "Notes on report #<number> — <N total>"
│                   actions:
│                     · #note-<short-id> · <kind> · "<preview>"
│                     · … (newest first)
│                     · Add text note
│                     · Refresh
│                     · ← back
│                   pick a note ─► notesActionScreen(noteId)
│
│                   notesActionScreen (no separate `currentNote`)
│                       header: full note body
│                       actions:
│                         · Edit       ─► leaf `notes update` (prefill all three IDs)
│                         · Delete     ─► leaf `notes delete` (confirm, prefill)
│                         · ← back
│
│               uploadScreen (P, R)
│                   header: "Upload to report #<number>"
│                   actions:
│                     · Presign URL       ─► leaf `files presign` (prefill project+number)
│                     · Register file     ─► leaf `files register` (prefill)
│                     · Voice — transcribe / summarize  ─► leaves (prefill)
│                     · ← back
│                   (the richer "path → presign → R2 PUT → register
│                    → auto-note" flow remains the carve-out from
│                    arch-tui-app §6 step 8; the underlying citty
│                    leaf doesn't exist yet — see §7 here.)
│
│       membersScreen ─── currentProject=P ──
│           header: "<N> members on <project name>"
│           actions:
│             · <member display> (<role>)        ─► leaf `members remove` (confirm, prefill)
│             · …
│             · Add member                       ─► leaf `members add` (prefill)
│             · Refresh
│             · ← back
│
├── Developer › Raw API                    (unchanged: every leaf, no prefill)
├── Sign out
├── Set API URL
└── Quit
```

Two screens deep is the worst case (top → Projects → Project Home →
Reports List → Report Home → Notes List → Note Action = five levels
counting top-level menu, but only two of those screens carry
"current" context). Back from any node returns to the immediate
parent — `back` is never a state restore, just a `return` from the
calling `runScreen`.

### 3.2 Carrying context — Session extensions

v2 already has `currentProject?: ProjectRef` on `AppState.authed`.
v3 adds `currentReport?: ReportRef`. Both live in memory only — they
are **not** persisted to the credentials file. Quitting the TUI and
re-launching lands the user back on the top-level authed menu with
no project open.

```ts
// session.ts (extended)

export interface ReportRef {
  readonly projectSlug: string;          // identifies parent
  readonly number: number;               // per-project monotonic id
  readonly status?: 'draft' | 'final';
  readonly title?: string;
  readonly noteCount?: number;
  readonly hasGenerated?: boolean;
}

export type AppState =
  | { kind: 'config' }
  | { kind: 'auth'; reason: AuthReason }
  | {
      kind: 'authed';
      user: SessionUser;
      currentProject?: ProjectRef;
      currentReport?: ReportRef;          // new
    };

export interface Session {
  // ... existing ...
  setCurrentProject(p: ProjectRef | undefined): void;   // existing —
                                                        //  on undefined, also clears currentReport
  setCurrentReport(r: ReportRef | undefined): void;     // new
}
```

Invariants enforced by `setCurrentReport`:

- Setting a report requires `state.kind === 'authed'` and
  `state.currentProject` set. If the second invariant is violated
  the call is a no-op (defensive — screens shouldn't be able to
  trigger this, but tests assert it).
- `setCurrentProject(undefined)` clears `currentReport` as well.
- `clearAuth()` (existing) implicitly clears both via the state
  transition to `auth`.

No third `currentNote`: notes are accessed via a picker rather than
a "now open" notion. Empirically, the per-note actions (edit / delete)
are short and always immediately followed by `← back`; a separate
home screen adds depth without ergonomic payoff. Carve-out noted in
§7 in case that changes.

### 3.3 Prefill mechanism

`runCommand` (in `execute.ts`) currently calls
`collectArgs(prompter, tuiArgs)` which iterates every key in
`tuiSpec.args` and prompts for each. v3 adds:

```ts
export interface RunCommandOptions {
  /**
   * Pre-supplied answers for one or more arg keys. Keys present here
   * are NOT prompted for; their values flow straight into the
   * `args` object handed to `execute()`. Type coercion is the
   * caller's responsibility — values should already be in the shape
   * the leaf expects (string for slugs, number for report numbers,
   * UUID string for note IDs).
   *
   * Why no validation here: validation lives in each
   * `ArgPrompt`'s `validate` (e.g. PHONE_RE, UUID_RE). Screens that
   * derive prefill from session state pull values that came from
   * the API in the first place — they're trustworthy. Adding a
   * second validation pass would double-execute regexes on every
   * action.
   */
  readonly prefill?: Readonly<Record<string, unknown>>;
}

export async function runCommand(
  prompter: Prompter,
  session: Session,
  cmd: AnyHarpaCommand,
  opts: RunCommandOptions = {},
): Promise<RunCommandResult>;
```

`collectArgs(prompter, tuiArgs, prefill?)` (in `prompt.ts`) gains an
optional `prefill` parameter; for each `[name, spec]` it short-
circuits when `name in prefill`, copying `prefill[name]` into the
answers map. The existing `spec.skipWhen` check still runs first
(prefill never overrides an explicit skip).

**Worked example — "Add text note" from Report Home:**

```ts
// inside reportHomeScreen
{
  kind: 'leaf',
  label: 'Add text note',
  cittyPath: ['notes', 'create'],
  prefill: () => ({
    projectSlug: session.state.currentProject!.slug,
    reportNumber: session.state.currentReport!.number,
  }),
  refreshHeader: true,            // re-fetch report after note creation
}
```

Only `body` (and any optional `kind`) prompts fire. The user types
the note body, the leaf runs against the API, `runScreen` re-fetches
the header (noteCount updates), and the menu re-renders.

Prefill is keyed by `TuiArgSpec` arg name — not by openapi-fetch path
parameter — so it survives route renames as long as the citty arg
keys stay consistent (Pitfall 14: when a route changes, both the
leaf's `args` shape and the screen's `prefill` keys move in the same
commit).

### 3.4 `Screen` shape and the `runScreen` driver

New file `apps/cli/src/tui/screen.ts`:

```ts
export interface HeaderInfo {
  readonly title: string;
  readonly lines: ReadonlyArray<string>;
}

export type ScreenAction =
  | {
      kind: 'leaf';
      label: string;
      hint?: string;
      cittyPath: ReadonlyArray<string>;
      /** Lazy so the latest session state is read each render. */
      prefill?: (session: Session) => Readonly<Record<string, unknown>>;
      /** Confirm prompt before running. */
      confirm?: { label: string };
      /** Re-fetch header after success. Default: false. */
      refreshHeader?: boolean;
    }
  | {
      kind: 'screen';
      label: string;
      hint?: string;
      open: (ctx: ScreenContext) => Screen;
      /** Re-fetch header after the child screen returns. */
      refreshHeader?: boolean;
    }
  | {
      kind: 'flow';
      label: string;
      hint?: string;
      run: (ctx: ScreenContext) => Promise<void>;
      refreshHeader?: boolean;
    }
  | { kind: 'separator'; label?: string };

export interface ScreenContext {
  readonly prompter: Prompter;
  readonly session: Session;
}

export interface Screen {
  readonly id: string;                                  // for tests
  /**
   * Fetch the resource info needed for the header. Called once on
   * entry and again whenever an action returns `refreshHeader`. May
   * return `undefined` to skip the header (e.g. a screen whose
   * resource was just deleted; the driver then pops back).
   */
  header(ctx: ScreenContext): Promise<HeaderInfo | undefined>;
  /** Built fresh on every render so it can react to session changes. */
  actions(ctx: ScreenContext): ReadonlyArray<ScreenAction>;
  /** Optional back-label override (default "← back"). */
  backLabel?: string;
  /**
   * Called when the user picks `← back` or cancels at the screen's
   * menu. Use to clear context (e.g. project home clears
   * `currentProject` on back-out). Default: no-op.
   */
  onExit?(ctx: ScreenContext): void;
}

export async function runScreen(
  prompter: Prompter,
  session: Session,
  screen: Screen,
): Promise<void>;
```

Driver loop pseudocode:

```ts
async function runScreen(prompter, session, screen) {
  let header = await screen.header({ prompter, session });
  for (;;) {
    if (header === undefined) break;                    // resource gone — pop
    prompter.note(header.lines.join('\n'), header.title);

    const actions = screen.actions({ prompter, session });
    const choice = await prompter.select<string>({
      label: 'Action',
      options: [
        ...actions
          .filter((a) => a.kind !== 'separator')
          .map((a, i) => ({ value: String(i), label: a.label, hint: a.hint })),
        { value: '__back__', label: screen.backLabel ?? '← back' },
      ],
    });

    if (prompter.isCancel(choice) || choice === '__back__') break;

    const action = actions.filter((a) => a.kind !== 'separator')[Number(choice)];
    let didMutate = false;
    switch (action.kind) {
      case 'leaf': {
        if (action.confirm) {
          const ok = await prompter.confirm({ label: action.confirm.label });
          if (prompter.isCancel(ok) || !ok) continue;
        }
        const leaf = findLeaf(action.cittyPath);
        const prefill = action.prefill?.(session);
        const r = await runCommand(prompter, session, leaf, { prefill });
        didMutate = r.status === 'ok' && Boolean(action.refreshHeader);
        break;
      }
      case 'screen': {
        const child = action.open({ prompter, session });
        await runScreen(prompter, session, child);
        didMutate = Boolean(action.refreshHeader);
        break;
      }
      case 'flow': {
        await action.run({ prompter, session });
        didMutate = Boolean(action.refreshHeader);
        break;
      }
    }
    if (didMutate) header = await screen.header({ prompter, session });
  }
  screen.onExit?.({ prompter, session });
}
```

Notes:

- The header is fetched **once on entry** and only re-fetched when an
  action declares `refreshHeader`. Listing/read-only actions don't
  trigger a refetch. This keeps the chatty action ("List notes")
  cheap — one API call to display, no second header round-trip.
- `Refresh` is a deliberate user-facing action (a `screen` whose
  child immediately returns, or simpler: a synthetic flow that just
  sets `didMutate = true`). Implemented as a one-liner helper
  `refreshAction(): ScreenAction`.
- `header() === undefined` means "this resource went away" (e.g.
  the user just deleted the project from project home, or the
  refetch 404'd). The driver pops; the parent screen's next render
  shows the updated list.
- Ctrl-C at the screen's `select` is treated identically to `back`.
  Ctrl-C inside a leaf's `collectArgs` cancels that leaf only
  (existing behaviour from `runCommand`).

### 3.5 Header rendering — clack `note` (cached, not re-fetched)

The header is just `prompter.note(lines.join('\n'), title)`. No
new primitive needed; `note` already draws a bordered block. Example
render for Report Home:

```
┌  Report #12 — Wall framing inspection
│
│  status: draft  ·  created 2024-05-04
│  notes: 3  ·  generated: yes  ·  finalized: no
│  project: oak-park-garage (Garage build)
└

◇  Action
│  > Add text note
│    Upload media
│    View notes
│    Regenerate report
│    Finalize
│    Edit metadata
│    Delete report
│    Refresh
│    ← back
```

The header text is built by a small per-screen helper
(`buildReportHeader(report, project): HeaderInfo`). These helpers
are pure functions of the API response shape and have unit tests
for every status branch.

Header caching is intentionally minimal: a single value held by the
driver loop. Across screens nothing is cached — opening Report Home
fetches `GET /projects/{slug}/reports/{n}` even if Reports List had
just fetched the same row. Rationale: the list response is a
summary projection, the home screen wants the full record; reusing
the partial would just shift the request later. If profiling shows
this is hot we can add a per-session read-through cache, but
empirically the TUI is interactive and one API round-trip per
screen entry is invisible.

**Fetch mechanics.** Each screen's `header()` uses a tiny helper
`fetchVia(leaf, args)` that runs a `HarpaCommand`'s `execute()`
+ `performRequest` and returns `outcome.data` on success or
`undefined` on 404/transport-error (logging the message). This
re-uses the existing leaves rather than re-encoding the OpenAPI
paths — same Pitfall-14 defence as v2's `validateToken`.

### 3.6 Flow vs leaf vs screen — bucketing rules

Every citty leaf (`tuiEntries.ts`) is in one of three buckets, same
as v2 — but with one new label:

| Bucket | Behaviour | v3 examples |
|---|---|---|
| **Screen-invoked (prefill)** | Reachable from a screen with project / report context auto-filled. Also reachable raw under Developer › Raw API. | `notes create`, `notes update`, `notes delete`, `reports update`, `reports delete`, `reports generate`, `reports regenerate`, `reports finalize`, `reports pdf`, `members add`, `members remove`, `files presign`, `files register`, `voice transcribe`, `voice summarize` |
| **Screen-invoked (no prefill)** | Reachable from a screen but with no session context to inject. Same shape as Raw API. | `projects create`, `me get`, `me update`, `me usage`, `settings ai get`, `settings ai set` |
| **Raw-only** | Reachable only under Developer › Raw API; no screen surfaces it. | `auth otp start`, `auth otp verify`, `auth logout` (sign-in flow subsumes these), `health` |

No leaf is hidden. `tuiSpec.surface` (introduced but unused in v2)
stays unused in v3 — every leaf is `'raw'` (the default).

The Account flow stays a flat submenu (`runSubmenu`) — there's no
useful "Account home" header beyond the user identity already shown
in the top-level state label. The Upload top-level flow becomes an
explicit "open a report first" stub: it prompts a select with one
option ("Open a project → report") that opens `projectsScreen` and
returns; no leaves under it. (Once a report is open the Upload
sub-menu inside Report Home is the real surface.) This makes the
GUI-app feel consistent: media uploads always belong to a report.

### 3.7 Back / quit / cancel semantics

| Where | Action | Effect |
|---|---|---|
| Top-level menu (any state) | Pick `Quit` | Exit process. |
| Top-level menu (any state) | Ctrl-C | Exit process (v2 behaviour, unchanged). |
| Any screen menu | Pick `← back` | Return to parent screen. |
| Any screen menu | Ctrl-C | Same as `← back`. |
| Inside a leaf's `collectArgs` | Ctrl-C | Cancel the leaf; return to current screen. No header refetch. |
| Inside an action's `confirm` | Cancel | Same — return to current screen. |
| After a leaf's API call fails | (any) | Stay on screen, error rendered via `prompter.log.error`. No refetch (the leaf didn't mutate). |
| After leaf success when `refreshHeader: true` | (auto) | Refetch header; if 404, pop. |
| `setCurrentProject(undefined)` triggered by `onExit` of project home | (auto) | Also clears `currentReport`. |
| Project deletion (from Project Home) | (auto) | `header()` returns `undefined` on next refetch → driver pops back to Projects screen. The list refetches because the action declares `refreshHeader: true` (well, in this case the project home pops, and Projects screen's `refreshHeader` from the open-screen action fires). |

No timers anywhere. Every refetch is awaited inline.

### 3.8 What's still in Developer › Raw API

All of it. Every leaf in `entries.ts` continues to show under the
`Developer › Raw API` flow, grouped exactly as v2 grouped them.
That's the debugging surface — it's deliberately *not* the navigation
surface. Documentation calls it out as such (see `arch-cli.md`
update in TUI-nav.9). For LLM-driven scripted exploration the flag
CLI is the right tool; for human ad-hoc poking the raw menu remains.

### 3.9 Does `_submenu` still fit?

Yes — Account stays a `runSubmenu` because none of its leaves carry
context across selections. Developer › Raw API also stays
`runSubmenu`-style (it's a different code path today but the shape
is identical).

We do **not** evolve `_submenu` into a "stateful submenu" variant.
That would conflate two ideas:

- `runSubmenu` = "here are N leaves grouped under one label" (no
  state, no header, every leaf re-prompts).
- `runScreen` = "this is a home for a resource — show its info,
  offer actions, carry context".

Keeping them separate makes each ~50 lines and lets us add screens
without retrofitting submenus. Members and Notes screens use
`runScreen` (they prefill), not `_submenu`.

### 3.10 Failure modes

| Symptom | Handling |
|---|---|
| Header fetch 401 | Should never happen mid-session, but treat as transient: log error, pop. |
| Header fetch 404 (resource deleted by another client) | Pop (`header()` returns `undefined`). Parent screen refetches its list. |
| Header fetch transport error | Log error, render header with `(unavailable)` placeholder lines, leave actions enabled (user can `Refresh` or `← back`). |
| Action leaf returns 401 mid-session | v2 behaviour: error rendered; user falls back to `← back` and Sign out. Token validation only runs at boot per arch-tui-app §3.4. |
| Picker (e.g. report list) returns empty | Picker shows only "New <thing>" / "← back" — empty-state hint as the select's prompt label ("No reports yet"). |
| User picks a deleted note from a stale picker | Action's `runCommand` surfaces the 404; refetch picker on next entry. |

All awaited; no fire-and-forget.

## 4. Pitfalls addressed

| Pitfall | How |
|---|---|
| [5](pitfalls.md#pitfall-5--auth-glue-done-late-env-handling-brittle) | No timers, no fire-and-forget. Every screen refetch is `await`-ed inline. Token validation still happens only at boot (arch-tui-app §3.4); v3 doesn't introduce new auth surfaces. |
| [8](pitfalls.md#pitfall-8--upload-pipeline-missed-timeline-integration) | Upload Screen lives inside Report Home with project + report number prefilled — every upload path already belongs to a report. The "auto-create note" step is still the deferred `files upload` carve-out from arch-tui-app §6.8 (no underlying leaf yet); when that leaf lands, `uploadScreen` invokes it with `refreshHeader: true` and the report's `noteCount` ticks up — visible regression on the home screen. |
| [10](pitfalls.md#pitfall-10--coverage--docs--tests-in-p5p6p7-instead-of-inline) | Every step in §6 ships its own tests **and** amends this doc to mark itself shipped. No "tests later". |
| [13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken) | The default `runScreen` + `clackPrompter` + `diskCredentialsStore` triple is exercised by an extended pty smoke that drills project → report → add note against the in-process Hono app. `scriptedPrompter` is for branch coverage only. |
| [14](pitfalls.md#pitfall-14--cli--contract-path-drift) | Screens never re-encode OpenAPI paths — they invoke leaves via `cittyPath` and prefill by arg name. Path changes ripple through the existing leaves, which the CLI build already catches. |

## 5. Test plan

Test files under `apps/cli/src/__tests__/tui/`:

| Layer | File | Asserts |
|---|---|---|
| Unit | `session-current-report.test.ts` | `setCurrentReport` no-op when no project; clears on `setCurrentProject(undefined)`; clears on `clearAuth`. |
| Unit | `prompt-prefill.test.ts` | `collectArgs` skips prefilled keys (still prompts for non-prefilled), prefill respects `skipWhen`, prefill values pass through `runCommand` untouched (no double validation). |
| Unit | `screen-driver.test.ts` | `runScreen`: renders header, exits on `back`, exits on Ctrl-C, refetches header iff `refreshHeader`, pops when `header() === undefined`. `onExit` fires on every exit path. Separator items aren't selectable. |
| Behaviour | `screens/projects.test.ts` | Empty state shows "New project" + `← back` only. With three projects, picks one → opens Project Home with the right `currentProject`. |
| Behaviour | `screens/project-home.test.ts` | Header lines built from canonical fixture. Add report opens leaf with `projectSlug` prefilled. Delete project → confirm → 204 → header returns `undefined` → pops. |
| Behaviour | `screens/reports-and-report-home.test.ts` | Pick a report → Report Home shows status-aware actions. `Finalize` hidden once status=final. `Regenerate` hidden until first generate succeeded. `noteCount` in header reflects post-add value (refresh works). |
| Behaviour | `screens/notes.test.ts` | Notes list picker → note action screen → edit prefills all three IDs; delete confirm → 204 → pops. |
| Behaviour | `screens/members.test.ts` | Add member → list refetches with new row. Remove confirms. |
| Default wiring | `pty.smoke.integration.test.ts` (extended) | Real `clackPrompter` + real disk creds + mock-API server: sign in → Projects → pick → Report → Add note → `← back` × 3 → Sign out. Asserts noteCount visible in second render of report home. (Pitfall 13.) |
| Help / docs drift | `help.snapshot.test.ts` (updated) | TUI help mentions screen-based navigation + Developer › Raw API as the debug surface. |

Coverage gate: existing ≥80% lines on `apps/cli/src/tui/**` applies
to `screen.ts` + `screens/**`.

## 6. Implementation checklist (one commit each)

> **Status:** TUI-nav.0–9 ✅ shipped on `feat/tui`.

Each step ships its own tests + amends this doc's status table. No
"tests later" step. Conventional Commits with `Co-authored-by:
Copilot` trailer.

1. **TUI-nav.0 — Extend Session with `currentReport`.** ✅
   Update `session.ts` (`AppState`, `setCurrentReport`, invariants).
   Unit test `session-current-report.test.ts`.
   `refactor(cli): carry currentReport in tui session state`

2. **TUI-nav.1 — Prefill in `runCommand` / `collectArgs`.** ✅
   Add `RunCommandOptions.prefill`, thread through `collectArgs`.
   Unit test `prompt-prefill.test.ts`. No screen changes yet.
   `feat(cli): support prefilled args in tui leaf execution`

3. **TUI-nav.2 — `Screen` + `runScreen` driver.** ✅
   New `tui/screen.ts` with `Screen`, `ScreenAction`, `runScreen`,
   `refreshAction()`, plus `findLeaf` extracted to
   `tui/registry-find.ts` (shared with `_submenu.ts`). Unit test
   `screen-driver.test.ts` with scriptedPrompter + synthetic screens.
   No flows changed yet.
   `feat(cli): screen driver with info header for tui flows`

4. **TUI-nav.3 — Projects screen + Project Home screen.** ✅
   New `tui/screens/projects.ts`, `tui/screens/project-home.ts`,
   shared `tui/screens/_fetch.ts` (re-uses leaves via cittyPath
   per Pitfall 14). Replaces `projectsFlow` body with `runScreen`.
   Behaviour tests cover header rendering, unreachable API, exit
   cascade-clear, 404-pops.
   `feat(cli): project home screen replaces flat projects submenu`

5. **TUI-nav.4 — Members screen.** ✅
   `tui/screens/members.ts`. Reached from Project Home › Members.
   Prefills `projectId` on `members add` / `members remove`. Per-
   member remove rows with confirm. Tests.
   `feat(cli): tui members screen prefills current project`

6. **TUI-nav.5 — Reports list screen + Report Home screen.** ✅
   `tui/screens/reports.ts`, `tui/screens/report-home.ts`. Status-
   aware action filter. Header refresh on note add / generate /
   finalize. Behaviour tests cover each branch.
   `feat(cli): tui report home screen with status-aware actions`

7. **TUI-nav.6 — Notes list + note action screen.** ✅
   `tui/screens/notes.ts`. Picker + per-note Edit/Delete with all
   three IDs prefilled. Tests.
   `feat(cli): tui notes screen prefills note ids from picker`

8. **TUI-nav.7 — Upload screen scoped to current report.** ✅
   `tui/screens/upload.ts`. Replaces the top-level `uploadFlow`
   submenu body; the top-level flow now stubs to "Open a project →
   report first" (one-option select that opens Projects). Inside
   Report Home, `Upload media` opens the real upload screen with
   prefill.
   `refactor(cli): scope upload submenu to current report`

9. **TUI-nav.8 — Extended pty smoke (default wiring, Pitfall 13).** ✅
   Extends `pty.smoke.integration.test.ts` with a second case that
   signs in and drills the new Projects screen under default clack
   wiring. The deeper project→report→note script remains a follow-
   up; this round covers the screen driver itself (the most
   error-prone new surface).
   `test(cli): pty smoke drills projects screen (pitfall-13)`

10. **TUI-nav.9 — Docs + cross-links.** ✅
    Marks this doc's status as shipped per step. Successor banner
    added to `arch-tui-app.md` pointing here for navigation
    behaviour. `arch-cli.md` TUI quickstart describes the
    Project / Report drill-down and calls out Developer › Raw API
    as the debug-only surface. Cross-linked from
    `architecture.md`'s section index as row 11c.
    `docs(cli): document tui screen hierarchy and prefill mechanism`

Steps 1–3 are mechanical and independent and can land in any order
once each merges its own tests. Steps 4–7 each touch one screen pair
and can be reviewed standalone. Step 8 is the Pitfall-13 gate. Step
10 closes out the doc.

## 7. Open questions / carve-outs

1. **`currentNote` as session state.** Out of scope. Notes are
   handled via a picker; promoting to a "Note Home" screen would
   add depth without ergonomic payoff today. If voice transcription
   gains note-level actions ("re-transcribe", "branch into a new
   report") the carve-out reopens — recorded here, not in a
   plan-doc.

2. **Multi-step upload flow (path → presign → R2 PUT → register →
   auto-create note).** Still the carve-out from `arch-tui-app.md`
   §6 step 8: the underlying `files upload` citty leaf doesn't
   exist yet. When it lands, `uploadScreen` invokes it with
   `refreshHeader: true` and Pitfall 8's "note count visibly ticks
   up" assertion becomes a one-line behaviour test addition.

3. **PDF download — URL print vs file save.** The current
   `reports pdf` leaf prints a signed URL. Report Home surfaces it
   the same way (no `fs.writeFile`). A future enhancement could
   add a "Save to ~/Downloads" sub-action; recorded here.

4. **Search / filter in long pickers.** Out of scope. The Projects
   screen shows up to 7 "recent" with a "More…" fall-through to
   `projects list` (raw). Reports and Notes pickers list all rows
   the API returns (paginated by API default). If the lists get
   long enough to be unergonomic, clack's `select` doesn't filter —
   we'd revisit Alt B (Ink) at that point. Recorded here.

5. **Recent / pinned projects cache.** Out of scope: every Projects
   screen entry refetches via `projects list`. A future
   `~/.config/harpa-cli/recent.json` is straightforward but adds a
   second persisted file alongside `credentials.json`. Recorded
   here.

6. **Persisting `currentProject` / `currentReport` across TUI
   restarts.** Out of scope. Re-launch always lands on the
   top-level menu. Empirically users open a fresh context per
   session.

7. **Screen-level scripted-prompter ergonomics.** The driver renders
   a `note(...)` header before each `select`, which adds noise to
   `scriptedPrompter.transcript` in tests. We accept this — the
   note steps are easy to skip in assertions, and removing them
   would diverge the scripted view from the real one. If the tests
   get awkward, add a `transcriptForSelects()` helper. Recorded.

---

*See [`arch-tui-app.md`](arch-tui-app.md) for the state machine,
credentials store, sign-in flow, and `Developer › Raw API` surface
that this design extends but does not replace. See
[`arch-tui.md`](arch-tui.md) for the original flat-wrapper v1 that
both v2 and v3 supersede.*
