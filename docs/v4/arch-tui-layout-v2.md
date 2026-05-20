# TUI v4.2 — split-pane layout, redesigned

> **Status:** design, not yet implemented.
> **Supersedes** [`arch-tui-layout.md`](arch-tui-layout.md) for the
> *visual layout, information hierarchy, and per-screen viewport
> templates*. The OpenTUI + Solid runtime stack, `Prompter` contract,
> `UiStore`, scripted-prompter testability, and Bun-only entry point
> from v4.1 are **kept verbatim** — only the layout, the screen
> taxonomy, and the rules about where information lives change.
>
> The screen-hierarchy / navigation half of v4.1 (and
> [`arch-tui-nav.md`](arch-tui-nav.md)) is also kept, but the
> top-level menu items that today live as flat **flows**
> (`Account`, etc.) become **screens** so they participate in the
> breadcrumb and viewport pipeline like everything else.
>
> **Read first:** [`pitfalls.md`](pitfalls.md) (Pitfalls 5, 10, 13),
> [`arch-tui-app.md`](arch-tui-app.md), [`arch-tui-nav.md`](arch-tui-nav.md),
> [`arch-tui-layout.md`](arch-tui-layout.md) (legacy), and the
> implementation under `apps/cli/src/tui/`.

---

## 1. Why redesign

The shipped split-pane TUI satisfies the v4.1 acceptance contract
(it boots OpenTUI, paints two panes, is keyboard-driven) but the
information design is wrong. A manual walk-through surfaced seven
concrete complaints; this doc encodes the fixes.

| # | Complaint | Root cause (file:line) |
|---|---|---|
| C1 | Picking **Account** rotates the action list but doesn't show account info | `flows/account.ts` calls `runSubmenu` — never pushes a screen, never updates viewport / breadcrumb |
| C2 | Picking **Projects** doesn't *immediately* show a project list either | Works — but only because `runProjectsScreen` writes a body. The user's mental model is right; we just need every drill-in to follow the same shape |
| C3 | Breadcrumb doesn't change as you navigate | Same root as C1 for top-level menus; for sub-screens it does change but the user can't see it because the viewport title is faint |
| C4 | Critical info ("Signed in as …", API URL) is muted at the **bottom** | Status bar is grey, viewport body re-renders "Pick an action" in primary fg (`#e6edf3`) — wrong hierarchy |
| C5 | Same info appears twice | `stateViewportBody` prints "Signed in as X / API: Y" in the viewport **and** `StatusBar` prints them along the bottom |
| C6 | The word "Action" appears twice on the right pane | `InteractionPane` sets `title="action"` on the bordered box, and the underlying `prompter.select({ label: 'Action' })` paints `Action` again inside |
| C7 | Per-breadcrumb expectations not met (`/account` → account; `/projects` → projects; `/project/:id/report/:id` → report body; `/…/notes` → all notes) | Mix of C1 (Account isn't a screen) and "list" body being too sparse (`ViewportListItem` only shows `label` + `hint`) |

The fix is not a rewrite — it is a **layout + taxonomy correction**
that respects two invariants:

- **Viewport = "what's here".** The viewport pane answers *where am I,
  and what's at this address?* Every URL-style breadcrumb has exactly
  one canonical viewport rendering, defined per screen.
- **Interaction = "what can I do".** The interaction pane lists verbs
  for the current address. It carries no identity, no global status,
  no breadcrumb — just the verbs.

---

## 2. Layout from scratch

```
┌─ harpa ─────────────────────────────────────────────────────────────┐
│ /projects/acme/reports/12                            Patrick · prod │   ← TopBar (row 0)
├──────────────────────────────────── ────────────────────────────────┤
│                                    ¦                                │
│  Report #12 — Acme East Wing       ¦  ↑/↓ move  ↵ open  esc back    │   ← Viewport(left, 2fr)
│                                    ¦                                │       Interaction(right, 1fr)
│  status     draft                  ¦   ▸ Add text note              │
│  visit      2025-03-04             ¦     Upload media               │
│  generated  yes                    ¦     View all notes             │
│  notes      7                      ¦     Regenerate                 │
│                                    ¦     Finalize                   │
│  ── Body (preview) ──              ¦     Edit metadata              │
│  Site inspection found three       ¦     Delete report              │
│  defects in the east wall …        ¦     ───                        │
│                                    ¦     Refresh                    │
│  ── Notes (7) ──                   ¦     ← back to reports          │
│  • voice  "We checked the north…"  ¦                                │
│  • image  IMG_4823.jpg             ¦                                │
│  • text   "Owner approved …"       ¦                                │
│  …                                 ¦                                │
│                                    ¦                                │
├─────────────────────────────────────────────────────────────────────┤
│ ⓘ generated report (vendor: kimi)         · fixtures: replay        │   ← LogStrip (row N-1, 1 line)
└─────────────────────────────────────────────────────────────────────┘
```

### 2.1 Three rows, two columns

| Row | Height | What | Why |
|---|---|---|---|
| `TopBar` | 1 line | **Breadcrumb (loud, left)** · **identity strip (muted, right)** | Identity + location are the global facts; they go at the top because they're persistent across screens. The breadcrumb is the *loudest* element on screen (Pitfall: don't let "Pick an action" win). |
| `MainSplit` | flex | `Viewport` (2fr) ¦ `Interaction` (1fr) | Two panes only. Viewport is wider because it carries records, lists, bodies; the action list is short. |
| `LogStrip` | 1 line | most recent log entry (`note` / `info` / `success` / `warn` / `error`) | One line. Multi-line transient messages should be promoted to a viewport section, not stuffed into the bottom. |

