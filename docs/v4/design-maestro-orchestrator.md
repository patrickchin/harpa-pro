# Maestro orchestrator (`mo`) — design

> **Status: implemented.** The Python package lives in
> `tools/maestro-orchestrator/` and exposes `mo`. Use its README for
> current installation and commands. The design below preserves the
> original decisions and proposed layout, some of which changed during
> implementation.
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

## 1. Scope

One CLI for two hosts (Windows-pwsh + real Android, macOS-zsh + iOS Sim) with no host-specific wrappers. Bash-tool friendly: every subcommand returns control in **< 5 s**, long Maestro work spawned detached with PID + log files (Pitfall windows#12). `mo reset` replaces the hand-rolled `docker exec ... TRUNCATE ...` + `adb shell pm clear ...` sequence (windows#15). `mo doctor` catches ADB-reverse drops, orphan `java`/driver processes, Metro/API down, missing env (the failure modes that burn 20 minutes on step 3). Lives at `tools/maestro-orchestrator/` under `uv` — not in the pnpm workspace, no imports from `packages/*`. Reuses existing `scripts/maestro/*` helpers via shell-out where they do the right thing.

**Not in scope:** Maestro replacement, hosted CI execution, EAS
distribution, fixture authoring, or partial-journey resume. No hosted
workflow currently runs the device suite.

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
│       ├── procs.py            # PID-file management, psutil-based termination
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

```bash
uv tool install ./tools/maestro-orchestrator   # exposes `mo` on PATH
# or:
uv run --project tools/maestro-orchestrator mo doctor
```

Project root resolved by walking up from `cwd` for `pnpm-workspace.yaml` (override with `HARPA_PROJECT_ROOT`).

---

## 3. Stack

- **Python 3.11+** (chosen over Node/Go/Rust/Deno/pwsh-module). `psutil` is the gold standard for cross-platform PID handling; `typer` for type-hinted CLIs; already used by `cli-fixture-testing` skill tooling. A separate process-orchestration tree avoids gravity-pulling the orchestrator into the pnpm workspace.
- **Libraries:** `typer` ≥ 0.12 (CLI + auto-help + exit codes), `rich` ≥ 13 (tables, optional via `--plain`), `psutil` ≥ 5.9 (cross-platform process scan/terminate), `httpx` ≥ 0.27 (Metro/API healthchecks with timeouts), `pydantic` ≥ 2.7 (config validation, fail-fast at boot), `pytest` + `pytest-mock`.

---

## 4. Command-by-command spec

All commands obey:

- Return in **< 5 s wall-clock** (bash-tool 120 s rule + headroom).
- Exit codes: `0` OK · `1` expected failure (doctor finds issues, run already in progress) · `2` bad CLI usage · `>10` env problems (`11` no project root, `12` no device, `13` docker down).
- Persistent state under `tmp/mo/` at project root.
- `--json` for machine output, `--plain` to disable colour/spinners.

### 4.1 `mo doctor`

```
mo doctor [--fix] [--platform auto|android|ios] [--json]
```

Preflight checklist; exits `0` only if every gate is green. Checks run in parallel where possible.

| Check                                                    | How                                                                                                                              | Pitfall        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Project root resolves                                    | Walks up from cwd for `pnpm-workspace.yaml`, or honours `HARPA_PROJECT_ROOT`                                                     | —              |
| Host platform supported                                  | `platform.system()` ∈ {Windows, Darwin, Linux}                                                                                   | —              |
| `maestro` on PATH                                        | `shutil.which('maestro')` + `maestro --version`                                                                                  | —              |
| Java visible to Maestro                                  | `java -version`                                                                                                                  | windows#1      |
| Docker compose stack up                                  | `docker compose ps --format json`, expect `pg`, `api`, `minio` healthy                                                           | —              |
| Postgres reachable                                       | `httpx.get` adminer or `pg_isready` via `docker exec`                                                                            | —              |
| API health                                               | `GET http://localhost:8787/health`, expect 200                                                                                   | —              |
| Metro health                                             | `GET http://localhost:8081/status`, expect "packager-status:running"                                                             | —              |
| `EXPO_PUBLIC_USE_FIXTURES=true` in the running Metro env | `GET http://localhost:8081/symbolicate` smoke or parse `tmp/metro.log` for the line                                              | windows#11     |
| Device attached                                          | Android: `adb devices` non-empty. iOS: `xcrun simctl list devices booted` non-empty.                                             | —              |
| `MAESTRO_APP_ID` resolvable                              | From env, or derived from `apps/mobile/app.config.ts` reading `APP_VARIANT`                                                      | mac#7          |
| Android ADB reverses set                                 | `adb -s <serial> reverse --list` includes `tcp:8081`, `tcp:8787`, `tcp:8790`, and `tcp:9000`                                     | **windows#20** |
| No orphaned `java` from a previous Maestro run           | `psutil.process_iter()` filter for `java.*maestro.jar` whose start-time predates current shell session by >5 min                 | windows#1, #12 |
| No orphaned `maestro-driver-ios`                         | Same, by name                                                                                                                    | mac (general)  |
| iOS LaunchServices approval (best-effort)                | If `MAESTRO_APP_ID` scheme is `harpa`, check the simulator's `schemeapproval.plist` exists and contains the entry; advisory only | **mac#1, #6**  |

`--fix` auto-remediates: re-establishes dropped `adb reverse tcp:8081`/`8787`/`8790`/`9000` (windows#20); terminates orphan `java -jar maestro.jar` and `maestro-driver-ios` older than 10 min whose PID isn't in `tmp/mo/maestro.pid`.

Cannot auto-fix (always prompts the operator): docker stack down, Metro not running, no device/simulator, `EXPO_PUBLIC_USE_FIXTURES` missing on the running Metro process (requires a fresh JS bundle — Pitfall windows#11).

State: `tmp/mo/doctor-last.json` for `mo journey` to short-circuit a re-check.

Exit `0` all green, `1` if any check failed (or `--fix` could not fix it). Returns in 2-3 s on a green host; longest individual check (docker compose ps) bounded at 4 s via httpx timeout.

### 4.2 `mo reset`

```
mo reset [--db-only] [--device-only] [--platform auto|android|ios] [--no-confirm]
```

Single source of truth for the between-runs reset (Pitfall windows#15). Steps in order:

1. **Stop any live runner.** If `tmp/mo/maestro.pid` exists and PID is alive, refuse unless `--force`.
2. **DB truncate.** `docker exec -i harpa-pro-pg psql -U postgres -d harpa` streaming the SQL block from `scripts/maestro/reset-db.sh`, **minus the seeded Alice/Bob inserts** (the regression journey signs them up via UI in module 01). Seeded path remains as `mo reset --seed legacy` for `p3-report-wiring.yaml`.
3. **App-data clear** (skipped with `--db-only`):
   - Android: `adb -s <serial> shell pm clear <MAESTRO_APP_ID>`.
   - iOS: `xcrun simctl uninstall booted <MAESTRO_APP_ID>`, then re-install from the most recent `.app` under `apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/`. Don't `simctl erase` (would wipe scheme approval — Pitfall mac#6).
4. **Re-establish ADB reverses** (Android only, always, even on `--db-only`): `adb -s <serial> reverse tcp:8081 tcp:8081 && tcp:8787 tcp:8787 && tcp:8790 tcp:8790 && tcp:9000 tcp:9000` (windows#20).

State: `tmp/mo/reset-last.json` for audit.

Exit codes: `0` full success · `1` Docker is down (refuses to truncate) · `12` no device attached and not `--device-only`. Step 2 ~2-5 s, step 3 ~3 s, total <30 s.

### 4.3 `mo run <flow>`

```
mo run <flow-path-or-name> [--app-id <id>] [--device <id>] [--no-detach] [--env KEY=VAL ...]
```

`<flow>` accepts an absolute path, a path relative to `.maestro/`, or a bare module name (`07-reports-crud` resolves to `.maestro/modules/07-reports-crud.yaml`).

Steps:

1. Refuse if `tmp/mo/maestro.pid` exists and the PID is alive (`mo kill` first). Stale PID files are cleared automatically via `psutil.pid_exists` + start-time check.
2. Resolve `MAESTRO_APP_ID` (CLI flag > env > derived from `app.config.ts` `APP_VARIANT`).
3. Prepare the selected Android device before spawning Maestro: `svc power stayon true`, disable `screensaver_*` secure settings, send `KEYCODE_WAKEUP` + `KEYCODE_MENU`, then inspect `dumpsys window`. If DreamActivity or a secure keyguard/bouncer is still focused, refuse with a clear "unlock the device" error instead of burning a Maestro run.
4. Compute log paths:
   - `tmp/mo/runs/<flow-slug>-<UTC-timestamp>.log` (stdout)
   - `tmp/mo/runs/<flow-slug>-<UTC-timestamp>.err.log` (stderr)
5. Spawn `maestro test <abs-flow-path>` with `subprocess.Popen(..., stdout=log, stderr=err, start_new_session=True)` on POSIX or `CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS` on Windows. Maestro YAML/script globals come from `--env`, not arbitrary child process env, so `mo run` forwards `MAESTRO_APP_ID` and optional `API_BASE_URL` as explicit `--env KEY=VALUE` pairs before the flow path. The local auth broker is managed by `mo up` and is reached over `127.0.0.1:8790`, not by passing password or OTP secrets through Maestro env.
6. Write `tmp/mo/maestro.pid` containing `{ "pid": ..., "flow": ..., "log": ..., "started": ... }`.
7. Symlink (or copy on Windows) `tmp/mo/maestro-latest.log` → the new log file.
8. Print log path + PID + `mo logs --tail 50` hint and **return**. The orchestrator command exits in < 2 s; Maestro runs in the background.

`--no-detach`: foreground streaming for interactive debugging on a host without a bash-tool timeout. Not used by `mo journey`.

Exit codes: `0` spawned · `1` already in progress.

### 4.4 `mo journey`

```
mo journey [--target local|dev] [--no-doctor] [--no-reset] [--skip-fix]
```

Composite: `mo doctor --fix && mo reset && mo run regression-journey.yaml`. `--target local` is default; `--target dev` (planned) points at `https://harpa-pro-api-dev.fly.dev`, skips destructive local DB truncate, uses test-account password-login.

Critical: `mo journey` does **not** block waiting for the run — spawn, write PID, return. A separate `mo journey --watch` polls `tmp/mo/maestro.pid` until exit (default 30 s poll, exits when PID gone or timeout fires; bash-tool-safe — caller loops externally). On non-zero exit `--watch` captures:

- Last 200 lines of run log.
- `maestro hierarchy > tmp/mo/runs/<...>.hierarchy.xml`.
- `maestro screenshot tmp/mo/runs/<...>-failure.png`.

Both bounded ~5 s, bash-tool-safe.

Exit codes: `0` spawned · `1` doctor failed (and `--no-doctor` not given) · `2` reset failed.

### 4.5 `mo kill`

```
mo kill [--all] [--include-drivers] [--platform auto|android|ios]
```

Default: terminates the PID from `tmp/mo/maestro.pid` (if alive), removes the file. `--all` also terminates every `java` whose argv mentions `maestro` and every `maestro-driver-ios` (whether ours or not). `--include-drivers` also stops `idb_companion` (iOS) and `adb kill-server` — full nuclear option, rarely needed.

`psutil.Process.terminate()` then `psutil.Process.kill()` after 2 s grace. Logs each PID to `tmp/mo/kill-last.json`. Exit `0` always (unless no project root).

### 4.6 `mo logs`

```
mo logs [--tail N=100] [--flow <name>] [--follow] [--err]
```

Without `--flow`: reads `tmp/mo/maestro-latest.log`. With `--flow regression-journey`: globs `tmp/mo/runs/regression-journey-*.log`, picks newest by mtime. `--tail` enforced via Python file seek (works on Windows without shelling). `--follow` polls file size every 1 s for up to 60 s, then exits with a message — bash-tool-safe; never `tail -f` / `Get-Content -Wait` (Pitfall windows#12). `--err` reads the `.err.log` companion.

Exit `0` success · `1` no run logs found.

---

## 5. Cross-platform strategy

Detect host once at startup via `platform.system()`, cache in `mo.host.Host` enum. Every device-touching code path branches on it.

### 5.1 Decision matrix

| Concern                                    | Windows + Android                                          | macOS + iOS Sim                                                                                                                                 | macOS + Android          | Linux + Android          |
| ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------ |
| Device discovery                           | `adb devices`                                              | `xcrun simctl list devices booted`                                                                                                              | `adb devices`            | `adb devices`            |
| Pick device                                | `MAESTRO_DEVICE` env, else first non-`offline` line        | `MAESTRO_DEVICE` env, else first booted UDID                                                                                                    | same as win              | same as win              |
| App reinstall                              | `adb shell pm clear <id>`                                  | `xcrun simctl uninstall booted <id>` + reinstall from `.app`                                                                                    | `adb shell pm clear`     | `adb shell pm clear`     |
| Re-establish networking after device reset | `adb reverse tcp:8081/8787/8790/9000` (Pitfall windows#20) | n/a — simulator shares host loopback                                                                                                            | `adb reverse`            | `adb reverse`            |
| Orphan process scan                        | `psutil` filter on `java.exe` cmdline ~ `maestro.jar`      | `psutil` filter on `java`, `maestro-driver-ios`                                                                                                 | both                     | `java`, `idb_companion`  |
| Process spawn flags                        | `CREATE_NEW_PROCESS_GROUP \| DETACHED_PROCESS`             | `start_new_session=True`                                                                                                                        | `start_new_session=True` | `start_new_session=True` |
| Log file path separators                   | `pathlib.Path` everywhere; never raw `/`                   | same                                                                                                                                            | same                     | same                     |
| Symlink for `maestro-latest.log`           | Falls back to copy if symlinks unavailable (no admin)      | symlink                                                                                                                                         | symlink                  | symlink                  |
| LaunchServices approval check              | n/a                                                        | `~/Library/Developer/CoreSimulator/Devices/<UDID>/data/Library/Preferences/com.apple.launchservices.schemeapproval.plist` (read-only; advisory) | n/a                      | n/a                      |
| Pitfall references                         | windows#1, #12, #15, #17, #18, #19, #20                    | mac#1, #6, #7                                                                                                                                   | both                     | windows#15               |

### 5.2 Things we deliberately don't do

- **No shell to pwsh/bash.** Always `subprocess.run([...], shell=False)` with explicit argv (avoids CRLF/quoting/`core.autocrlf`, Pitfalls windows#18, #19).
- **No `.sh` or `.ps1` helpers.** The point is to collapse those into Python.
- **No `PlistBuddy`-modify of simulator scheme approval** — we ship a YAML helper precisely because that mod isn't portable (Pitfall mac#1). `mo doctor` reports it as advisory, never writes it.

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

All under `tmp/` (already `.gitignore`d).

### 6.2 PID-file lifecycle

| Event                                 | Action                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mo run` starts                       | Write `maestro.pid` atomically (write to `.tmp`, then rename).                                                                                                  |
| `mo run` called while PID-file exists | Check `psutil.pid_exists(pid)` AND `Process.create_time()` ≈ file's recorded `started`. Both match → refuse. PID gone or recycled → delete stale file, proceed. |
| Maestro exits normally                | PID file is **not** auto-cleaned by `mo run` (parent already returned). Next `mo run` clears stale entry. `mo journey --watch` also clears it on observed exit. |
| `mo kill`                             | `terminate()`, wait 2 s, then `psutil.Process.kill()`. Deletes PID file.                                                                                        |

### 6.3 Race handling

- **PID recycling.** Always pair `pid_exists()` with `create_time()` comparison.
- **Concurrent `mo run`.** `fcntl.flock` (POSIX) / `msvcrt.locking` (Windows) on `tmp/mo/maestro.pid.lock`.
- **Container restart.** PID files reference host PIDs only; Docker lifecycle doesn't invalidate them.

### 6.4 ADB reverse drops (Pitfall windows#20)

`mo doctor` diagnoses via `adb reverse --list`; `--fix` re-establishes unconditionally (idempotent, ~50 ms). `mo reset` always re-establishes as step 4. `mo run` does **not** re-establish — that's `reset`'s job; otherwise we'd mask "I forgot to reset" with silent fixups.

---

## 7. Logging

### 7.1 Files

Layout in §6.1. Per-run files timestamped UTC (`%Y%m%dT%H%M%SZ`), so newest is lexicographically newest. `.log` is stdout; `.err.log` is stderr (Maestro mixes them, we split). Failure artefacts (hierarchy XML, screenshot) sit next to the matching `.log`.

### 7.2 Rotation

- Last **20** runs of each flow kept by mtime; older deleted on `mo run` startup.
- `tmp/mo/runs/` capped at **500 MB** total; oldest deleted past cap.
- `mo logs --keep-all` (future flag) for forensic preservation.

### 7.3 Latest

`maestro-latest.log` symlink updated atomically by `mo run`. Fallback: glob `runs/*.log` by mtime.

### 7.4 Failure summary

After failed `mo journey --watch`:

```
Run FAILED: regression-journey-20260526T143012Z (12m04s)
  Log:       tmp/mo/runs/regression-journey-20260526T143012Z.log
  Errors:    tmp/mo/runs/regression-journey-20260526T143012Z.err.log
  Hierarchy: tmp/mo/runs/regression-journey-20260526T143012Z.hierarchy.xml
  Screen:    tmp/mo/runs/regression-journey-20260526T143012Z-failure.png

Last 30 lines of stderr:
  ...
```

`maestro hierarchy` / `maestro screenshot` invoked synchronously after detecting non-zero exit; both ~5 s, bash-tool-safe.

---

## 8. Configuration

### 8.1 Three-tier resolution

1. **CLI flag** (highest): `--app-id`, `--device`, `--platform`.
2. **Env**: `MAESTRO_APP_ID`, `MAESTRO_DEVICE`, `HARPA_PROJECT_ROOT`, `MO_LOG_DIR`.
3. **Config file** (lowest): `tools/maestro-orchestrator/mo.toml` if present.

CLI > env > file lets `MAESTRO_DEVICE=… mo run --device other` do the right thing.

### 8.2 Config file (optional)

```toml
[mo]
platform = "android"           # or "ios", "auto"
project_root = "."             # rare to set

[mo.android]
device = "R3CT7092S2H"
adb_reverse_ports = [8081, 8787, 8790, 9000]

[mo.ios]
udid = "auto"                  # picks first booted simulator
```

Pydantic-validated. Unknown keys warn but don't fail.

### 8.3 Auto-detection

| Setting              | If unset, derive from                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAESTRO_APP_ID`     | Parse `apps/mobile/app.config.ts` (regex on `bundleIdentifier:`) using `APP_VARIANT` env (default `development` → `com.harpa.pro.dev`). Don't `import`; read as text. |
| `MAESTRO_DEVICE`     | Android: first non-offline from `adb devices`. iOS: first booted UDID from `xcrun simctl list devices booted`.                                                        |
| `HARPA_PROJECT_ROOT` | Walk up from `cwd` for `pnpm-workspace.yaml`.                                                                                                                         |
| Platform             | `platform.system()`: Darwin → ios, Windows/Linux → android. Overrideable.                                                                                             |

If multiple devices and `MAESTRO_DEVICE` unset, `mo doctor` fails with "set MAESTRO_DEVICE or pass --device" rather than guess.

---

## 9. Testing

### 9.1 Unit tests (pytest)

| Module            | Tests                                                          | How                                            |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `config`          | Three-tier resolution, config-file parsing, autodiscovery walk | Monkeypatch env + `Path.cwd`; fixture files    |
| `host`            | Platform detection branches                                    | Monkeypatch `platform.system()`                |
| `procs`           | Stale-PID detection, file-locking, terminate-with-grace        | Spawn `python -c "time.sleep(30)"`             |
| `logs`            | Latest-log resolution, rotation cap, byte-correct `--tail`     | Synthesise `runs/` dir with fake mtimes/sizes  |
| `reset`           | SQL composition, command argv                                  | Don't run docker; assert `subprocess.run` args |
| `doctor`          | Each check in isolation                                        | `pytest-mock` for subprocess + httpx           |
| `devices.android` | `adb` argv, parsing of `adb devices` / `reverse --list`        | Canned output fixtures                         |
| `devices.ios`     | `xcrun simctl` argv, JSON output parsing                       | Canned `simctl list -j` fixtures               |
| CLI surface       | `mo --help`, exit codes for malformed input                    | `typer.testing.CliRunner`                      |

Target: **≥ 80% line coverage** on `src/mo/`. Shell-out boundaries mocked; only `_shell.py` runs `python --version` for real.

### 9.2 Integration smoke (Phase 7)

Manual + Phase 7 CI smoke job under `tests/integration/`, `pytest -m integration`:

- `mo doctor` against bad host (Docker down) → exit 1.
- `mo doctor --fix` with dropped `adb reverse` → exit 0, both ports back.
- `mo run helpers/sign-in.yaml` → PID written, log populated, returns < 5 s.
- `mo kill` → no `java` / `maestro-driver-ios` left.

### 9.3 Cross-platform CI

Matrix: `{ os: [ubuntu-latest, macos-14, windows-latest], python: ["3.11", "3.12"] }`. Unit suite only (no device).

---

## 10. Migration plan

### 10.1 Replaces

| Existing                                                                         | Replaced by                                                                                                              | When     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| `scripts/maestro/reset-db.sh`                                                    | `mo reset --seed legacy` (preserves Alice/Bob seed for `p3-report-wiring.yaml`); plain `mo reset` for the modern journey | Phase 3c |
| Hand-typed `docker exec … TRUNCATE …`                                            | `mo reset`                                                                                                               | 3c       |
| Hand-typed `adb -s … shell pm clear …`                                           | `mo reset`                                                                                                               | 3c       |
| Hand-typed `adb -s … reverse tcp:8081 …` × 2                                     | `mo reset` (always) + `mo doctor --fix`                                                                                  | 3c       |
| Hand-typed `Start-Process maestro -ArgumentList "test …" … > tmp/maestro-jX.log` | `mo run`                                                                                                                 | 3c       |
| `Get-Process java`, `Get-Content -Tail`, ad-hoc `taskkill`                       | `mo logs`, `mo kill`                                                                                                     | 3c       |

### 10.2 Unchanged

- `.maestro/regression-journey.yaml` and all modules/helpers — `mo` is purely outside-the-YAML.
- `harpa` CLI + fixture surfaces.
- `.github/workflows/e2e-maestro-regression.yml` (CI may optionally migrate to `mo` later).
- `scripts/check-maestro-testids.sh` — orthogonal.

### 10.3 Deletions (end of Phase 3c)

- `scripts/maestro/reset-db.sh` once `mo reset --seed legacy` shipped and `p3-report-wiring.yaml` callers updated.
- Inline `docker exec … TRUNCATE …` blocks in `pitfalls-maestro-windows.md` → replaced by a `mo reset` link.

### 10.4 Rollout order

1. **3a (this doc).** Design only.
2. **3b.** Inventory `scripts/maestro/*` (see appendix); decide per-file.
3. **3c.** Implement `mo`. Ship `mo doctor` + `mo reset` first (highest pain relief), then `run`/`kill`/`logs`, then `journey`.
4. **3d.** Update READMEs + pitfalls to recommend `mo`. Delete superseded scripts.

---

## 11. Open questions

1. **`mo run` blocking on TTY?** Detect `sys.stdout.isatty()` → foreground if true, detached if false; or always require explicit `--no-detach`. **Lean: explicit.**
2. **iOS `.app` discovery.** `apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/` assumes vanilla `expo run:ios`. Add `--ios-app-path` + glob fallback `apps/mobile/ios/build/**/*.app`?
3. **`EXPO_PUBLIC_USE_FIXTURES` drift detection.** `tmp/metro.log` parsing isn't reliable. Start with "advise rebuild on flip" rather than a brittle heuristic.
4. **`mo doctor --watch`.** Out of scope for v1; revisit if requested.
5. **Magic OTP / seed-data.** `p3-report-wiring.yaml` still relies on seeded Alice. Keep `--seed legacy` for now (5-line SQL block).
6. **`mo` starting docker compose.** No — keep as a check (long startup occludes bash-tool window; may surprise if compose was deliberately down).
7. **`uv tool install` vs `pipx`.** Both work; document `pipx install ./tools/maestro-orchestrator` as fallback.
8. **Windows symlinks.** `os.symlink` requires admin or Developer Mode. Detect once, fall back to copy-on-update silently. Test on fresh Windows install.
9. **Contributor docs.** New `docs/v4/howto-mo.md` quickstart + reference link from pitfalls docs (Phase 3c).
10. **Linux/WSL.** Listed in matrix but not exercised. WSL + USB passthrough should work via Android paths; no Linux-specific code, just avoid Windows assumptions when `Host == Linux`.

---

## Appendix: Existing helper inventory

Snapshot from `test/e2e-maestro-coverage` (Phase 3b). _Dispositions are recommendations — final calls happen as each subcommand lands._

### `scripts/maestro/`

| File          | Purpose                                                                                                                                                                                                                                                                                                               | Called by                                                                                                                                           | Disposition                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `reset-db.sh` | `docker exec` -> TRUNCATE all `app.*` + better-auth `public."user"/"session"/"account"/"verification"` tables on `harpa-pro-pg`, then re-INSERT seeded `test@harpapro.com` (with seeded project + draft report + 1 text note) and `test2@harpapro.com`, then run `db:seed-test-account` to create credential accounts | `.maestro/core-end-to-end.yaml`, `.maestro/legacy/*`, `.maestro/pending/*`, `README.md`, `pitfalls-windows#15` (inlined as raw `docker exec` there) | **absorb into `mo reset`** as default + `--seed legacy` variant; keep file until all callers migrated, delete in 3c |

The dir contains **only** `reset-db.sh`. Notably:

- `pitfalls-maestro-mac.md` line 259 references **`scripts/maestro/run.sh`** as "the wrapper that sets `MAESTRO_APP_ID` automatically based on the build profile." **This file does not exist.** Phantom reference — `mo run` should fill the gap; pitfalls doc updated in 3c.
- `.maestro/pending/usage-limit-dialog.yaml` invokes the intended **`./scripts/maestro/reset-db.sh --seed-at-limit`** setup in its header. The script does not accept arguments — `--seed-at-limit` is silently ignored. The pending flow is therefore not runnable until `mo reset --seed at-limit` becomes a first-class flag.

### `scripts/` (E2E-adjacent, top level)

| File                             | Purpose                                                                                                                                                                                                                                                                                               | Called by                                                                                                                         | Disposition                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `check-maestro-testids.sh`       | Greps every `id:` token in `.maestro/modules/`, `.maestro/helpers/`, and `regression-journey.yaml` against `apps/mobile/**/*.{ts,tsx}`. Honours `KNOWN_TEMPLATE_IDS` allowlist for template-resolved IDs (`picker-member-role-editor/viewer`). Treats `*.` and `${` as prefix-match. Exits 1 on miss. | `.github/workflows/e2e-maestro-testid-gate.yml` (PR + push to dev/main, gated on `apps/mobile/` changes)                          | **keep, called by `mo`** — wire into `mo doctor` and pre-`mo run` check. CI workflow stays the source of truth.                  |
| `check-maestro-appid.sh`         | Greps `.maestro/**/*.yaml` for the literal `com.harpa.pro`, fails if found. Enforces use of `${MAESTRO_APP_ID}`.                                                                                                                                                                                      | root `package.json` → `lint` script (chained via `&&`)                                                                            | **keep standalone** — pure lint, not orchestrator-shaped. `mo run` still sets `MAESTRO_APP_ID` correctly from the build variant. |
| `check-no-maestro-point-taps.sh` | Greps `.maestro/**/*.yaml` / `.yml` for `point:` keys, fails if found. Enforces semantic taps by text, accessibility labels, or testIDs instead of device-dependent coordinates.                                                                                                                      | root `package.json` → `lint` script (chained via `&&`); self-tested by `scripts/ci/__tests__/check-no-maestro-point-taps.test.sh` | **keep standalone** — pure lint. `mo run` should inherit the same rule before launching device flows.                            |

No other top-level scripts are Maestro/E2E/device related.

### `.maestro/` (top-level configs only)

| File                                  | Purpose                                                                                                                       | Disposition                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `regression-journey.yaml`             | Orchestrator flow: modules 01 → 17, voice/photo/generate-finalize/report-debug/project-delete/profile/account/usage/sign-out. | **target of `mo journey full`** — input config unchanged      |
| `core-end-to-end.yaml`                | Older P3-exit-gate single-file journey. Depends on `reset-db.sh` (seeded Bob for invite).                                     | **target of `mo journey legacy`** or `mo run core-end-to-end` |
| `modules/15-usage.yaml`               | Normal-regression usage screen and free-plan limits-card coverage, replacing the old P3.14a standalone flow.                  | **target of `mo journey full`**                               |
| `pending/usage-limit-dialog.yaml`     | Placeholder — requires non-existent `reset-db.sh --seed-at-limit`.                                                            | **needs `mo reset --seed at-limit`** before runnable          |
| `pending/usage-near-limit-toast.yaml` | Placeholder — depends on near-limit toast UI + a `report_generate` cap seed.                                                  | **blocked on UI + seed** — out of scope for `mo` initial cut  |
| `legacy/p3-15-voice-record.yaml`      | Legacy seeded voice flow, superseded by module 09.                                                                            | **historical debugging only**                                 |
| `legacy/p3-15-upload.yaml`            | Legacy seeded photo flow, superseded by modules 10a/10b/10c.                                                                  | **historical debugging only**                                 |
| `README.md`                           | Documents `MAESTRO_APP_ID`, setup, run commands, iOS sim quirks (gtimeout + handle orphan `maestro-driver-ios` PIDs).         | **edit in 3c** to point at `mo`                               |

`.maestro/modules/` (17 files) and `.maestro/helpers/` (5 files: `sign-in`, `sign-out`, `pick-country-us`, `dismiss-open-dialog`, `open-project`) are flow content, untouched by `mo`.

### Root `package.json` scripts (E2E-relevant)

| Script    | Command                                                                                                                                               | Disposition                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `lint`    | `turbo run lint && bash scripts/check-no-supabase.sh && … && bash scripts/check-maestro-appid.sh && bash scripts/check-no-maestro-point-taps.sh && …` | keep — Maestro app-id and no-point-tap checks chained in |
| `android` | `expo run:android`                                                                                                                                    | keep — `mo run` will not own native builds               |
| `ios`     | `expo run:ios`                                                                                                                                        | keep — same                                              |

No `maestro:*` / `e2e:*` entries at root. **Gap:** no `pnpm` entry to launch Maestro — every invocation is hand-typed. `mo run` becomes the canonical entry; we may add root alias `"maestro": "mo"` once installed.

### `apps/mobile/package.json` (E2E-relevant)

| Script         | Command                                      | Disposition                                           |
| -------------- | -------------------------------------------- | ----------------------------------------------------- |
| `ios:mock`     | `EXPO_PUBLIC_USE_FIXTURES=true expo run:ios` | keep — `mo` orchestrates Maestro, not native rebuilds |
| `bundle:smoke` | `bash scripts/bundle-smoke.sh`               | unrelated to Maestro, keep                            |

### `docker-compose.yml` (DB-reset surface)

| Service                                          | Role for E2E                                                                                                                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pg` (Postgres 16, `harpa-pro-pg`, host `:5433`) | Target of `reset-db.sh`. `mo reset` needs the container name `harpa-pro-pg` and the same `psql -U postgres -d harpa` invocation.                                                                           |
| `migrate`                                        | One-shot drizzle migration runner; `mo reset` after `compose down -v` must wait for `migrate` to exit cleanly.                                                                                             |
| `api`                                            | Hono fixture-mode API on `:8787`. `DISABLE_RATE_LIMIT=1` set here so the regression journey can sign Alice/Bob in/out repeatedly. `mo doctor` should verify the API responds and that this env var is set. |
| `minio` + `minio-init`                           | R2-compatible storage on `:9000` / console `:9001`; bucket `harpa-pro` created by `minio-init`. `mo doctor` should curl `:9000/minio/health/live` and confirm bucket exists.                               |
| `adminer`                                        | Browser SQL UI on `:8080`. Not used by E2E directly.                                                                                                                                                       |

### `apps/mobile/app.config.ts` — bundle ID

| `APP_VARIANT`           | App name        | Bundle ID (iOS + Android `package`) |
| ----------------------- | --------------- | ----------------------------------- |
| `production`            | `Harpa Pro`     | `com.harpa.pro`                     |
| `preview`               | `Harpa Pro Dev` | `com.harpa.pro.dev`                 |
| `development` (default) | `Harpa Pro Dev` | `com.harpa.pro.dev`                 |

`mo run` resolves `MAESTRO_APP_ID` from `APP_VARIANT` using this table (or explicit `--variant`, defaulting to `development` → `com.harpa.pro.dev`).

### `.github/workflows/` (Maestro-relevant)

| File                          | Trigger                                                                                                             | What it runs                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `e2e-maestro-testid-gate.yml` | `pull_request` + push to `dev`/`main`; `./.github/actions/changed-paths` skips when `apps/mobile/` unchanged on PRs | `bash scripts/check-maestro-testids.sh` only |

No workflow currently runs Maestro itself. A future `e2e-maestro-run.yml` (Mac runner) would call `mo run` directly.

### Git hooks

| Hook              | E2E-relevant lines                                                                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.husky/pre-push` | `pnpm lint` (chains `check-maestro-appid.sh` and `check-no-maestro-point-taps.sh`); `pnpm typecheck`; `pnpm test`; fixture-hash check; `db:check`; `check-secrets.sh` (skippable via `SKIP_SECRET_CHECK=1` — pitfall-windows#18). **Does not run Maestro.** |

### Pitfalls → `mo` subcommand mapping

| Snippet (paraphrased)                                                                                                           | Pitfall                               | Subsumed by                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `docker exec -i harpa-pro-pg psql ... TRUNCATE app.* public."user"/"session"/"account"/"verification" RESTART IDENTITY CASCADE` | win-15                                | `mo reset`                                      |
| `adb -s <serial> shell pm clear com.harpa.pro.dev`                                                                              | win-15                                | `mo reset` (Android)                            |
| `adb -s <serial> reverse tcp:8081 tcp:8081 && … tcp:8787 tcp:8787 && tcp:8790 tcp:8790 && tcp:9000 tcp:9000`                    | win-20                                | `mo doctor` + `mo run` precondition             |
| `adb -s <serial> reverse --list`                                                                                                | win-20                                | `mo doctor`                                     |
| Loop terminating leftover `maestro-driver-ios` processes                                                                        | mac-README + win-runbook              | `mo kill`                                       |
| `gtimeout 240s maestro test …` wrapper loop                                                                                     | README + win-12                       | `mo run --retries N --timeout 240`              |
| Redirect `… > tmp/maestro-jX.log 2> tmp/maestro-jX.err.log` + poll `Get-Content -Tail 50`                                       | win-1, win-12                         | `mo run` (managed log files) + `mo logs --tail` |
| `Get-Process java` (alive check)                                                                                                | win-1                                 | `mo run` (managed PID + status)                 |
| `git checkout -- .` (clean CRLF phantoms before rebase)                                                                         | win-19                                | out of scope (general git hygiene)              |
| `xcrun simctl privacy booted grant {microphone,camera} $MAESTRO_APP_ID`                                                         | README setup                          | `mo doctor --fix` (iOS)                         |
| `/usr/libexec/PlistBuddy … schemeapproval.plist add … harpa string com.harpa.pro.dev`                                           | mac-1 (better solution)               | `mo doctor --fix` (iOS, Mac-only branch)        |
| `xcrun simctl erase` (re-trigger Open-in dialog)                                                                                | mac-6                                 | `mo reset --hard` (iOS)                         |
| `MAESTRO_APP_ID=com.harpa.pro.dev maestro test …`                                                                               | mac-7                                 | `mo run` (auto-resolved from variant)           |
| `docker compose down -v && docker compose up -d` (fresh DB)                                                                     | regression-journey.yaml pre-condition | `mo reset --hard`                               |
| `simctl uninstall` (companion to clearState)                                                                                    | mac-6                                 | `mo reset` (iOS)                                |

### Notable findings

1. **`scripts/maestro/run.sh` referenced but missing** — `pitfalls-maestro-mac.md:259`. `mo run` fills this; doc updated in 3c.
2. **`reset-db.sh --seed-at-limit` referenced but unsupported** — `.maestro/pending/usage-limit-dialog.yaml`. Script ignores all args. The pending flow is not runnable as documented. `mo reset --seed at-limit` needed alongside an at-limit seed SQL.
3. **No CI runs Maestro today** — only the testID gate. Mobile E2E is purely local. `mo` becoming the local entry is a prerequisite for a future Mac-runner CI step.
4. **Two legacy single-purpose flows archived** — `.maestro/legacy/p3-15-voice-record.yaml` and `.maestro/legacy/p3-15-upload.yaml`, superseded by `modules/09-voice-notes.yaml` and the photo modules in the normal regression journey.
5. **Formerly disabled regression modules now active** — modules 09, 10a, 11, 12, 13 part of passing Android local/dev journeys (2026-05-28). Treat as normal coverage.
6. **`reset-db.sh` is bash-only** — Windows runs via Git Bash/WSL. `mo reset` should be pure Python so Windows agent can `docker exec` directly without a shell shim.
7. **Pre-push hook does not run Maestro** — confirms `mo` is developer-driven, on-demand. No need to optimise sub-second startup.
8. **No `package.json` Maestro entry point** anywhere. `mo run` is the first canonical entry.
