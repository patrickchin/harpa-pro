# TUI v2 — `harpa tui` as a stateful app

> **Status:** design, not yet implemented. Successor to
> [`arch-tui.md`](arch-tui.md), which described the "flat wrapper around
> CLI commands" v1 that's shipped. v1's plumbing (`defineHarpaCommand`,
> `defineTuiEntry`, `Prompter`, `Session`, `performRequest`) stays — we
> add a state machine, a persisted credentials store, and a small flow
> layer on top of it.
>
> **Read first:** [`pitfalls.md`](pitfalls.md) (Pitfalls 5, 10, 13),
> [`arch-tui.md`](arch-tui.md), [`arch-cli.md`](arch-cli.md).

[arch-tui]: arch-tui.md
[arch-cli]: arch-cli.md
[pitfalls]: pitfalls.md

## 1. Problem statement

`harpa tui` v1 ships every citty leaf as a menu entry. The user-visible
consequence:

- Login is two leaves (`auth → Start OTP`, then `auth → Verify OTP`)
  with the user remembering the phone number between them.
- Authenticated commands appear in the menu before the user has a
  token — they 401 instead of being filtered out.
- The bearer lives in process memory only; quit the TUI and you re-do
  OTP next launch.
- "Open project X" means typing the slug into every subsequent leaf
  (project show, reports list, notes list, generate, …).

The brief asks for a state machine (config → auth → authed), a
persisted credentials file, a sign-in *flow* (not two leaves), context-
carrying flows on top of the raw leaves, and a token-validity check at
startup. The flag CLI's "no config file / 12-factor / env-only"
contract from `arch-cli.md` is **preserved** — this design only
touches `harpa tui`.

**Acceptance contract:**

1. `harpa tui` boots and computes a state ∈ `{config, auth, authed}`
   from (a) whether an API URL is known, (b) whether a stored token
   validates against `GET /me`.
2. Each state renders a constrained menu. The user is never shown a
   command they can't run.
3. Sign-in is a single guided flow (phone → start → code → verify → /me)
   that lands the user in the authed state with their identity in the
   header.
4. The bearer + API URL persist across `harpa tui` invocations in an
   OS-appropriate config file with `0600`/`0700` perms.
5. `GET /me` 401 on boot drops the file and transitions to auth state
   with a "session expired" notice — never silently shows an authed
   menu the API will refuse.
6. Authed users get **flows** (Open project → reports → report → notes)
   that carry context across calls, in addition to a "Developer / Raw
   API" submenu that exposes every citty leaf verbatim.
7. The default wiring (`clackPrompter`, default `credentialsStore`,
   default `validateToken`) is exercised by at least one real-disk
   real-API test (Pitfall 13).

**Canonical-source files this design touches:**
- `apps/cli/src/tui/index.ts` — boot, state machine entry.
- `apps/cli/src/tui/menu.ts` — per-state menu rendering.
- `apps/cli/src/tui/session.ts` — extend with `state`, `user`, `currentProject`, credentials handle.
- `apps/cli/src/tui/registry.ts` — partition leaves into "Raw API" and "subsumed by flow".
- New `apps/cli/src/tui/credentials.ts`, `apps/cli/src/tui/flows/*.ts`.
- New tests under `apps/cli/src/__tests__/tui/`.

The flag CLI (`apps/cli/src/index.ts`, `commands/*.ts`,
`lib/env-runtime.ts`) is unchanged.

## 2. Alternatives considered

### Alt A — Wrap the existing menu in a "logged-in?" gate

Boot, parse env, then ask "logged in? (y/n)" and either jump to OTP or
the current full menu. Persist token via `keytar` (OS keychain).

- **Pros:** Minimal code change. OS keychain is the obvious "right"
  place for a bearer.
- **Cons:** `keytar` is a native module — adds a build step (`prebuild`
  binaries per OS+arch) and breaks `pnpm i` in CI containers without
  the right runtime. We don't need keychain-grade secrecy: the file
  matches what `gh`, `aws`, `npm` ship, and it lives under a 0600 path
  the user controls. Also doesn't address the "flow vs leaf" problem
  — the menu is still flat. **Rejected.**

### Alt B — Rebuild the menu in Ink / blessed (full TUI canvas)

Adopt `ink` (React-for-CLI) or `blessed`, keep flows as components,
share renderers with the flag CLI but render through React.

