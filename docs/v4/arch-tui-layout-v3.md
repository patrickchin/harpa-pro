# TUI v4.3 — two-pane layout, per-breadcrumb spec

> **Status:** active. Supersedes
> [`arch-tui-layout-v2.md`](arch-tui-layout-v2.md) (the ranger
> Miller-columns experiment landed in commit `49b0092` and was
> reverted here).

## Philosophy (one line per pane)

- **Left (Viewport, 2fr) — "what's here".** Read-only. Renders the
  resource at the current breadcrumb. Dense; uses the whole pane.
- **Right (Interaction, 1fr) — "what you can do here".** Focused.
  Verbs only. No identity, no breadcrumb, no log.
- **TopBar (1 line, top).** Breadcrumb left, `user · apiLabel` right.
  *Identity is here, nowhere else.*
- **LogStrip (1 line, bottom).** Last log entry + fixture mode.

**Ranger-style preview is kept.** As `j`/`k` moves the highlight in
the right pane, the **left pane updates** to show the highlighted
item's preview. When focus is on a non-previewing row (e.g. "New
report", "Refresh", "← back") the left pane reverts to the screen's
**default body** (defined below for each breadcrumb).

Keys (unchanged from v4.2): `j`/`k` move · `l`/`↵` drill in · `h`/Esc
back · `ctrl-c` quit · `?` help · `q` quit.

---

## Per-breadcrumb spec

For each breadcrumb: **headline** (rank 2, first line of viewport),
**subline** (rank 3, second line), **default body** (when no
previewable action is highlighted), and **actions** (right pane).
Previewable actions also show their `preview()` body in the left
pane while highlighted.

### `/` (signed in)