This drops the v4.1 `StatusBar` (its content moves to `TopBar`) and
drops the `logTail: ReadonlyArray<LogEntry>` block inside the
viewport body (it moves to `LogStrip`, cap = 1).

### 2.2 What each pane is for, in one sentence

- **TopBar.** Where you are (left, bright). Who/what you are
  connected as (right, muted). No verbs.
- **Viewport.** The thing at the current breadcrumb. Read-only.
- **Interaction.** The verbs you can apply to the thing. The
  *only* pane that takes keyboard focus.
- **LogStrip.** The last thing that happened (one line).

### 2.3 Where global state lives — exactly one place each

| Datum | Canonical location | Forbidden elsewhere |
|---|---|---|
| Breadcrumb (URL-style path) | `TopBar` left | Viewport title, status bar, log |
| Signed-in user | `TopBar` right (`Patrick`) | Viewport body, interaction pane |
| API host short label | `TopBar` right (`· prod` / `· dev` / `· localhost`) | Viewport body, interaction pane |
| Fixture mode (`replay` / `record` / `live`) | `LogStrip` right (when not `live`) | Viewport body |
| "In flight" spinner | Interaction pane only | — |
| Last action result | `LogStrip` (one line) **and**, if structured (report rendered, PDF saved), the viewport body | Status bar |

This resolves **C4 + C5** by construction.

---

## 3. Visual hierarchy rules

OpenTUI doesn't have CSS, but we can rank by colour + weight:

| Rank | What it is | Token | Use exactly here |
|---|---|---|---|
| 1 (loudest) | Current breadcrumb path | `theme.fg` on bold or accent colour `theme.primary` | `TopBar` left only |
| 2 | Viewport headline (record title, list count) | `theme.fg` | First row of viewport body |
| 3 | Viewport field values | `theme.fg` | Detail rows, list items |
| 4 | Field labels, hints | `theme.fgMuted` | "status", "visit", role hints |
| 5 | Identity strip, log strip, keymap hint, "← back" | `theme.fgMuted` / `theme.fgDim` | TopBar right, LogStrip, interaction footer |
| 6 (quietest) | Borders, separators | `theme.borderIdle` | Pane edges |

**Rule:** "Pick an action", "idle — waiting for next step", and every
piece of *meta-instruction* render at rank 5 (muted). The user's data
must always be louder than the chrome. This resolves **C4**.

**Rule:** No box has a `title=` prop. The breadcrumb is the title of
the viewport; the interaction pane needs no title (we already know
what it does). This resolves **C6** at the source — there is no
"action" label *anywhere* in the chrome, and the underlying
`prompter.select({ label })` is rendered as a *helper line* in the
interaction pane footer (or omitted entirely when the label is the
generic `'Action'`).

---

## 4. Breadcrumb spec

### 4.1 Render

URL-style, single line, left-aligned in `TopBar`:

```
/                                        ← root / authed home
/account                                 ← account screen
/projects                                ← projects list
/projects/acme                           ← project home
/projects/acme/reports                   ← reports list
/projects/acme/reports/12                ← report home
/projects/acme/reports/12/notes          ← notes list
/projects/acme/members                   ← members list
/projects/acme/reports/12/upload         ← upload screen
```

Path style:

- Always leading `/`. Empty crumb stack ⇒ `/` (literally one char).
- Segments are `slug` / `number` / fixed-noun; never UUIDs unless we
  truly have no slug. Project = `slug` (today: `id` while slug
  migration in flight). Report = `number`.
- Segments wider than 24 chars are middle-truncated:
  `/projects/the-very-long-pro…name/reports/4`.
- When the path is wider than the terminal, **right-truncate the
  head** with `…/`, never the tail — the user is most interested
  in where they currently *are*, not the chain to get there.

### 4.2 Update mechanics

Already correct in v4.1: `runScreen` calls
`viewport.pushBreadcrumb(crumb)` on entry and `popBreadcrumb()` in a
`finally`. The only fixes needed:

- The breadcrumb stack is **the** source of truth for `TopBar` left.
  Remove path duplication from the viewport title (today
  `ViewportPane` sets `title={path()}` on a bordered box). This
  resolves **C3** by making the breadcrumb a single, prominent
  element instead of competing with a faint border title.
- Top-level menus that today bypass `runScreen` (Account flow,
  Developer › Raw API) must push their own crumb. The cleanest fix
  is to convert Account into a proper `Screen` (see §5); the
  developer raw-api flow can push `developer` on entry and pop on
  exit without becoming a full screen.

### 4.3 Interaction pane does NOT show the breadcrumb

Confirmed. One breadcrumb, one place. Resolves **C5** for paths.

---

## 5. Screen taxonomy

Every top-level menu item maps to a `Screen` (no more flat flows for
identity-bearing destinations). Each screen declares: a breadcrumb
segment, a viewport content type, and an action set.

| Screen (id) | Breadcrumb segment | Viewport content type | Verbs (interaction pane) |
|---|---|---|---|
| `home` (authed root) | — (path is `/`) | `record` — identity card + counts | Account · Projects · Developer · Sign out · Set API URL · Quit |
| `account` | `account` | `record` — profile + usage + AI settings | Edit profile · Update AI settings · Sign out |
| `projects` | `projects` | `table` — all projects (one row each) | Open `<name>` × N · New project · Refresh |
| `project-home` | `<slug>` | `record` — project meta + stats | Reports · Members · New report · Add member · Edit project · Delete project · Refresh |
| `reports` | `reports` | `table` — reports in project | Open `#N` × N · New report · Refresh |
| `report-home` | `<number>` | `record` — header + body preview + notes snippet | Add text note · Upload media · View notes · Regenerate · Finalize · Download PDF · Edit metadata · Delete · Refresh |
| `notes` | `notes` | `table` — all notes (kind · author · timestamp · snippet) | `Open <kind> "<snippet>"` × N · Add text note · Refresh |
| `note-action` | `<noteId>` | `record` — full note body | Edit · Delete |
| `members` | `members` | `table` — phone · name · role | `Remove <name>` × N · Add member · Refresh |
| `upload` | `upload` | `form-progress` — selected files + upload status | (form fields in interaction) |
| `credentials` (unauthed) | — (path is `/`) | `record` — "not signed in" + API URL | Sign in · Set API URL · Quit |
| `signin` | `signin` | `form-progress` — phone + OTP state | (form fields in interaction) |

**Content types** are the four `ViewportBody.kind` variants today,
relabelled and given templates in §6:

- `record` — keyed `field: value` rows, optionally with body
  sections (= today's `detail`).
- `table` — list of rows, each with structured columns (= today's
  `list`, *upgraded* to support columns rather than a single label
  + hint).
- `form-progress` — read-only mirror of the form being filled in
  the interaction pane (= today's `result`, generalised).
- `empty` — single placeholder line + a one-verb hint pointing at
  the action that creates the first item.

---

## 6. Concrete viewport templates

All templates use this rule: the **first row** of the viewport is
the screen's *headline* (rank 2 in §3) — a short sentence identifying
what we're looking at *without repeating the breadcrumb verbatim*.

### 6.1 `account` — `record`

```
Your account
Patrick Chen
+44 7700 900 123

profile
  display name   Patrick Chen
  phone          +44 7700 900 123
  created        2024-11-04

usage (this month)
  reports        12 of 50
  ai tokens      18,402

ai settings
  vendor         kimi
  model          k2-instruct
  fixtures       replay
```

- Empty state: never empty (account always exists).
- Emphasis: name + phone in `theme.fg`; section headers in
  `theme.fgMuted` lower-case.
- Resolves **C1**.

### 6.2 `projects` — `table`

```
12 projects · 2 drafts pending

  name                        role     reports  drafts  client
  Acme East Wing              owner    12       2       Acme Ltd
  Beech Refurb                editor    4       0       —
  Crown Heights               owner     0       0       Crown LLC
  …
```

- One row per project. Columns: `name`, `role`, `reports`,
  `drafts`, `client` (auto-collapsed when the pane is narrow:
  drop `client`, then `drafts`, then `reports`).
- Empty state: `"No projects yet — pick 'New project' to create
  the first one."`
- Resolves **C2**.

### 6.3 `project-home` — `record`

```
Acme East Wing (acme)
12 reports · 2 drafts · 5 members

  role       owner
  client     Acme Ltd
  address    44 Industrial Way, London
  created    2024-11-04
  last visit 2025-03-04

recent reports
  #12  draft     2025-03-04   Site inspection — east wall defects
  #11  final     2025-02-21   Foundation pour QA
  #10  final     2025-02-08   Steel delivery checklist
  …  (View all reports)
```

- Headline = project name + slug.
- Second line = stats summary (so the user sees scale before
  scrolling).
- "recent reports" is a 3–5 row preview; full list lives under
  `Reports` verb (which leads to `/projects/<slug>/reports`).

### 6.4 `report-home` — `record` with body section

```
Report #12 — Site inspection
Acme East Wing · draft · visit 2025-03-04

  status       draft
  visit date   2025-03-04
  created      2025-03-04 09:14
  generated    yes (kimi · k2-instruct · 2025-03-04 11:02)
  finalized    no
  notes        7

── Body ──
Site inspection of the east wall found three defects:
1. Cracking along the lintel above window 3 …
2. Efflorescence on the lower courses near …
3. Missing weep holes between bricks 4-6 …
(truncated — 1,402 chars total)

── Notes (7) ──
• voice  09:21  "We checked the north corner …"
• image  09:23  IMG_4823.jpg (1.2 MB)
• text   09:30  "Owner approved repair budget"
• …  (View all notes)
```

- Headline = `Report #N — <title>` (falls back to "Report #N" if
  no title).
- Body section: max 12 lines, truncate with `(truncated — N chars
  total)`.
- Notes section: max 5 rows, then `(View all notes)` muted hint.
- Resolves **C7** (report row).

### 6.5 `notes` — `table`

```
7 notes on report #12

  kind   author    time             snippet
  voice  Patrick   2025-03-04 09:21  "We checked the north corner …"
  image  Patrick   2025-03-04 09:23  IMG_4823.jpg
  text   Patrick   2025-03-04 09:30  "Owner approved repair budget"
  …
```

- Empty state: `"No notes yet — pick 'Add text note' or 'Upload
  media' to add the first one."`
- Resolves **C7** (notes row).

### 6.6 `members`, `upload`, `signin`, `credentials`

Follow the patterns above:

- `members`: `table` of phone · name · role.
- `upload`: `form-progress` mirroring the file paths the user has
  selected + per-file upload state (`queued` / `uploading 32%` /
  `done` / `failed: <reason>`). The form fields themselves
  (file path picker, kind selector) stay in the interaction pane.
- `signin`: `form-progress` — phone number once entered, OTP
  request state, OTP code field state.
- `credentials` (the unauthed root): `record` showing API URL,
  fixture mode, "not signed in" headline. Verbs: Sign in · Set
  API URL · Quit.

---

## 7. Interaction-pane labelling

### 7.1 No title on the bordered box

Today: `<box border title="action">`. Drop `title=`. The pane is
visually identified by being on the right with a border — that is
enough. Resolves **C6** (the outer label).

### 7.2 Suppress redundant `select` labels

`SelectList` should treat the prompt's `label` as a *helper line*
shown above the list, **and** suppress it entirely when:

- The label is the literal string `'Action'` (default chosen by
  `screen.ts` line 128), OR
- The label is the empty string.

For meaningful labels (e.g. "What kind of file?", "Choose a vendor"),
keep the label, rendered in `theme.fgMuted` (rank 4), so it never
out-shouts the breadcrumb. Resolves **C6** (the inner label).

### 7.3 Footer (rank 5)

The interaction pane's last row is the keymap hint, e.g.
`↑/↓ move · ↵ open · esc back · q quit`. It replaces the v4.1
status-bar keymap hint, which goes away with the status bar.

---

## 8. Data-model deltas (`apps/cli/src/tui/ui/store.ts`)

Minimal changes — the existing variants stay, two get extended:

```ts
// ── ViewportListItem grows columns ──
export interface ViewportListItem {
  readonly label: string;             // first column, primary
  readonly columns?: ReadonlyArray<string>;  // subsequent columns
  readonly hint?: string;             // collapsed-narrow fallback
}

// ── ViewportState loses logTail + title ──
export interface ViewportState {
  readonly headline?: string;         // rank-2 row
  readonly subline?: string;          // rank-3 summary line
  readonly body?: ViewportBody;
  // logTail removed — promoted to dedicated LogStrip slice
}

// ── New top-level UiState slice for the LogStrip ──
export interface UiState {
  topbar: { breadcrumb: ReadonlyArray<string>; identity: IdentityStrip };
  viewport: ViewportState;
  interaction: InteractionState;  // currentPrompt + inFlight + keymapHint
  log: LogEntry | undefined;       // newest only; null when no recent log
}

export interface IdentityStrip {
  readonly user?: string;          // "Patrick" or undefined
  readonly apiLabel: string;       // "prod" / "dev" / "localhost"
  readonly fixtureMode?: 'replay' | 'record' | 'live';
}
```

`headerLines` from today's `ViewportState` is split: the first line
becomes `subline`; the rest move into a dedicated first `detail`
section in `body`. This way the rank-2/rank-3 separation is
*data-driven*, not by-convention.

---

## 9. Pitfalls addressed (link by ID)

- **Pitfall 5 — async/race in auth flows.** No new `setTimeout` is
  introduced; identity changes flow through `Session` → `IdentityStrip`
  on the next render tick (Solid store), same as today. The signin
  screen stays `form-progress` so the OTP step renders as data, not
  via a fire-and-forget message.
- **Pitfall 10 — punted polish.** Every viewport template in §6
  ships with its screen in the same commit (see §11 — no
  "templates later" task). The migration plan has no "TODO
  redesign" gates.
- **Pitfall 13 — DI stubs become the spec.** The Solid widgets and
  the imperative `runScreen` driver continue to share the
  `Prompter` interface; scripted-prompter tests exercise the
  *same* code path the real OpenTUI render exercises. No new
  test-only branch.

---

## 10. What we explicitly do NOT do (carve-outs)

- **No scrolling in the viewport this commit-set.** If `body`
  overflows, it is hard-truncated with a muted `(truncated — N more
  lines)` line. Real scroll keys land in a follow-up tracked in
  [`plan-p3.md`](plan-p3.md) under "TUI viewport scrolling".
- **No mouse support.** Keyboard only.
- **No theming.** Single dark theme (`theme.ts` unchanged).
- **No structural change to `Screen` / `runScreen`.** The driver
  already supports `body()`; we widen the types it can return.
- **No change to the prompter contract.** All complaints are
  layout / hierarchy; no new prompt kinds needed.

---

## 11. Migration plan (commit-by-commit)

Each numbered item ≈ one commit. They are ordered so the tree is
visibly correct at each step — no "everything is broken until step
8" middles.

1. **docs(tui): add arch-tui-layout-v2.md** *(this commit)*. Mark
   v4.1 as superseded in its top matter; cross-link from
   `architecture.md` index row 11d.

2. **refactor(tui/store): split UiState into topbar / viewport /
   interaction / log slices.** Update `createUiStore`, the
   `viewport-sink`, and every screen's `setHeader` / `setBody`
   call-site to the new shape (mechanical). Tests for the store
   migrate to the new slices.

3. **feat(tui/ui): add TopBar component; remove StatusBar.**
   `TopBar` renders breadcrumb left (loud) + identity strip right
   (muted). `AppRoot` swaps the bottom-row `StatusBar` for a
   top-row `TopBar`. Delete `StatusBar.tsx`.

4. **feat(tui/ui): add LogStrip component (one-line, bottom row).**
   `AppRoot` mounts it. `UiStore.log()` now sets `state.log`
   directly (no tail, no cap > 1). Remove `logTail` rendering from
   `ViewportPane`.

5. **refactor(tui/ui): drop ViewportPane box title; drop
   InteractionPane box title.** No more `title="action"`, no more
   path-as-pane-title. Borders survive.

6. **feat(tui/ui): suppress 'Action' label in SelectList.**
   `SelectList` hides the label row when prompt label ∈ `{'Action',
   ''}`. Other labels render rank-4 muted above the list.

7. **feat(tui/screens): widen ViewportBody.list to support
   columns; add narrow-pane column-drop logic.** Update `projects`,
   `reports`, `notes`, `members` screens to emit column rows.

8. **feat(tui/screens): convert Account flow into accountScreen.**
   Delete `flows/account.ts` body (keep a one-line shim that calls
   `runScreen(accountScreen())`). New `screens/account.ts` fetches
   `me.get`, `me.usage`, `settings.ai.get` in parallel, renders the
   §6.1 template, pushes `account` breadcrumb. Verbs: Edit profile,
   Update AI settings, Sign out. *Resolves C1.*

9. **feat(tui/screens): home/credentials screens for the authed
   and unauthed roots.** Replace `stateViewportBody` in `app.ts`
   with two real screens so the top-level menu participates in
   the screen pipeline. The top-level menu becomes the verbs of
   `home`/`credentials` rather than a special-case `select`.

10. **feat(tui/screens): rewrite project-home, report-home, notes,
    projects, reports, members viewport templates per §6.** One
    commit per screen if the diffs are large; otherwise grouped.
    Each commit ships a vitest snapshot of the rendered store
    state (no PTY assertions needed at this layer).

11. **chore(tui): identity-strip API-label mapping.** Add
    `apiLabelFor(url)` in `tui/identity.ts` returning `'prod' |
    'dev' | 'localhost' | <hostname>`. Wired from `Session`.

12. **feat(tui): fixtureMode surfacing in LogStrip right.** Read
    `AI_FIXTURE_MODE` from env (already Zod-parsed) and render
    `· fixtures: replay` unless mode is `live`. Wired in
    `opentui-runner.ts` at boot.

13. **test(tui): scripted-prompter tests for every screen's
    rendered store snapshot.** One vitest file per screen under
    `apps/cli/src/__tests__/tui/screens/`. Existing PTY smoke
    tests assert the new layout (no `title="action"`, no duplicate
    "Signed in as", breadcrumb visible).

14. **docs(tui): mark arch-tui-layout.md fully superseded; update
    `architecture.md` row 11d label + description.** Add a short
    "see v2" pointer at the top of v1.

---

## 12. Open questions / carve-outs

- **Slug vs id in breadcrumb.** Today `projectsScreen` uses `p.id`
  as the breadcrumb segment because slugs aren't migrated yet
  (`design-p30-ids-slugs.md`). When slug migration lands, the
  `breadcrumb()` function picks `slug ?? id`. Tracked at
  [`design-p30-ids-slugs.md`](design-p30-ids-slugs.md) §"CLI/TUI
  consumers".
- **Scrolling.** Carved out — tracked in
  [`plan-p3.md`](plan-p3.md) "TUI viewport scrolling".
- **Pagination on `table` bodies.** First commit truncates at 50
  rows with `(truncated — N more)` muted hint. Real pagination
  ships with scrolling, same plan-p3 line.
- **Theme tokens.** No new tokens needed; if hierarchy reads
  weakly on light terminals we revisit `theme.ts` separately.
- **Developer › Raw API breadcrumb.** This commit-set teaches that
  flow to `pushBreadcrumb('developer')` on entry; converting it
  into a real screen is out of scope (it's a passthrough to the
  citty registry, not an information surface).