- **Pros:** Real stateful UI; trivially supports a persistent header
  (user, current project), tabs, live refresh.
- **Cons:** Doubles the surface area we own. `@clack/prompts` was
  picked in arch-tui.md §2 for a reason (line-oriented, scriptable in
  tests, no TTY canvas). The state-machine + flows can be done inside
  the existing line-oriented prompter at a fraction of the cost.
  **Rejected** (re-evaluate post-v1 if demand for live dashboards
  surfaces).

### Alt C — State machine + flows on top of the existing prompter (chosen)

Keep clack + the existing `defineTuiEntry`/`HarpaCommand` machinery.
Add three things:

1. **A state machine.** `App` chooses a per-state menu rather than
   one flat list.
2. **A credentials store.** Plain JSON file, `0600`, behind a
   `CredentialsStore` interface (DI seam for tests; the default
   wiring is the disk-backed implementation and is covered by a
   real-disk test — Pitfall 13).
3. **A `Flow` concept.** Composable units that drive multiple
   prompts/requests inside a single menu entry and can mutate the
   session (set `currentProject`, etc.). Flows reuse each leaf's
   `execute()` factory — no duplicate API call code.

- **Pros:** All existing tests stay green. The plumbing already
  works; this design adds layers, not rewrites. Flag CLI untouched.
  Pitfall 13 already addressed by the existing pty smoke test —
  extending it to cover the credentials file is one line.
- **Cons:** `Flow` adds one more concept on top of `HarpaCommand`. We
  manage that by keeping flows *thin* (a flow's job is sequencing +
  context, not request construction).
- **Chosen.**

## 3. Design

### 3.1 State machine

```
                   ┌─────────────┐
                   │   Boot      │
                   └──────┬──────┘
                          │ parseEnvLoose()
                          │ credentialsStore.load()
                          ▼
        ┌──────────────────────────────────────┐
        │                                      │
        │   apiUrl?     no  ──►   [Config]    │
        │   yes                       │  Set API URL│
        │     │                       │  Quit       │
        │     ▼                       ▼             │
        │   token?     no  ──►    [Auth]           │
        │   yes                       │  Sign in    │
        │     │                       │  Set API URL│
        │     ▼                       │  Quit       │
        │   validate() (GET /me)      │             │
        │     │   401 ──► drop, ─────►│             │
        │     │           note        │             │
        │     ▼                                      │
        │   [Authed]                                 │
        │     Home (header: user + URL)              │
        │     Projects                               │
        │     Account                                │
        │     Developer › Raw API                    │
        │     Sign out                               │
        │     Quit                                   │
        └────────────────────────────────────────────┘
```

State stored on `Session`:

```ts
type AppState =
  | { kind: 'config' }
  | { kind: 'auth';   reason?: 'expired' | 'logged-out' | 'never' }
  | { kind: 'authed'; user: MeUser; currentProject?: ProjectRef };
```

Transitions are pure functions returned by menu actions / flows. The
main loop is:

```ts
let state = await bootState(prompter, session);
while (state.kind !== 'quit') {
  state = await renderState(prompter, session, state);
}
```

`bootState` runs the env parse + credentials load + token validation.
`renderState` dispatches to one of `configMenu`, `authMenu`, `authedMenu`,
each of which returns the next `AppState`.

### 3.2 Menu surface per state

#### Config — `state.kind === 'config'`
```
◇  No API URL configured for harpa tui.
│  > Set API URL
│    Quit
```
Successful URL set → `bootState` re-runs (try credentials for that URL).

#### Auth — `state.kind === 'auth'`
```
◇  Signed out — API: http://localhost:8787
│  > Sign in (phone OTP)
│    Set API URL
│    Quit
│  ⓘ Session expired — sign in again.  (only when reason='expired')
```

#### Authed — `state.kind === 'authed'`
```
◇  Signed in as Patrick Chin <+15551234567>  ·  http://localhost:8787
│  > Projects        Open a project / new project
│    Account         Profile, usage, AI settings
│    Developer       Raw API calls (debug)
│    Sign out
│    Quit
```

`Projects` is itself a flow with its own submenu — see §3.5.

### 3.3 Credentials store

**Path resolution** (`apps/cli/src/tui/credentials.ts`):