| Slot | Content |
|---|---|
| Headline | `Signed in as <user>` |
| Subline | `<N> projects · <M> reports across all projects` |
| Default body | **Recent activity** — 3 most-recently-updated projects (name · role · updatedAt relative) + 3 most-recently-updated reports (#num · project · status · updatedAt). One short section each. |
| Right pane | Account · Projects · Developer › Raw API · Sign out · Set API URL · Quit |
| Previews | Account → preview of account headline. Projects → preview of "/projects" body (project list). |

### `/` (not signed in, `signin` screen)

| Slot | Content |
|---|---|
| Headline | `Not signed in` |
| Subline | `Connected to <apiLabel> (<host>)` |
| Default body | Two-section detail: **Setup** ("1. Sign in with phone OTP / 2. Land on /") and **Connection** (api url, fixture mode). |
| Right pane | Sign in · Set API URL · Quit |

### `/` (no credentials, `credentialsScreen`)

| Slot | Content |
|---|---|
| Headline | `Setup required` |
| Subline | `Missing HARPA_API_URL` (or whatever) |
| Default body | **Setup** section with the env-var checklist + a **Connection** section. |
| Right pane | Set API URL · Sign in (disabled if no api url) · Quit |

### `/account`

| Slot | Content |
|---|---|
| Headline | `Your account` |
| Subline | `<displayName> · <phone>` |
| Default body | Three sections — **Profile** (name, phone, locale, joined), **Usage (this month)** (reports, notes, tokens), **AI settings** (default vendor, model). All fields shown by default; no drilldown to see them. |
| Right pane | Edit profile · Update AI settings · Refresh · ← back |
| Previews | Edit profile → form-shape preview ("you'll be asked: name, locale"). Update AI settings → current settings as preview. |

### `/projects`

| Slot | Content |
|---|---|
| Headline | `Projects (<N>)` |
| Subline | `<M> reports · <K> draft · sorted by recent` |
| Default body | **Full project list** as mobile-style cards (one detail section per project): `name [ROLE]`, lines for client, address, reports count, updatedAt relative, slug. Sorted by `updatedAt` DESC. |
| Right pane | `Open <name>` per project · New project · Refresh · ← back |
| Previews | Each `Open <name>` → single-project detail card (same shape used today). |

### `/projects/:slug` (project-home)

| Slot | Content |
|---|---|
| Headline | `<project name>` |
| Subline | `[ROLE] · client · address` |
| Default body | Four sections — **Details** (full metadata), **Reports (<N>)** (mini-list: #num · status · visit · updated, up to 10, "… and X more" if truncated), **Members (<M>)** (mini-list: name · role · joined), **Activity** (last 3 events: report created/finalized, member added). |
| Right pane | Reports · New report · Members · Add member · Edit project · Delete project · Refresh · ← back |
| Previews | Reports → full reports body (see `/…/reports` default). Members → full members body. New report → "you'll be asked: title, visit date" preview. |

### `/projects/:slug/reports`

| Slot | Content |
|---|---|
| Headline | `Reports — <project name>` |
| Subline | `<N> reports · <K> draft · <F> finalized · sorted by visit date` |
| Default body | **Full report list** as detail cards: `#<num> — <title>`, lines for status, visit date, generated yes/no, notes count, created/finalized timestamps. |
| Right pane | `Open #<num> (<status>)` per report · New report · Refresh · ← back |
| Previews | Each `Open #<num>` → single-report detail card with status/visit/created/finalized + body snippet (already implemented). |

### `/projects/:slug/reports/:id` (report-home)

| Slot | Content |
|---|---|
| Headline | `Report #<num> — <project>` |
| Subline | `<status> · visit <date> · <N> notes` |
| Default body | Three sections — **Details** (title, visit date, generated y/n, finalized timestamp, ai vendor/model), **Body** (full body text if generated, else placeholder), **Notes (<N>)** (mini-list: kind · headline, up to 10). |
| Right pane | Add text note · Upload media · View notes · Regenerate/Generate · Finalize · Download PDF · Edit metadata · Delete report · Refresh · ← back |
| Previews | View notes → full notes body. Regenerate/Generate → "vendor=kimi, model=…" preview. Download PDF → "saves to ~/Downloads/report-12.pdf" preview. |

### `/projects/:slug/reports/:id/notes`

| Slot | Content |
|---|---|
| Headline | `Notes — report #<num>` |
| Subline | `<N> notes (<voice> voice · <image> image · <text> text)` |
| Default body | **Full note list** as detail cards (one section per note): kind+createdAt as title, body lines for full text / transcript / file info / vendor metadata. |
| Right pane | `<n>. <head>` per note (drill into note detail) · Add text note · Refresh · ← back |
| Previews | Each note row → full note card (the detail it already builds at L103). |

### `/projects/:slug/members`

| Slot | Content |
|---|---|
| Headline | `Members — <project name>` |
| Subline | `<N> members (<owners> owners · <viewers> viewers)` |
| Default body | **Full member list** as detail cards: `displayName [ROLE]`, lines for phone, joined date, last active. |
| Right pane | `Remove <name>` per member · Add member · Refresh · ← back |
| Previews | Each `Remove <name>` → that member's card. Add member → "you'll be asked: phone, role" preview. |

### `/upload` (only reachable when a report is "current")

| Slot | Content |
|---|---|
| Headline | `Upload to report #<num>` |
| Subline | `<project name> · accepted: jpg/png/m4a/pdf` |
| Default body | Empty hint: "Pick **Upload a file** on the right to choose a local file. The file becomes a note attached to this report." |
| Right pane | Upload a file · ← back |

---

## Cross-cutting rules (enforced)

1. **No identity in any viewport body** (it lives in TopBar). Exception:
   pre-auth `signin`/`credentials` screens where the connection IS the
   subject.
2. **Every drill-down screen renders meaningful content on entry** —
   no "Pick an action" filler. The default body must answer the
   question "what's here?" with the actual resource.
3. **Every multi-row action (`Open X`, `Remove Y`, note items) has a
   `preview()`** that shows the full per-item card in the left pane
   while highlighted.
4. **Single-shot actions (`Refresh`, `New …`, `← back`) restore the
   screen's default body** when highlighted — never blank, never
   leftover from the previous highlight.
5. **`Refresh` is implicit** on every screen and stays at the bottom of
   the action list above `← back`.

## What changes vs. v4.2

- Remove the ranger Parent pane. Restore the 2-pane split.
- Keep `preview()` + `onHighlight` wiring. Keep `ParentFrame` infra
  unused (or revert in same commit; cleaner to revert).
- Wire previously-missing previews on Account, project-home actions,
  notes, members, upload.
- Enrich default bodies to match the table above (project-home gets
  Activity section; report-home gets Body inline; notes/members get
  full lists instead of relying on action list alone).

## Implementation order (when approved)

1. Revert v4.2 Miller layout (drop ParentPane, restore 2-pane
   AppRoot, remove `ParentFrame`/`pushParentFrame`/`popParentFrame`).
2. Update `arch-tui-layout-v2.md` → save this doc as
   `arch-tui-layout-v3.md`; mark v2 superseded.
3. Per-screen viewport + preview updates: home, account, projects,
   project-home, reports, report-home, notes, members, upload (one
   commit per screen so each is reviewable).
4. Re-run unit + integration; PTY smoke must still pass.

## Resolved decisions

- **Project-home Activity section** — DROPPED. No audit-log endpoint
  exists. Project-home body is **Details + Reports + Members** only.
- **Notes subline breakdown** — computed client-side from the list.
- **Account "Usage (this month)"** — render `—` lines until an
  endpoint exists; do not block delivery.
