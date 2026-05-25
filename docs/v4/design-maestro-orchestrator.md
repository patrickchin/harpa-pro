# Maestro orchestrator (`mo`) — design

> **Status:** design only. No code lives in `tools/maestro-orchestrator/`
> yet — Phase 3a deliverable. Phase 3b will produce the
> `scripts/maestro/*` inventory this design references.
>
> **Phase:** P4 hardening tooling. Wraps the journey defined in
> [`design-maestro-full-regression.md`](design-maestro-full-regression.md).
>
> **Pitfalls driving design:**
> [windows#1, #12, #15, #17, #18, #19, #20](pitfalls-maestro-windows.md),
> [mac#1, #6, #7](pitfalls-maestro-mac.md).
>
> **Working name:** `mo`. Standalone, single-binary-feeling CLI for
> orchestrating Maestro runs of `.maestro/regression-journey.yaml` and
> its sibling flows across Windows + Android device and macOS + iOS
> Simulator.

---

## 1. Goals and non-goals

### Goals

- **One CLI, two hosts.** Same commands run on Windows-pwsh (real
  Samsung over ADB) and macOS-zsh (iPhone Simulator). No host-specific
  wrapper scripts.
- **Bash-tool friendly.** Every subcommand returns control to the
  caller in **<5 seconds**. Long-running Maestro work is spawned
  detached, with a known PID file and log file. Polling is a separate
  fast subcommand. Hard-codes around the opencode bash tool 120 s
  timeout (Pitfall windows#12).
- **Single source of truth for reset.** `mo reset` replaces the
  hand-rolled `docker exec … psql … TRUNCATE …` + `adb shell pm
  clear …` sequence from Pitfall windows#15. One command, both halves,
  correct order, cross-platform device-clear.
- **Pitfall-aware preflight.** `mo doctor` catches the recurring
  failure modes (ADB reverse dropped, orphaned `java` / Maestro
  driver, Metro/API down, simulator not booted, missing env) **before**
  a journey burns 20 minutes failing on step 3.
- **No imports from the monorepo.** Lives at
  `tools/maestro-orchestrator/`, managed by `uv`. Not in the pnpm
  workspace. Independently installable so we can `uv tool install
  ./tools/maestro-orchestrator` and ship the binary wherever Maestro
  runs.
- **Reuse, don't reimplement.** Existing `scripts/maestro/*` helpers
  that do the right thing get shelled out from `mo`. The orchestrator
  is the front door, not a rewrite.

### Non-goals

- **Not a Maestro replacement.** `mo run` still shells out to the
  real `maestro` CLI. We're not parsing YAML or reimplementing the
  runner.
- **Not a CI runner.** GitHub Actions still drives the
  `e2e-maestro-regression.yml` workflow. `mo` is for local + ad-hoc
  use; CI can call `mo` if convenient but does not depend on it.
- **Not a build tool.** `mo` does not build the dev-client APK / IPA,
  does not invoke EAS, does not start Metro. It checks they're up
  and fails loud if not.
- **Not a fixture authoring tool.** Recording AI / R2 / Twilio
  fixtures stays with the existing `harpa` CLI + fixture skill
  (`.opencode/skills/cli-fixture-testing/`).
- **No "smart resume."** Per Pitfall windows#13, partial-journey
  re-runs are explicitly unsupported. `mo` always runs from a known
  reset baseline.

---

## 2. Directory layout

```
tools/maestro-orchestrator/
├── pyproject.toml              # uv-managed, Python 3.11+
├── uv.lock                     # committed
├── README.md                   # quickstart + command reference
├── src/
│   └── mo/
│       ├── __init__.py
│       ├── __main__.py         # python -m mo entry
│       ├── cli.py              # typer app + subcommand registration
│       ├── config.py           # env discovery, config-file loader, paths
│       ├── host.py             # platform detection (win/mac/linux)
│       ├── devices/
│       │   ├── __init__.py
│       │   ├── android.py      # adb wrapper (reverse, pm clear, devices)
│       │   └── ios.py          # xcrun simctl wrapper (boot, uninstall, list)
│       ├── procs.py            # PID-file management, psutil-based kill
│       ├── logs.py             # tmp/ log discovery, tailing, rotation
│       ├── healthcheck.py      # httpx-based pings for Metro + API
│       ├── reset.py            # DB truncate + device app-data clear
│       ├── commands/
│       │   ├── __init__.py
│       │   ├── doctor.py
│       │   ├── reset.py
│       │   ├── run.py
│       │   ├── journey.py
│       │   ├── kill.py
│       │   └── logs.py
│       └── _shell.py           # subprocess helpers (no pwsh/bash shelling)
└── tests/
    ├── conftest.py
    ├── test_config.py
    ├── test_host.py
    ├── test_procs.py
    ├── test_logs.py
    ├── test_reset.py
    ├── test_doctor.py
    └── fixtures/
        └── ...                 # canned `adb devices` output, etc.
```

Installable via:

```bash
uv tool install ./tools/maestro-orchestrator   # exposes `mo` on PATH
# or, for development:
uv run --project tools/maestro-orchestrator mo doctor
```

No dependency on the monorepo's `pnpm` / `node_modules`. The tool
discovers the project root by walking up from `cwd` until it finds
`pnpm-workspace.yaml` (overridable with `HARPA_PROJECT_ROOT`).

---

## 3. Language and library choices

### Language: Python 3.11+

| Option | Verdict | Reason |
|---|---|---|
| **Python 3.11+** | ✅ chosen | Already used by the `cli-fixture-testing` skill author tooling. `psutil` is the gold standard for cross-platform PID handling. `typer` gives us nice CLIs for free. Available on every dev box. |
| Node/TypeScript | rejected | Would pull the tool into the pnpm workspace by gravity, then start importing from `packages/*`. We explicitly want a wall between orchestration and the app code. Also: cross-platform process management in Node is `tree-kill` + luck. |
| Go | rejected | Compiles to a static binary, which is appealing, but cross-platform device commands are still shelling to `adb` / `xcrun simctl` — Go gives us no leverage there, and the dev loop (edit → recompile → run) is slower than Python. Also nobody else in the repo writes Go. |
| Rust | rejected | Same as Go, plus higher cost-to-change for what is fundamentally a process-orchestration script. |
| Deno | rejected | Solves the "TS without node_modules" problem but adds a runtime nobody currently has installed, and `psutil` equivalents are weaker. |
| pwsh module | rejected | Cross-platform-ish since pwsh 7, but Mac dev experience is bad and we'd be writing two largely-parallel implementations anyway. |

### Libraries

| Package | Why |
|---|---|
| `typer` (≥ 0.12) | CLI declaration with type hints. Subcommand registration, auto `--help`, exit codes. Pluggable. Lighter than Click for our surface. |
| `rich` (≥ 13) | Tables for `mo doctor` output, colourised pass/fail, nice tracebacks. Optional via `--plain` for CI/log parsing. |
| `psutil` (≥ 5.9) | Cross-platform process enumeration + termination. The only sane way to find orphaned `java -jar maestro.jar` / `maestro-driver-ios` processes on both hosts. |
| `httpx` (≥ 0.27) | Async-capable HTTP for Metro (`http://localhost:8081/status`) and API (`http://localhost:8787/health`) healthchecks. Stdlib `urllib` would also work; `httpx` gives us timeouts + better errors for ~30KB. |
| `pydantic` (≥ 2.7) | Config validation (env + config file). Match the pattern from `lib/env.ts` — fail fast at boot. Optional; could use `dataclasses` + manual validation, but Pydantic is one line per field. |
| `pytest` + `pytest-mock` | Test runner. |

**Rejected: `click`** — typer wraps click and gives us the same surface with type hints. **Rejected: `argparse`** — fine for two commands, painful for six with shared options. **Rejected: `sh` / `plumbum`** — we want explicit subprocess calls, not magical shell DSLs.

---

## 4. Command-by-command spec

All commands obey these rules unless noted:

- Return in **< 5 s wall-clock** (the bash-tool 120 s rule, with headroom).
- Exit codes: `0` = OK, `1` = expected failure (doctor finds issues, run already in progress, etc.), `2` = bad CLI usage, `> 10` reserved for environment problems (`11` = no project root, `12` = no device, `13` = docker down).
- Write any persistent state under `tmp/mo/` at the project root.
- Honour `--json` to emit machine-readable output (for future automation), default human/`rich` output otherwise.
- Honour `--plain` to disable colour/spinners (for log capture).

### 4.1 `mo doctor`

**Signature**

```
mo doctor [--fix] [--platform auto|android|ios] [--json]
```

**Purpose.** Preflight checklist. Exits `0` only when every gate is
green and a journey could plausibly succeed.

**Checks** (run in parallel where possible via `asyncio.gather`):

| Check | How | Pitfall |
|---|---|---|
| Project root resolves | Walks up from cwd for `pnpm-workspace.yaml`, or honours `HARPA_PROJECT_ROOT` | — |
| Host platform supported | `platform.system()` ∈ {Windows, Darwin, Linux} | — |
| `maestro` on PATH | `shutil.which('maestro')` + `maestro --version` | — |
| Java visible to Maestro | `java -version` | windows#1 |
| Docker compose stack up | `docker compose ps --format json`, expect `pg`, `api`, `minio` healthy | — |
| Postgres reachable | `httpx.get` adminer or `pg_isready` via `docker exec` | — |
| API health | `GET http://localhost:8787/health`, expect 200 | — |
| Metro health | `GET http://localhost:8081/status`, expect "packager-status:running" | — |
| `EXPO_PUBLIC_USE_FIXTURES=true` in the running Metro env | `GET http://localhost:8081/symbolicate` smoke or parse `tmp/metro.log` for the line | windows#11 |
| Device attached | Android: `adb devices` non-empty. iOS: `xcrun simctl list devices booted` non-empty. | — |
| `MAESTRO_APP_ID` resolvable | From env, or derived from `apps/mobile/app.config.ts` reading `APP_VARIANT` | mac#7 |
| Android ADB reverses set | `adb -s <serial> reverse --list` includes `tcp:8081` and `tcp:8787` | **windows#20** |
| No orphaned `java` from a previous Maestro run | `psutil.process_iter()` filter for `java.*maestro.jar` whose start-time predates current shell session by >5 min | windows#1, #12 |
| No orphaned `maestro-driver-ios` | Same, by name | mac (general) |
| iOS LaunchServices approval (best-effort) | If `MAESTRO_APP_ID` scheme is `harpa`, check the simulator's `schemeapproval.plist` exists and contains the entry; advisory only | **mac#1, #6** |

**`--fix` auto-remediations** (safe-only):

- Re-establish dropped `adb reverse tcp:8081` and `tcp:8787` (windows#20).
- Kill orphaned `java -jar maestro.jar` and `maestro-driver-ios`
  processes older than 10 minutes whose PID is not in
  `tmp/mo/maestro.pid`.

**Cannot auto-fix** (always prompts the operator):

- Docker stack down (run `docker compose up -d` yourself).
- Metro not running (run `pnpm --filter @harpa/mobile start` yourself).
- No device attached / no simulator booted.
- `EXPO_PUBLIC_USE_FIXTURES` not set on the running Metro process —
  requires a fresh JS bundle (Pitfall windows#11).

**State files written**

- `tmp/mo/doctor-last.json` — last run's report, for `mo journey` to
  read and short-circuit a re-check.

**Exit codes**

- `0` — all green (or `--fix` made it green).
- `1` — at least one check failed and `--fix` did not (or could not)
  fix it. Stdout/stderr lists what to do next.

**Bash-tool fit.** Designed to return in 2-3 s on a green host;
longest individual check (docker compose ps) is bounded at 4 s
via httpx timeout.

### 4.2 `mo reset`

**Signature**

```
mo reset [--db-only] [--device-only] [--platform auto|android|ios] [--no-confirm]
```

**Purpose.** Single source of truth for the "between-runs reset"
described in Pitfall windows#15. Replaces hand-typed `docker exec ...
psql` + `adb shell pm clear` calls.

**Steps** (in order; order matters):

1. **Stop any live runner.** If `tmp/mo/maestro.pid` exists and the
   PID is alive, refuse unless `--force`. (Don't trample a 20-minute
   journey in progress.)
2. **DB truncate.** Use `docker exec -i harpa-pro-pg psql -U postgres
   -d harpa` and stream the same SQL block currently in
   `scripts/maestro/reset-db.sh`, **minus the seeded Alice / Bob
   inserts**. (The regression journey now signs them up via the UI
   in module 01.) The seeded-state path stays available as
   `mo reset --seed legacy` for older flows like
   `p3-report-wiring.yaml`.
3. **App-data clear** (skipped with `--db-only`):
   - Android: `adb -s <serial> shell pm clear <MAESTRO_APP_ID>`.
   - iOS: `xcrun simctl uninstall booted <MAESTRO_APP_ID>`, then
     re-install from the most recent `.app` bundle found under
     `apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/`.
     (The journey then `launchApp`s fresh; Pitfall mac#6 — only a
     full `simctl erase` wipes scheme approval, which we deliberately
     don't do, so the `dismiss-open-dialog.yaml` helper still works.)
4. **Re-establish ADB reverses** (Android only, always, even on
   `--db-only`): `adb -s <serial> reverse tcp:8081 tcp:8081` and
   `tcp:8787 tcp:8787`. Pitfall windows#20.

**State files**

- `tmp/mo/reset-last.json` — timestamp + what was cleared, for
  audit / debugging.

**Exit codes**

- `0` on full success.
- `1` if Docker is down (refuses to truncate).
- `12` if no device attached and `--device-only` or default mode.

**Bash-tool fit.** Step 2 is bounded (~2 s for an empty schema, ~5 s
for a populated one). Step 3 is ~3 s. Total well under 30 s in the
worst case.

### 4.3 `mo run <flow>`

**Signature**

```
mo run <flow-path-or-name> [--app-id <id>] [--device <id>] [--no-detach] [--env KEY=VAL ...]
```

`<flow>` accepts either an absolute path, a path relative to
`.maestro/`, or a bare module name (`07-reports-crud` resolves to
`.maestro/modules/07-reports-crud.yaml`).

**Purpose.** Spawn `maestro test <flow>` detached, log to a known
file, register the PID so other commands can find it.

**Steps:**

1. Refuse if `tmp/mo/maestro.pid` exists and the PID is alive
   (`mo kill` first). Stale PID files are cleared automatically
   via `psutil.pid_exists` + start-time check.
2. Resolve `MAESTRO_APP_ID` (CLI flag > env > derived from
   `app.config.ts` `APP_VARIANT`).
3. Compute log paths:
   - `tmp/mo/runs/<flow-slug>-<UTC-timestamp>.log` (stdout)
   - `tmp/mo/runs/<flow-slug>-<UTC-timestamp>.err.log` (stderr)
4. Spawn `maestro test <abs-flow-path>` with
   `subprocess.Popen(..., stdout=log, stderr=err, start_new_session=True)`
   on POSIX, or `CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS` on
   Windows.
5. Write `tmp/mo/maestro.pid` containing
   `{ "pid": ..., "flow": ..., "log": ..., "started": ... }`.
6. Symlink (or copy on Windows) `tmp/mo/maestro-latest.log` →
   the new log file.
7. Print the log path + PID + a one-line tail command
   (`mo logs --tail 50`) and **return**. The orchestrator's own
   command exits in < 2 s; the Maestro child runs to completion in
   the background.

**`--no-detach` mode.** For interactive debugging on a host without a
bash-tool timeout, runs in foreground and streams stdout. Not used by
default and not used by the orchestrator's own `journey` subcommand.

**Exit codes**

- `0` — Maestro spawned, PID file written.
- `1` — refused because a run is already in progress.

**Bash-tool fit.** This is the entire reason the tool exists.
Spawn + PID-write + return.

### 4.4 `mo journey`

**Signature**

```
mo journey [--no-doctor] [--no-reset] [--skip-fix]
```

**Purpose.** The composite default workflow. Equivalent to:

```
mo doctor --fix && mo reset && mo run regression-journey.yaml
```

…but with one critical addition: on `mo run` failure (detected by
polling `tmp/mo/maestro.pid` until exit, capped by an explicit
`--watch-timeout` defaulting to `30m`), dump:

- Last 200 lines of the run log.
- Maestro's view hierarchy: `maestro hierarchy > tmp/mo/runs/<...>.hierarchy.xml`.
- A screenshot: `maestro screenshot tmp/mo/runs/<...>-failure.png`.
- Path to all three in stdout.

Critical: `mo journey` itself **does not block** waiting for the run.
It spawns, writes PID, and returns. A separate `mo journey --watch`
or `mo logs --follow-until-exit` would do the polling; default
`mo journey` is fire-and-forget so it remains bash-tool-safe.

**Decision: split it.** `mo journey` spawns. `mo journey --watch`
polls in a loop with a configurable interval, exits when the PID is
gone or the timeout fires. The polling subcommand is itself bounded
(default 30 s poll, exit immediately if PID is gone) so even
`--watch` only ever runs for ≤ ~poll-interval seconds per invocation
— the caller loops it externally.

**Exit codes**

- `0` — spawned successfully (no statement on the run's eventual outcome).
- `1` — doctor failed and `--no-doctor` not given.
- `2` — reset failed.

### 4.5 `mo kill`

**Signature**

```
mo kill [--all] [--include-drivers] [--platform auto|android|ios]
```

**Purpose.** Terminate the live Maestro runner (if any) and any
orphaned `java -jar maestro.jar` + `maestro-driver-ios` processes.

**Behaviour:**

- Default: kills the PID from `tmp/mo/maestro.pid` (if alive) and
  removes the file.
- `--all`: also kills every `java` process whose argv mentions
  `maestro` and every `maestro-driver-ios` process (whether ours or
  not). Useful when the PID file is missing but the previous run
  left zombies.
- `--include-drivers`: also kills `idb_companion` (iOS) and any
  `adb` background server (`adb kill-server`) — full nuclear option.
  Reserved; rarely needed.

**Side effect.** Calls `psutil.Process.terminate()` then, after a
2 s grace period, `kill()`. Logs each PID it touches to
`tmp/mo/kill-last.json`.

**Exit codes**

- `0` always, unless no project root resolvable.

### 4.6 `mo logs`

**Signature**

```
mo logs [--tail N=100] [--flow <name>] [--follow] [--err]
```

**Purpose.** Convenience for finding and reading the latest run log
without remembering the timestamped filename.

**Behaviour:**

- Without `--flow`: reads `tmp/mo/maestro-latest.log` (the symlink
  written by `mo run`).
- With `--flow regression-journey`: globs
  `tmp/mo/runs/regression-journey-*.log`, picks the newest by mtime.
- `--tail N` is enforced by us (Python file seek, not `tail -n`) so
  it works on Windows without shelling out.
- `--follow` polls the file size every 1 s for up to 60 s and
  prints new bytes. Beyond 60 s it exits with a message —
  bash-tool-safe; caller can re-invoke. (Never `tail -f` /
  `Get-Content -Wait`, per Pitfall windows#12.)
- `--err` reads the `.err.log` companion file.

**Exit codes**

- `0` on success.
- `1` if no run logs found.

---

## 5. Cross-platform strategy

Detect host once at startup via `platform.system()`, cache in
`mo.host.Host` enum. Every device-touching code path branches on it.

### 5.1 Decision matrix

| Concern | Windows + Android | macOS + iOS Sim | macOS + Android | Linux + Android |
|---|---|---|---|---|
| Device discovery | `adb devices` | `xcrun simctl list devices booted` | `adb devices` | `adb devices` |
| Pick device | `MAESTRO_DEVICE` env, else first non-`offline` line | `MAESTRO_DEVICE` env, else first booted UDID | same as win | same as win |
| App reinstall | `adb shell pm clear <id>` | `xcrun simctl uninstall booted <id>` + reinstall from `.app` | `adb shell pm clear` | `adb shell pm clear` |
| Re-establish networking after device reset | `adb reverse tcp:8081/8787` (Pitfall windows#20) | n/a — simulator shares host loopback | `adb reverse` | `adb reverse` |
| Orphan process scan | `psutil` filter on `java.exe` cmdline ~ `maestro.jar` | `psutil` filter on `java`, `maestro-driver-ios` | both | `java`, `idb_companion` |
| Process spawn flags | `CREATE_NEW_PROCESS_GROUP \| DETACHED_PROCESS` | `start_new_session=True` | `start_new_session=True` | `start_new_session=True` |
| Log file path separators | `pathlib.Path` everywhere; never raw `/` | same | same | same |
| Symlink for `maestro-latest.log` | Falls back to copy if symlinks unavailable (no admin) | symlink | symlink | symlink |
| LaunchServices approval check | n/a | `~/Library/Developer/CoreSimulator/Devices/<UDID>/data/Library/Preferences/com.apple.launchservices.schemeapproval.plist` (read-only; advisory) | n/a | n/a |
| Pitfall references | windows#1, #12, #15, #17, #18, #19, #20 | mac#1, #6, #7 | both | windows#15 |

### 5.2 Things we deliberately don't do

- **Don't shell to pwsh on Windows or bash on Mac.** Everything goes
  through `subprocess.run([...], shell=False)` with explicit argv.
  Avoids CRLF / quoting / `core.autocrlf` issues (Pitfalls
  windows#18, #19) infecting orchestration as well.
- **Don't write `.sh` or `.ps1` helpers.** The whole point is to
  collapse those into Python.
- **Don't `PlistBuddy`-modify the simulator's scheme approval.** Per
  Pitfall mac#1, we shipped the YAML helper precisely because that
  modification isn't portable; `mo doctor` reports it as advisory
  but never writes it.

---

## 6. Process and PID-file management

### 6.1 Layout under `tmp/mo/`

```
tmp/mo/
├── maestro.pid              # JSON: {pid, flow, log, started, host}
├── maestro-latest.log       # symlink (or copy on win-no-admin) → newest run log
├── doctor-last.json
├── reset-last.json
├── kill-last.json
└── runs/
    ├── regression-journey-20260526T143012Z.log
    ├── regression-journey-20260526T143012Z.err.log
    ├── regression-journey-20260526T143012Z.hierarchy.xml   # on failure
    ├── regression-journey-20260526T143012Z-failure.png     # on failure
    └── ...
```

All under `tmp/` which is already `.gitignore`d.

### 6.2 PID-file lifecycle

| Event | Action |
|---|---|
| `mo run` starts | Write `maestro.pid` atomically (write to `.tmp`, then rename). |
| `mo run` called while PID-file exists | Check `psutil.pid_exists(pid)` AND `Process.create_time()` ≈ file's recorded `started`. If both match → refuse. If PID is gone or recycled → delete stale file, proceed. |
| Maestro exits normally | The PID file is **not** auto-cleaned by `mo run` (the parent process already returned). Next `mo run` invocation detects the stale entry and clears it. `mo journey --watch` also clears it on observed exit. |
| `mo kill` | Sends `terminate()`, waits 2 s, then `kill()`. Deletes PID file. |

### 6.3 Race handling

- **PID recycling.** Always pair PID checks with `create_time()`
  comparison. A naïve `pid_exists()` is insufficient on long-lived
  hosts.
- **Concurrent `mo run`.** Use `fcntl.flock` (POSIX) or
  `msvcrt.locking` (Windows) on `tmp/mo/maestro.pid.lock` during
  write. Brief enough that contention is theoretical.
- **Container restart.** PID files reference host-level PIDs only.
  Docker container lifecycle is independent and doesn't invalidate
  them.

### 6.4 ADB reverse drops (Pitfall windows#20)

`mo doctor` **diagnoses** by calling `adb reverse --list` and
checking for both ports. With `--fix`, it **re-establishes** them
unconditionally (the call is idempotent and cheap, ~50 ms).

`mo reset` always re-establishes them as step 4 — the typical
sequence is `mo reset && mo run …`, so the journey starts with
known-good reverses every time. This is the single biggest reliability
win the tool offers.

`mo run` does **not** re-establish them on its own — that's `reset`'s
job. If you `mo run` without resetting, you get whatever state was
left over. (We considered adding it; rejected because it would mask
"I forgot to reset" with silent fixups.)

---

## 7. Logging

### 7.1 File layout

Described in §6.1. Key rules:

- Per-run files are timestamped UTC (`%Y%m%dT%H%M%SZ`) so newest is
  lexicographically newest.
- `.log` is stdout; `.err.log` is stderr. Maestro mixes them by
  default; we split.
- Failure artefacts (hierarchy XML, screenshot) sit next to the
  matching `.log` so a single `ls runs/regression-journey-<ts>*` shows
  everything from one run.

### 7.2 Rotation / retention

- Keep last **20** runs of each flow, by mtime. Older runs are
  deleted on `mo run` startup.
- `mo logs --keep-all` (future flag, not in v1) for forensic
  preservation.
- Total `tmp/mo/runs/` capped at **500 MB**. If exceeded, oldest
  files deleted until under cap. Hard cap to keep dev boxes from
  filling up.

### 7.3 Finding the latest

`mo logs` resolves "the latest" via `maestro-latest.log` symlink/copy
(updated atomically by `mo run`). Fallback: glob `runs/*.log`, sort
by mtime. Either way O(1) for users.

### 7.4 Surfacing failures

After a failed `mo journey --watch`, the failure summary printed to
stdout is:

```
Run FAILED: regression-journey-20260526T143012Z (12m04s)
  Log:       tmp/mo/runs/regression-journey-20260526T143012Z.log
  Errors:    tmp/mo/runs/regression-journey-20260526T143012Z.err.log
  Hierarchy: tmp/mo/runs/regression-journey-20260526T143012Z.hierarchy.xml
  Screen:    tmp/mo/runs/regression-journey-20260526T143012Z-failure.png

Last 30 lines of stderr:
  ...
```

The hierarchy + screenshot are captured by `mo journey --watch`
invoking `maestro hierarchy` / `maestro screenshot` synchronously
**after** detecting the run exited non-zero. Both are bounded
~5 s commands, bash-tool-safe.

---

## 8. Configuration

### 8.1 Three-tier resolution

1. **CLI flag** (highest precedence): `--app-id`, `--device`,
   `--platform`.
2. **Environment variable**: `MAESTRO_APP_ID`, `MAESTRO_DEVICE`,
   `HARPA_PROJECT_ROOT`, `MO_LOG_DIR` (overrides `tmp/mo/`).
3. **Config file** (lowest): `tools/maestro-orchestrator/mo.toml` if
   present, else autodiscovery.

Reasoning: env wins over config file because CI / per-shell
overrides are the common case. CLI wins over env so you can do
`MAESTRO_DEVICE=… mo run …` and still pass `--device other` on the
command line.

### 8.2 Config file

A `mo.toml` at the repo root (optional, not shipped initially):

```toml
[mo]
platform = "android"           # or "ios", "auto"
project_root = "."             # rare to set

[mo.android]
device = "R3CT7092S2H"
adb_reverse_ports = [8081, 8787]

[mo.ios]
udid = "auto"                  # picks first booted simulator
```

If the file exists, validate via Pydantic. Unknown keys → warn but
don't fail.

### 8.3 Auto-detection rules

| Setting | If unset, derive from |
|---|---|
| `MAESTRO_APP_ID` | Parse `apps/mobile/app.config.ts` (regex on `bundleIdentifier:`) using current `APP_VARIANT` env (default `development` → `com.harpa.pro.dev`). Don't `import` the TS file — read it as text. |
| `MAESTRO_DEVICE` | Android: first non-offline line from `adb devices`. iOS: first booted UDID from `xcrun simctl list devices booted`. |
| `HARPA_PROJECT_ROOT` | Walk up from `cwd` for `pnpm-workspace.yaml`. |
| Platform | `platform.system()`: Darwin → ios default, Windows / Linux → android default. Overrideable. |

If multiple devices/simulators are available and `MAESTRO_DEVICE`
isn't set, `mo doctor` fails with a "set MAESTRO_DEVICE or pass
--device" message rather than guessing.

---

## 9. Testing strategy

### 9.1 Unit tests (`pytest`)

| Module | What's tested | How |
|---|---|---|
| `config` | Three-tier resolution, config-file parsing, autodiscovery walk | Monkeypatch env + `Path.cwd`; fixture files under `tests/fixtures/` |
| `host` | Platform detection branches | Monkeypatch `platform.system()` |
| `procs` | Stale-PID detection, file-locking, kill-with-grace | Spawn `python -c "import time; time.sleep(30)"`, assert detection + termination |
| `logs` | Latest-log resolution, rotation cap, `--tail` byte-correct | Synthesise `runs/` directory with fake files of known mtimes/sizes |
| `reset` | SQL string composition, command argv composition | Don't run docker; assert the `subprocess.run` args |
| `doctor` | Each check in isolation, with mocked subprocess + httpx responses | `pytest-mock` |
| `devices.android` | `adb` argv composition, parsing of `adb devices` / `adb reverse --list` | Canned output fixtures |
| `devices.ios` | `xcrun simctl` argv composition, JSON output parsing | Canned `simctl list -j` fixtures |
| CLI surface | `mo --help`, exit codes for malformed input | `typer.testing.CliRunner` |

Target: **≥ 80% line coverage** on `src/mo/`. The shell-out boundaries
are mocked; only `_shell.py` itself has integration coverage (single
test that runs `python --version` and parses).

### 9.2 Integration smoke (Phase 7)

A handful of "real" tests, run manually + in a Phase 7 CI smoke job:

- `mo doctor` against a known-bad host (Docker down) → exit 1 with
  expected report.
- `mo doctor --fix` against a host with dropped `adb reverse` → exit 0
  and `adb reverse --list` shows both ports.
- `mo run helpers/sign-in.yaml` against the running compose stack →
  PID written, log file populated, returns in < 5 s.
- `mo kill` → no `java` / `maestro-driver-ios` processes left.

These are **not** in the default `pytest` run. They sit under
`tests/integration/` and require `pytest -m integration`.

### 9.3 Cross-platform CI

GitHub Actions matrix: `{ os: [ubuntu-latest, macos-14, windows-latest], python: ["3.11", "3.12"] }`.
Runs the unit suite only (no device available). Catches
platform-specific path / subprocess regressions.

---

## 10. Migration plan

### 10.1 What `mo` replaces

| Existing | Replaced by | When |
|---|---|---|
| `scripts/maestro/reset-db.sh` | `mo reset --seed legacy` (preserves the Alice/Bob seed for `p3-report-wiring.yaml`); plain `mo reset` for the modern journey | Phase 3c |
| Hand-typed `docker exec … TRUNCATE …` in pitfalls / READMEs | `mo reset` | Phase 3c |
| Hand-typed `adb -s … shell pm clear …` | `mo reset` | Phase 3c |
| Hand-typed `adb -s … reverse tcp:8081 …` × 2 | `mo reset` (always) + `mo doctor --fix` | Phase 3c |
| Hand-typed `Start-Process maestro -ArgumentList "test …" … > tmp/maestro-jX.log` | `mo run` | Phase 3c |
| `Get-Process java`, `Get-Content tmp/maestro-jX.log -Tail 50`, ad-hoc `taskkill` | `mo logs`, `mo kill` | Phase 3c |

### 10.2 What stays unchanged

- `.maestro/regression-journey.yaml` and all `.maestro/modules/*.yaml`
  + `.maestro/helpers/*.yaml`. `mo` is purely an outside-the-YAML
  wrapper.
- The `harpa` CLI and its fixture-record / fixture-replay surface.
  `mo` does not touch fixtures.
- The CI workflow at `.github/workflows/e2e-maestro-regression.yml`.
  Phase 3c may optionally migrate CI to invoke `mo` for symmetry;
  that's a separate decision.
- `scripts/check-maestro-testids.sh` — orthogonal, stays.

### 10.3 What gets deleted (end of Phase 3c)

- `scripts/maestro/reset-db.sh` — once `mo reset --seed legacy` is
  shipped and `p3-report-wiring.yaml` callers are updated.
- Any inline `docker exec … TRUNCATE …` blocks in
  `docs/v4/pitfalls-maestro-windows.md` — replaced by a `mo reset`
  link. (The pitfall stays; the SQL example becomes
  "use `mo reset`, which encodes this in one place.")

### 10.4 Rollout order

1. **Phase 3a (this doc).** Design only.
2. **Phase 3b.** Produce inventory of `scripts/maestro/*` and decide
   per-file: shell-out from `mo`, port to Python, or delete.
3. **Phase 3c.** Implement `mo` per this design. Land behind the
   `tools/maestro-orchestrator/` directory; no monorepo
   integration. Ship `mo doctor` and `mo reset` first (highest pain
   relief), then `mo run` / `mo kill` / `mo logs`, then `mo journey`.
4. **Phase 3d.** Update READMEs and pitfall docs to recommend `mo`.
   Delete superseded scripts.

---

## 11. Open questions

1. **Q1 — Should `mo run` block until exit when stdin is a TTY?**
   The bash-tool 120 s constraint only applies to the opencode bash
   tool. A human in iTerm would prefer streaming. Proposed default:
   detect `sys.stdout.isatty()` and switch to foreground if true,
   detached if false. Risk: behavioural difference between CI and
   local; might surprise. Alternative: never auto-detect, require
   explicit `--no-detach`. *Implementer to decide; lean toward
   explicit.*

2. **Q2 — Where does `mo` discover the iOS `.app` bundle for
   reinstall?** The path
   `apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/`
   assumes a vanilla `expo run:ios`. EAS-built local dev clients
   may live elsewhere. Should `mo reset` accept `--ios-app-path` and
   fall back to globbing `apps/mobile/ios/build/**/*.app`?

3. **Q3 — Does `mo doctor` warn on `EXPO_PUBLIC_USE_FIXTURES`
   drift?** We can detect via `tmp/metro.log` parsing whether Metro
   was launched with the var set, but that file isn't guaranteed to
   exist. Alternative: probe a known dev-only testID via a sentinel
   GET to Metro. Probably best to start with "we can't reliably
   check; advise rebuild on flip" rather than a brittle heuristic.

4. **Q4 — Should we ship a `mo doctor --watch` mode?** A 30 s
   polling loop that prints a dashboard. Useful when bringing a
   device online. Out of scope for v1; revisit if requested.

5. **Q5 — Magic OTP / seed-data interaction.**
   `design-maestro-full-regression.md` §3.1 + Q3 dropped the magic
   OTP backdoor. `mo reset` consequently does **not** insert any
   seed users by default. But `p3-report-wiring.yaml` still relies
   on the seeded Alice. Confirm: do we keep `--seed legacy` or
   migrate that flow to sign up via UI as well? *Probably keep for
   now; it's a 5-line SQL block.*

6. **Q6 — Should `mo` ever start docker compose itself?** Currently
   `mo doctor` says "Docker stack down — please run `docker compose
   up -d`." We could just run it. Risk: long startup occluding the
   bash-tool window, and surprises if compose was deliberately
   down. *Recommend: no, keep it as a check-only.*

7. **Q7 — `uv tool install` vs `pipx install`.** Both work. `uv` is
   the tool author's preference and matches the `pyproject.toml`
   choice. If a team member doesn't have `uv`, we should document
   `pipx install ./tools/maestro-orchestrator` as a fallback.

8. **Q8 — Windows symlinks fallback.** `os.symlink` requires either
   admin or Developer Mode on Windows. Detect once, cache the
   capability, fall back to "copy on update" silently. Worth
   testing on a fresh Windows install before assuming.

9. **Q9 — Where do we put `mo` in the contributor docs?** Likely a
   new `docs/v4/howto-mo.md` quickstart + a reference link from
   `pitfalls-maestro-windows.md` and `pitfalls-maestro-mac.md`.
   Phase 3c task.

10. **Q10 — Linux/WSL device support.** The design lists Linux in
    the matrix but the project doesn't currently exercise it. A WSL
    user with a USB-passthrough device should work via the same
    Android paths; we won't write Linux-specific code paths, just
    avoid Windows-specific assumptions when `Host == Linux`.

---

## Appendix: Existing helper inventory

Snapshot of every Maestro / E2E / device-related helper currently in
the repo on `test/e2e-maestro-coverage`. Compiled in Phase 3b to feed
the `mo` migration plan. *Dispositions are recommendations — final
calls happen as each `mo` subcommand lands.*

### `scripts/maestro/`

| File | Purpose | Called by | Disposition |
|---|---|---|---|
| `reset-db.sh` | `docker exec` → TRUNCATE all `app.*` + `auth.*` tables on `harpa-pro-pg`, then re-INSERT seeded Alice (`+15550100100`, with seeded project + draft report + 1 text note) and Bob (`+15550100200`) | `.maestro/core-end-to-end.yaml`, `p3-14a/b/c-*`, `p3-15-*`, `README.md`, `pitfalls-windows#15` (inlined as raw `docker exec` there) | **absorb into `mo reset`** as default + `--seed legacy` variant; keep file until all callers migrated, then delete in Phase 3c |

The dir contains **only** `reset-db.sh`. Notably:

- `pitfalls-maestro-mac.md` line 259 references **`scripts/maestro/run.sh`** as "the wrapper that sets `MAESTRO_APP_ID` automatically based on the build profile." **This file does not exist.** Phantom reference — either a doc bug or aspirational. `mo run` should fill this gap and the pitfalls doc should be updated to point at `mo` in Phase 3c.
- `p3-14b-usage-limit-dialog.yaml` line 23 invokes **`./scripts/maestro/reset-db.sh --seed-at-limit`**. The script does not accept arguments — `--seed-at-limit` is silently ignored. Module 14b is therefore effectively a placeholder. `mo reset --seed at-limit` should be a first-class flag.

### `scripts/` (E2E-adjacent, top level)

| File | Purpose | Called by | Disposition |
|---|---|---|---|
| `check-maestro-testids.sh` | Greps every `id:` token in `.maestro/modules/`, `.maestro/helpers/`, and `regression-journey.yaml` against `apps/mobile/**/*.{ts,tsx}`. Honours a `KNOWN_TEMPLATE_IDS` allowlist for template-resolved IDs (`picker-member-role-editor/viewer`). Treats `*.` and `${` as prefix-match. Exits 1 on miss. | `.github/workflows/e2e-maestro-testid-gate.yml` (PR + push to dev/main, gated on `apps/mobile/` changes) | **keep, called by `mo`** — wire `mo doctor` and a pre-`mo run` check to invoke it. The CI workflow stays as the source of truth. |
| `check-maestro-appid.sh` | Greps `.maestro/**/*.yaml` for the literal `com.harpa.pro`, fails if found. Enforces use of `${MAESTRO_APP_ID}`. | root `package.json` → `lint` script (chained via `&&` in the lint command) | **keep standalone** — pure lint, not orchestrator-shaped. `mo run` should still set `MAESTRO_APP_ID` correctly from the build variant. |

No other top-level scripts are Maestro / E2E / device related (the
remaining `check-*.sh` files cover RLS scope, secrets, spec drift, R2,
unistyles, supabase, CLI help drift, rate-limit env vars — orthogonal).

### `.maestro/` (top-level configs only — flows omitted)

| File | Purpose | Disposition |
|---|---|---|
| `regression-journey.yaml` | Orchestrator flow that `runFlow`s modules 01 → 17. Modules 09, 11, 12, 13 disabled (commented out — see file header for iOS-specific reasons). | **target of `mo journey full`** — input config unchanged |
| `core-end-to-end.yaml` | Older P3-exit-gate single-file journey. Depends on `reset-db.sh` (uses seeded Bob for invite step). | **target of `mo journey legacy`** or `mo run core-end-to-end` |
| `p3-14a-usage-limits-card.yaml` | Usage card render. Runs today against seeded Alice. | **target of `mo run`** |
| `p3-14b-usage-limit-dialog.yaml` | Placeholder — requires non-existent `reset-db.sh --seed-at-limit`. | **needs `mo reset --seed at-limit`** before this becomes runnable |
| `p3-14c-near-limit-toast.yaml` | Placeholder — depends on near-limit toast UI + a `report_generate` cap seed in `reset-db.sh`. | **blocked on UI + seed** — out of scope for `mo` initial cut |
| `p3-15-voice-record.yaml` | Legacy voice flow (signs in as seeded Alice). README marks as "safe to delete once module 09 is green on CI". Module 09 is currently disabled on iOS. | **delete after `mo` lands and module 09 is re-enabled** |
| `p3-15-upload.yaml` | Legacy photo flow (signs in as seeded Alice). Same superseded-by-module-10a status. | **delete after `mo` lands** |
| `README.md` | Documents `MAESTRO_APP_ID`, setup, run commands, iOS sim quirks, infra workarounds (gtimeout + kill orphan `maestro-driver-ios` PIDs). | **edit in Phase 3c** to point at `mo` for the run commands |

`.maestro/modules/` (17 files) and `.maestro/helpers/` (5 files:
`sign-in`, `sign-out`, `pick-country-us`, `dismiss-open-dialog`,
`open-project`) are flow content, untouched by `mo`.

### Root `package.json` scripts (E2E-relevant)

| Script | Command | Disposition |
|---|---|---|
| `lint` | `turbo run lint && bash scripts/check-no-supabase.sh && … && bash scripts/check-maestro-appid.sh && …` | keep — `check-maestro-appid.sh` chained in |
| `android` | `expo run:android` | keep — `mo run` will not own native builds |
| `ios` | `expo run:ios` | keep — same |

No `maestro:*` / `e2e:*` / `test:e2e:mobile` entries exist at root.
**Gap.** There is no `pnpm` entry point to launch Maestro at all
today — every invocation is hand-typed `maestro test …`. `mo run`
will be the canonical entry point; we may add a root alias
`"maestro": "mo"` once `mo` is installed.

### `apps/mobile/package.json` scripts (E2E-relevant)

| Script | Command | Disposition |
|---|---|---|
| `ios:mock` | `EXPO_PUBLIC_USE_FIXTURES=true expo run:ios` | keep — `mo` orchestrates Maestro, not native rebuilds |
| `bundle:smoke` | `bash scripts/bundle-smoke.sh` | unrelated to Maestro (verifies Metro bundling), keep |

No Maestro / `adb` / `simctl` references in this package.json.

### `docker-compose.yml` services (DB-reset surface)

| Service | Role for E2E |
|---|---|
| `pg` (Postgres 16, `harpa-pro-pg`, host `:5433`) | Target of `reset-db.sh`. `mo reset` needs the container name `harpa-pro-pg` and the same `psql -U postgres -d harpa` invocation. |
| `migrate` | One-shot drizzle migration runner; `mo reset` after `compose down -v` must wait for `migrate` to exit cleanly. |
| `api` | Hono fixture-mode API on `:8787`. `DISABLE_RATE_LIMIT=1` set here so the regression journey can sign Alice/Bob in/out repeatedly. `mo doctor` should verify the API responds and that this env var is set. |
| `minio` + `minio-init` | R2-compatible storage on `:9000` / console `:9001`; bucket `harpa-pro` created by `minio-init`. `mo doctor` should curl `:9000/minio/health/live` and confirm bucket exists. |
| `adminer` | Browser SQL UI on `:8080`. Not used by E2E directly. |

### `apps/mobile/app.config.ts` — bundle ID derivation

Bundle ID is derived from the `APP_VARIANT` env var (read at Expo
config eval time, set per-profile in `eas.json`):

| `APP_VARIANT` | App name | Bundle ID (iOS + Android `package`) |
|---|---|---|
| `production` | `Harpa Pro` | `com.harpa.pro` |
| `preview` | `Harpa Pro Dev` | `com.harpa.pro.dev` |
| `development` (default / fallback) | `Harpa Pro Dev` | `com.harpa.pro.dev` |

`mo run` must resolve `MAESTRO_APP_ID` from `APP_VARIANT` using the
same table (or from an explicit `--variant` flag, defaulting to
`development` → `com.harpa.pro.dev` since that's what `expo run:ios`
/ `expo run:android` produces locally).

### `.github/workflows/` (Maestro-relevant)

| File | Trigger | What it runs |
|---|---|---|
| `e2e-maestro-testid-gate.yml` | `pull_request` + push to `dev`/`main`; uses `./.github/actions/changed-paths` to skip when `apps/mobile/` unchanged on PRs | `bash scripts/check-maestro-testids.sh` only |

No workflow currently executes Maestro itself in CI. `mo` is a local
tool for now; a future `e2e-maestro-run.yml` (on a Mac runner with a
preconfigured simulator) would call `mo run` directly.

### Git hooks

| Hook | What it runs (E2E-relevant lines) |
|---|---|
| `.husky/pre-push` | `pnpm lint` (which chains `check-maestro-appid.sh`); `pnpm typecheck`; `pnpm test`; fixture-hash check; `db:check`; `check-secrets.sh` (skippable via `SKIP_SECRET_CHECK=1` — see pitfall-windows#18). **Does not run Maestro.** |

### Pitfalls → `mo` subcommand mapping

Hand-typed snippets from `pitfalls-maestro-{windows,mac}.md` that `mo`
should absorb. Each entry tagged with the originating pitfall and the
subcommand that subsumes it.

| Snippet (paraphrased) | Pitfall | Subsumed by |
|---|---|---|
| `docker exec -i harpa-pro-pg psql … TRUNCATE app.* auth.*  RESTART IDENTITY CASCADE` | win-15 | `mo reset` |
| `adb -s <serial> shell pm clear com.harpa.pro.dev` | win-15 | `mo reset` (Android) |
| `adb -s <serial> reverse tcp:8081 tcp:8081 && adb … tcp:8787 tcp:8787` | win-20 | `mo doctor` + `mo run` precondition |
| `adb -s <serial> reverse --list` (verification) | win-20 | `mo doctor` |
| `for PID in $(ps aux \| grep maestro-driver-ios …); do kill $PID; done` | mac-README + win-runbook | `mo kill` |
| `gtimeout 240s maestro test …` wrapper loop | README + win-12 | `mo run --retries N --timeout 240` |
| Redirect `… > tmp/maestro-jX.log 2> tmp/maestro-jX.err.log` + poll `Get-Content -Tail 50` | win-1, win-12 | `mo run` (managed log files) + `mo logs --tail` |
| `Get-Process java` (alive check) | win-1 | `mo run` (managed PID + status) |
| `git checkout -- .` (clean CRLF phantoms before rebase) | win-19 | out of scope for `mo` (general git hygiene) |
| `xcrun simctl privacy booted grant {microphone,camera} $MAESTRO_APP_ID` | README setup | `mo doctor --fix` (iOS) |
| `/usr/libexec/PlistBuddy … schemeapproval.plist add … harpa string com.harpa.pro.dev` | mac-1 (better solution) | `mo doctor --fix` (iOS, Mac-only branch) |
| `xcrun simctl erase` (re-trigger Open-in dialog) | mac-6 | `mo reset --hard` (iOS) |
| `MAESTRO_APP_ID=com.harpa.pro.dev maestro test …` | mac-7 | `mo run` (auto-resolved from variant) |
| `docker compose down -v && docker compose up -d` (fresh DB) | regression-journey.yaml pre-condition | `mo reset --hard` |
| `simctl uninstall` (companion to clearState) | mac-6 | `mo reset` (iOS) |

### Notable findings

1. **`scripts/maestro/run.sh` referenced but does not exist** — `pitfalls-maestro-mac.md:259`. Likely aspirational; `mo run` should fill the role and the doc updated in Phase 3c.
2. **`reset-db.sh --seed-at-limit` referenced but unsupported** — `p3-14b-usage-limit-dialog.yaml:23`. The script silently ignores all args. Module 14b is therefore not runnable as documented. `mo reset --seed at-limit` should be implemented alongside an actual at-limit seed SQL.
3. **No CI runs Maestro today** — only the testID gate runs. Mobile E2E is purely a local affair on dev boxes. `mo` becoming the local entry point is a prerequisite for a future CI step on a Mac runner.
4. **Two legacy single-purpose flows ready for deletion** — `p3-15-voice-record.yaml` and `p3-15-upload.yaml` are explicitly marked as superseded by `modules/09-voice-notes.yaml` and `modules/10a-photo-notes-draft.yaml` in `.maestro/README.md`. Block on re-enabling module 09 on iOS (currently disabled in `regression-journey.yaml`) before deletion.
5. **Four regression modules disabled in `regression-journey.yaml`** — modules 09 (voice — iOS dynamic-import bug), 11 (generate-finalize — iOS render race), 12 (report-debug — depends on 11), 13 (projects-delete — depends on 11/12). Worth tracking as `mo`-orthogonal bugs; do not let `mo` design assume these will be re-enabled by Phase 3c.
6. **`reset-db.sh` is bash-only** — Windows hosts run it via Git Bash / WSL. `mo reset` should be pure Python so the Windows agent can invoke `docker exec` directly without a shell shim.
7. **Pre-push hook does not run Maestro** — confirms `mo` is a developer-driven, on-demand tool; we do not need to optimise for sub-second startup.
8. **No `package.json` entry point for Maestro** anywhere in the monorepo. Every contributor hand-types `maestro test …`. `mo run` will be the first canonical entry.