| OS       | Path |
|---       |---|
| macOS    | `~/Library/Application Support/harpa-cli/credentials.json` |
| Linux    | `${XDG_CONFIG_HOME:-~/.config}/harpa-cli/credentials.json` |
| Windows  | `${APPDATA}\\harpa-cli\\credentials.json` |
| Override | `HARPA_CONFIG_HOME=…` (used by tests + advanced users) |

Implementation hand-rolled (matches `env-paths` but doesn't add a
dep — three branches on `process.platform`). The override env var is
added to `CliEnv` in `lib/env.ts` as `HARPA_CONFIG_HOME` (optional
string).

**Schema** (Zod, versioned):

```ts
export const StoredCredentials = z.object({
  version: z.literal(1),
  apiUrl: z.string().url(),
  token: z.string().min(1),
  userId: z.string().optional(),         // populated from /me on save
  phone: z.string().optional(),          // for the auth header line
  displayName: z.string().optional(),
  savedAt: z.string().datetime(),
});
export type StoredCredentials = z.infer<typeof StoredCredentials>;
```

**Permissions:**
- Directory: `0700` on POSIX; created with `fs.mkdir(..., { recursive: true, mode: 0o700 })`. Windows: best-effort, no chmod.
- File: written via `fs.writeFile(path, json, { mode: 0o600 })`. After write, `fs.chmod(path, 0o600)` to handle pre-existing files. Windows: no chmod.
- On POSIX, if `stat.mode & 0o077 !== 0` at read time, warn via `prompter.log.warn(...)` ("credentials file is world-readable, rewriting"), then re-chmod to `0600` — never refuse to read.

**Lifecycle:**

| Trigger | Action |
|---|---|
| First-time launch, no file | `store.load()` returns `null`; state → `config` (or `auth` if env supplied a URL). |
| Successful sign-in flow | `store.save({ apiUrl, token, userId, phone, displayName, version:1, savedAt:now })`. |
| Authed boot, file exists | `store.load()` → `validateToken(client, apiUrl, token)` (= `GET /me`) → on success cache `user`; on 401 `store.clear()` + state → `auth(reason:'expired')`; on transport error stay in `auth(reason:'never')` and surface the error. |
| User picks Sign out | `POST /auth/logout` (best-effort) → `store.clear()` → state → `auth(reason:'logged-out')`. |
| User picks "Set API URL" while authed | New URL ≠ old → `store.clear()`; new URL == old → no-op. State re-enters boot. |
| File present, invalid JSON / Zod fail | `store.clear()`; `prompter.log.warn(...)`; state → `auth(reason:'never')`. |

**Flag CLI is unchanged.** It still reads `HARPA_TOKEN` from env via
`lib/env.ts`. There is no `harpa auth login --save` flag in v1; the
file is a TUI artefact only. (Future ADR can let `harpa` read it as
a fallback — explicit carve-out in §7.)

**DI seam:**

```ts
export interface CredentialsStore {
  load(): Promise<StoredCredentials | null>;
  save(c: StoredCredentials): Promise<void>;
  clear(): Promise<void>;
  /** Resolved absolute path, exposed for logging + tests. */
  readonly path: string;
}
export function diskCredentialsStore(opts?: { home?: string }): CredentialsStore;
export function memoryCredentialsStore(seed?: StoredCredentials): CredentialsStore; // tests only
```

Default wiring uses `diskCredentialsStore()`. Pitfall 13 defence: the
existing `pty.smoke.integration.test.ts` is extended to set
`HARPA_CONFIG_HOME=<tmpdir>` and assert the file is created with
`0600` after sign-in — the disk implementation is the default and is
covered by a non-stubbed test.

### 3.4 Token validation at boot

```ts
export async function validateToken(
  client: ApiClient,
): Promise<{ ok: true; user: MeUser } | { ok: false; status: number } | { ok: 'transport'; error: unknown }>;
```

Implemented by calling `meGetTui.execute({ client, env, args: { _: [] } }).request()`
and inspecting `performRequest`'s outcome. Reusing the existing
execute factory avoids re-encoding the `/me` route shape.

### 3.5 Flow vs leaf decisions

Every citty leaf is in **exactly one** of three buckets:

| Bucket | Behaviour |
|---|---|
| **Subsumed by flow** | Hidden from the authed top-level menu but reachable as a step inside a flow. *Still* reachable in `Developer › Raw API` for power users / debug. |
| **Raw-only** | Reachable from `Developer › Raw API` only. |
| **Hidden** | Not exposed in the TUI; only in the flag CLI. |

#### Flows (top-level menu entries when authed)

| Flow | Subsumes | Behaviour |
|---|---|---|
| **Sign in** (auth state) | `auth otp start`, `auth otp verify` | phone → POST start → code → POST verify → store creds → `/me` → authed. |
| **Sign out** (authed) | `auth logout` | Confirm → POST logout (errors ignored) → `store.clear()` → auth state. |
| **Projects › Open project** | `projects list`, `projects get`, `projects update`, `projects delete`, plus reports / notes / members sub-flows | Pick project from list → set `currentProject` → submenu. |
| **Projects › New project** | `projects create` | name, optional client/address → POST → "open now?" → either open or back. |
| **Open project › Reports** | `reports list`, `reports create`, `reports get`, `reports update`, `reports delete`, `reports generate`, `reports regenerate`, `reports finalize`, `reports pdf`, `notes list`, `notes create`, `notes update`, `notes delete` | Pick or create report (no slug retyping) → submenu (Show / Update / Notes / Generate / Regenerate / Finalize / PDF / Delete). Notes is itself a sub-menu over the report's notes. |
| **Open project › Members** | `projects members list`, `projects members add`, `projects members remove` | List → add/remove inline. |
| **Account** | `me get`, `me update`, `me usage`, `settings ai get`, `settings ai set` | Show / Update profile / Usage / AI vendor+model. |
| **Upload a file** (Projects › … › Report) | covers what flag-CLI `files upload` does, plus auto-create-note (Pitfall 8 shape) | pick kind → pick local path → `files presign` → `PUT` to R2 → `files register` → optionally `POST /reports/{}/notes`. Reuses the existing `files upload` flag-CLI handler internals; this is the leaf that v1 explicitly opted out of (`tui_OPTED_OUT`) — now a flow. |

#### Raw-API leaves (under `Developer › Raw API`, grouped)

Every leaf currently in `tuiEntries`, **plus `files upload`**. The
`Developer` submenu groups by `tuiSpec.group` (the existing field) and
preserves v1's UX exactly. This is the "I want to poke endpoint X
directly" surface; useful for debugging fixture replay, contract
breakage, and AI-driven scripted exploration.

#### Hidden (TUI does not show)

Currently: none. `health` stays visible as a Raw-API leaf and is also
called silently by `bootState` if we ever want a connectivity probe
(not in v1).

**Why keep the Raw API at all?** Because (a) the v1 surface already
exists and works, (b) flows can never cover every shape (e.g.
`voice transcribe` against a fileId outside any report), and (c) it's
the canonical place to confirm an endpoint's wire behaviour without
inventing a flow first. It's a "Developer" submenu, not the top
level — non-debug users won't notice it.

### 3.6 `HarpaCommand` / `defineTuiEntry` / registry changes

**`TuiSpec`** gains one optional field:

```ts
export interface TuiSpec<A extends ArgsDef> {
  // … unchanged fields …
  /**
   * Where this leaf shows up in the v2 TUI. Defaults to 'raw' (visible
   * in Developer › Raw API). 'flow-only' means the leaf is reachable
   * only as a step inside a Flow — not in the Raw API menu. Used to
   * de-duplicate when a flow fully replaces a leaf (e.g. the upload
   * flow IS the only way to call files upload — but presign/register
   * stay 'raw' because they're also useful standalone).
   */
  surface?: 'raw' | 'flow-only';
}
```

Default is `'raw'`. v2's `Developer › Raw API` menu filters
`tuiEntries` by `surface !== 'flow-only'`.

**`Session`** extends:

```ts
export interface Session {
  readonly env: CliEnv;
  readonly credentials: CredentialsStore;          // new
  state: AppState;                                  // new (mutable)
  setApiUrl(url: string): void;                     // existing; also clears creds if url changes
  setAuth(creds: StoredCredentials, user: MeUser): Promise<void>;  // writes file
  clearAuth(): Promise<void>;                       // deletes file, state → auth
  setCurrentProject(p: ProjectRef | undefined): void;
  effectiveEnv(): CliEnv;                           // existing, now reads creds for token
}
```

**`registry.ts`** stays the source of truth for leaves. It exposes:

```ts
export const registry: ReadonlyArray<AnyHarpaCommand>;     // unchanged
export function rawApiGroups(): ReadonlyArray<MenuGroup>;  // filtered by surface
```

A new `apps/cli/src/tui/flows/` directory exports a typed `Flow`
shape:

```ts
export type FlowResult =
  | { kind: 'stay' }                                       // re-render same state
  | { kind: 'transition'; to: AppState }
  | { kind: 'pop' };                                       // back one level

export interface Flow {
  id: string;                                              // for tests
  label: string;
  hint?: string;
  /** Which states may show this entry. */
  visibleIn: ReadonlyArray<AppState['kind']>;
  run(ctx: { prompter: Prompter; session: Session }): Promise<FlowResult>;
}
```

Concrete flows: `signIn`, `signOut`, `setApiUrl`, `openProject`,
`newProject`, `account`, `developerRawApi`. Each lives in its own
file under `flows/` and is unit-tested with the scripted prompter.

**`menu.ts`** is rewritten as a thin `App` driver:

```ts
export async function runApp(prompter: Prompter, session: Session): Promise<void>;
```

It walks `session.state`, builds a `select` over the flows whose
`visibleIn` includes the current state kind, runs the chosen flow,
applies its `FlowResult`, and loops.

**`execute.ts`** is unchanged — it's still the per-leaf renderer used
by `developerRawApi` and (internally) by some flows.

### 3.7 Failure modes (Pitfall 5 echo — no `setTimeout`, no fire-and-forget)

| Symptom | Handling |
|---|---|
| Credentials file unreadable (EACCES) | `store.load()` returns `null` + `prompter.log.warn`. State → `config`/`auth`. |
| Credentials file JSON / Zod invalid | Same as above + `store.clear()`. |
| `/me` returns 401 on boot | `store.clear()`; state → `auth(reason:'expired')`. |
| `/me` transport error (DNS, refused) | Stay in `auth(reason:'never')`; surface `formatTransportMessage`; menu still offers `Set API URL`. |
| Sign-in flow: OTP start fails | Render API error inline; back to start of flow; loop continues. |
| Sign-in flow: OTP verify fails | Render API error inline; re-prompt for code (no re-send) up to 3 tries; then back to auth menu. |
| Sign-out POST fails | Still clear local creds; surface "server said: …" but transition to auth state. (Local sign-out is the user's intent.) |
| Ctrl-C inside a flow | Returns to the flow's parent menu — never exits the process except from the top-level `auth`/`config`/`authed` `select`, where Ctrl-C = "Quit". |

All awaited, no timers.

## 4. Pitfalls addressed

| Pitfall | How |
|---|---|
| [5](pitfalls.md#pitfall-5--auth-glue-done-late-env-handling-brittle) | Sign-in is a single awaited flow: `start → verify → save → /me`. No `setTimeout`. Env still through `lib/env.ts` Zod parse. The token is validated at boot — no "auth glue retrofitted later". |
| [10](pitfalls.md#pitfall-10--coverage--docs--tests-in-p5p6p7-instead-of-inline) | Each implementation step in §6 ships its own tests + amends this doc + crosslinks. No deferred polish. |
| [13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken) | The default `diskCredentialsStore` is exercised by the extended pty smoke test (real disk, real chmod, real `0600`). The default `validateToken` runs the real `/me` request against the in-process Hono app in behaviour tests. `memoryCredentialsStore` is for branch tests only. |
| [8](pitfalls.md#pitfall-8--upload-pipeline-missed-timeline-integration) | The `Upload a file` flow ends in `POST /reports/{}/notes` for all kinds, mirroring the mobile contract. Integration test exercises all four (`voice`/`image`/`document`/`pdf`) for the TUI flow specifically. |

## 5. Test plan

| Layer | File | Asserts |
|---|---|---|
| Unit | `__tests__/tui/credentials.test.ts` | Path resolution per platform (`process.platform` mocked). `save` then `load` round-trip. `0600`/`0700` mode on POSIX. Invalid JSON → `clear` + `null` + warn. Schema-mismatch → same. `HARPA_CONFIG_HOME` override. |
| Unit | `__tests__/tui/state-machine.test.ts` | `bootState` decisions: (a) no URL → `config`; (b) URL + no file → `auth`; (c) URL + file + `/me` 200 → `authed` with user populated; (d) URL + file + `/me` 401 → `auth(expired)` + file cleared; (e) URL + file + transport error → `auth(never)` + file kept. Each branch uses `memoryCredentialsStore` and a stub fetch. |
| Behaviour | `__tests__/tui/flows/sign-in.test.ts` | Scripted prompter drives the full sign-in flow against the in-process Hono app + Twilio fixtures. Asserts file written + state `authed` + user matches `/me`. |
| Behaviour | `__tests__/tui/flows/sign-out.test.ts` | From `authed` → Sign out → confirm → POST hits API, file deleted, state `auth(logged-out)`. Also: POST fails → file still deleted. |
| Behaviour | `__tests__/tui/flows/open-project.test.ts` | Pick project, drill to reports, generate (replay fixture), back to report, back to project, back to authed menu. No re-typing of slug or report number across steps. |
| Behaviour | `__tests__/tui/flows/upload.test.ts` | All four kinds (`voice`/`image`/`document`/`pdf`); each ends with a note row in the report's notes list (Pitfall 8 echo). |
| Registry | `__tests__/tui/registry.test.ts` | (existing, updated) — every citty leaf appears either in `tuiEntries` *or* in `TUI_HIDDEN` with a comment naming the flow that subsumes it. `files upload` flips from `TUI_OPTED_OUT` → covered by `signInUploadFlow`. |
| Default wiring | `__tests__/tui/pty.smoke.integration.test.ts` | (existing, extended) — sets `HARPA_CONFIG_HOME=<tmpdir>`, drives main → Sign in → submit → main, then asserts `<tmpdir>/credentials.json` exists with mode `0o100600` and parses against `StoredCredentials`. This is the Pitfall-13 defence for the **disk** store. Then exits and re-launches the same process; asserts boot lands directly in `authed` (no second OTP). |
| Help drift | `__tests__/tui/help.snapshot.test.ts` | Updated snapshot for the new `harpa tui --help` (one line about the persisted credentials path). |

Coverage gate: existing `≥ 80% lines` over `apps/cli/src/tui/**`
applies to the new `tui/flows/**` and `tui/credentials.ts`.

## 6. Implementation checklist (one commit each)

> **Status: all 11 steps shipped** on `feat/tui` (commits TUI-app.0
> through TUI-app.10). Steps 6/7 (projects + reports) shipped as a
> single combined "Projects" submenu rather than a richer
> `currentProject`-carrying drill-down — the drill-down is tracked as
> a follow-up; today the leaves still prompt for project + report
> individually. Step 8 (upload) shipped as a submenu wrapping
> `files presign/register/url` + `voice transcribe/summarize`; the
> richer multi-step "path → presign → R2 PUT → register → auto-note"
> flow is also a follow-up.

Each step ships its own tests + doc edits. No "tests later" step.

1. **TUI-app.0 — `CredentialsStore` interface + disk impl + tests.** ✅
   New `tui/credentials.ts`. Adds `HARPA_CONFIG_HOME` to `lib/env.ts`
   (optional). Unit tests cover platform-path resolution (mock
   `process.platform`), Zod round-trip, file mode, env override,
   corrupt-file recovery. No menu changes yet.
   `feat(cli): add disk-backed credentials store for harpa tui`

2. **TUI-app.1 — Extend `Session` with `state` + auth helpers.** ✅
   `setAuth`, `clearAuth`, `setCurrentProject`. `setApiUrl` clears
   creds on URL change. Unit tests with `memoryCredentialsStore`.
   `refactor(cli): extend Session with state + credentials helpers`

3. **TUI-app.2 — `bootState` + `validateToken`.** ✅
   New `tui/state.ts`. Reuses `meGetTui.execute(...)` for `/me`. Unit
   tests cover the five boot branches against a stub fetch.
   `feat(cli): compute tui state at boot (config/auth/authed)`

4. **TUI-app.3 — `Flow` shape + state-aware menu driver.** ✅
   Rewrite `tui/menu.ts` as `runApp`. Stub flows that just `log.info`
   their label, with `visibleIn` filtering. No behaviour change for
   v1 yet (only `developerRawApi` flow wraps the old menu).
   `refactor(cli): introduce flow-driven state machine for tui`

5. **TUI-app.4 — Sign-in / Sign-out flows.** ✅
   `tui/flows/auth.ts`. Behaviour tests against `vi.stubGlobal('fetch')`.
   The `auth otp …` leaves stay `surface: 'raw'` for debug access.
   `feat(cli): tui sign-in / sign-out flows replace flat auth menu`

6. **TUI-app.5 — `Account` flow.** ✅
   `tui/flows/account.ts` + `tui/flows/_submenu.ts` helper. Wraps the
   `me`/`settings` leaves into a single Account submenu.
   `feat(cli): tui account flow (profile, usage, ai settings)`

7. **TUI-app.6 + .7 — `Projects` flow umbrella (projects + members + reports + notes).** ✅
   `tui/flows/projects.ts`. Shipped as a single grouped submenu over
   the projects/members/reports/notes leaves. The richer
   `currentProject`-carrying drill-down (open-project sub-menu that
   prefills project id into nested prompts) is a deferred follow-up.
   `feat(cli): tui projects flow (projects, members, reports, notes)`

8. **TUI-app.8 — `Upload / Media` flow.** ✅
   `tui/flows/upload.ts`. Submenu over `files presign / register /
   url` + `voice transcribe / summarize`. The richer multi-step
   "path → presign → R2 PUT → register → auto-note for all four
   kinds" flow is a deferred follow-up (the `files upload` leaf
   doesn't exist yet).
   `feat(cli): tui upload flow groups files + voice helpers`

9. **TUI-app.9 — Persistence + extended pty smoke (default wiring).** ✅
   Two tests: `__tests__/tui/persistence.integration.test.ts` (fast,
   non-PTY: save → bootState round-trip + 401/transport branches),
   plus the extended `pty.smoke.integration.test.ts` (mock API now
   serves OTP + `/me`; drives real clackPrompter through sign-in →
   Developer › Raw API → health, asserts `0600` on the credentials
   file). This is the Pitfall-13 defence covering disk store + clack
   prompter + `/me` validation together.
   `test(cli): tui persistence + extended pty smoke (pitfall-13)`

10. **TUI-app.10 — Docs + cross-links.** ✅
    Update `arch-cli.md` "TUI quickstart" (persisted credentials path,
    new flow surface). Update `README.md` blurb. Update
    `scripts/check-cli-help-drift.sh` reference. This document marks
    all 11 steps shipped.
    `docs(cli): cross-link arch-tui-app and update tui quickstart`

Steps 1–4 are mechanical and independent; 5–8 are user-facing flows
that can each be reviewed standalone. Step 9 is the gate.

## 7. Open questions / carve-outs

1. **Flag CLI reading the credentials file.** Out of scope. `harpa`
   stays env-only (matches `arch-cli.md` non-goal). If demand
   surfaces, a future ADR can add a `--use-stored` flag or a
   fallback. *Carve-out recorded here, not in a plan-doc.*
2. **Multiple profiles (`harpa tui --profile staging`).** Out of
   scope. The file holds one `{apiUrl, token}`. Multi-profile is a
   straightforward extension (`<config>/profiles/<name>.json`) but
   not needed in v1.
3. **OS keychain.** Out of scope (see §2 Alt A rationale). The 0600
   file is the v1 store. A keychain-backed `CredentialsStore` is a
   drop-in DI swap if we ever want it.
4. **Token refresh.** Better-auth issues long-lived bearers; there's
   no refresh flow today. When/if we add expiry-aware tokens, the
   `validateToken` hook is the right place to call a refresh
   endpoint before returning `ok:false`. Tracked alongside the
   better-auth doc, not here.
5. **Headless / scripted TUI.** Out of scope (and arguably an
   anti-feature — the flag CLI is the scripted surface). The
   `scriptedPrompter` is a test-only DI seam, not a public API.
6. **`harpa auth logout` flag command behaviour with the file.**
   Currently the flag command only revokes the server-side token. It
   does **not** touch the TUI credentials file (the flag CLI has no
   knowledge of it). Document this in `arch-cli.md` when TUI-app.10
   lands so users aren't surprised that `harpa auth logout` leaves
   the TUI logged in. If we later want symmetry, the flag command
   gains an opt-in `--clear-tui-creds` flag — explicit carve-out.

---

*See `arch-tui.md` for the v1 (flat shell) design that this doc
supersedes for `harpa tui` behaviour. The `defineHarpaCommand` /
`defineTuiEntry` / `Prompter` / `performRequest` contracts described
there remain authoritative for the leaves themselves.*
