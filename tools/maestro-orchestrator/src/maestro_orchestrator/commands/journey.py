"""`mo journey` -- composite orchestration of doctor + reset + run.

The journey command is intentionally thin: it sequences the existing
primitives (`run_doctor`, `run_reset`, `run_run`) and -- when invoked
with `--watch` -- bounds a polling loop on the spawned Maestro child
so the caller never blocks indefinitely.

Pipeline (each step short-circuits the rest on failure):

    1. doctor --fix         (skippable via --skip-doctor)
    2. reset                (skippable via --skip-reset)
    3. run <flow>           (default flow: regression-journey.yaml)
    4. --watch poll loop    (only when --watch is set; bounded by
                             --watch-timeout, default 1800s = 30m)

On a `--watch` failure exit we surface the latest hierarchy XML +
screenshot we can find (under `tmp/mo/runs/`, `.maestro/output/`,
or `~/.maestro/tests/`). If none is present we say so cleanly --
no crash on a missing artefact.

`mo journey` is the ONLY command in the tool that can legitimately
run longer than a few seconds, and even then it is bounded by
`--watch-timeout`. Without `--watch` it returns as soon as `mo run`
has spawned the detached process.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

import psutil
from rich.console import Console

from .. import paths, pidfile
from ..config import MoConfig
from .doctor import run_doctor
from .reset import ResetOptions, run_reset
from .run import RunOptions, run_run

# Exit codes.
EXIT_OK = 0
EXIT_DOCTOR_FAILED = 10
EXIT_RESET_FAILED = 11
EXIT_RUN_FAILED = 12
EXIT_CHILD_FAILED = 13

# Defaults for --watch.
DEFAULT_WATCH_TIMEOUT_SECONDS = 1800.0
DEFAULT_WATCH_POLL_SECONDS = 5.0
DEFAULT_FLOW = "regression-journey.yaml"

# How many trailing log lines to surface on failure / on watch-timeout.
_LOG_TAIL_LINES = 50


@dataclass(frozen=True)
class JourneyOptions:
    """CLI-level options for `mo journey`."""

    device: str | None = None
    flow: str = DEFAULT_FLOW
    skip_doctor: bool = False
    skip_reset: bool = False
    watch: bool = False
    watch_timeout: float = DEFAULT_WATCH_TIMEOUT_SECONDS
    watch_poll: float = DEFAULT_WATCH_POLL_SECONDS
    force: bool = False
    json_output: bool = False


@dataclass
class JourneyReport:
    """Renderable record of how the journey progressed."""

    steps: list[dict[str, Any]] = field(default_factory=list)
    watch: dict[str, Any] | None = None
    exit_code: int = EXIT_OK
    pid: int | None = None
    log: str | None = None

    def add_step(self, name: str, status: str, detail: str = "") -> None:
        self.steps.append({"name": name, "status": status, "detail": detail})


def run_journey(
    cfg: MoConfig,
    opts: JourneyOptions,
    *,
    console: Console | None = None,
) -> int:
    """Entry point for `mo journey`. Returns process exit code."""
    console = console or Console()
    report = JourneyReport()

    # --- Step 1: doctor --fix --------------------------------------------
    if opts.skip_doctor:
        report.add_step("doctor", "skip", "--skip-doctor")
    else:
        code = run_doctor(
            cfg,
            fix=True,
            json_output=False,
            device=opts.device,
            console=console,
        )
        if code == 0:
            report.add_step("doctor", "ok", "doctor --fix passed")
        else:
            report.add_step(
                "doctor",
                "fail",
                f"doctor --fix exited {code}; "
                "refusing to proceed (pass --skip-doctor to override)",
            )
            report.exit_code = EXIT_DOCTOR_FAILED
            return _emit(opts, console, report)

    # --- Step 2: reset ---------------------------------------------------
    if opts.skip_reset:
        report.add_step("reset", "skip", "--skip-reset")
    else:
        reset_opts = ResetOptions(
            device=opts.device,
            json_output=False,
        )
        code = run_reset(cfg, reset_opts)
        if code == 0:
            report.add_step("reset", "ok", "reset completed")
        else:
            report.add_step(
                "reset",
                "fail",
                f"reset exited {code}; "
                "refusing to proceed (pass --skip-reset to override)",
            )
            report.exit_code = EXIT_RESET_FAILED
            return _emit(opts, console, report)

    # --- Step 3: run -----------------------------------------------------
    run_opts = RunOptions(
        flow=opts.flow,
        device=opts.device,
        force=opts.force,
        json_output=False,
    )
    code = run_run(cfg, run_opts)
    if code != 0:
        report.add_step("run", "fail", f"run exited {code}")
        report.exit_code = EXIT_RUN_FAILED
        return _emit(opts, console, report)
    report.add_step("run", "ok", f"spawned flow {opts.flow}")

    # Capture the just-spawned PID + log for downstream watch / output.
    record = _read_pidfile(cfg.project_root)
    if record is not None:
        report.pid = record.pid
        report.log = record.log

    # --- Step 4: optional bounded watch ---------------------------------
    if opts.watch:
        report.watch = _watch_child(cfg, opts, record, console)
        # Surface a non-zero exit only when we observed the child fail.
        if report.watch.get("outcome") == "failure":
            report.exit_code = EXIT_CHILD_FAILED

    return _emit(opts, console, report)


# --- watch loop ---------------------------------------------------------
def _watch_child(
    cfg: MoConfig,
    opts: JourneyOptions,
    record: pidfile.PidRecord | None,
    console: Console,
    *,
    sleep: Callable[[float], None] = time.sleep,
    monotonic: Callable[[], float] = time.monotonic,
) -> dict[str, Any]:
    """Poll the spawned child up to `opts.watch_timeout` seconds.

    Returns a dict describing the outcome:
      {"outcome": "success" | "failure" | "timeout" | "no_pid",
       "elapsed_seconds": float, ...}
    """
    if record is None:
        return {
            "outcome": "no_pid",
            "detail": "no PID record from `mo run`; nothing to watch",
        }

    poll = max(0.01, float(opts.watch_poll))
    timeout = max(0.0, float(opts.watch_timeout))
    started = monotonic()
    deadline = started + timeout

    # Probe the live process. We poll `pidfile.is_alive` (recycle-safe)
    # and also use psutil to grab an exit code once it's gone.
    while True:
        alive = pidfile.is_alive(record)
        elapsed = monotonic() - started
        if not alive:
            # Process exited. Try to recover its exit status; some
            # platforms only retain that for the parent, but we tried.
            exit_status = _exit_status(record.pid)
            outcome = "success" if (exit_status == 0) else "failure"
            return {
                "outcome": outcome,
                "elapsed_seconds": round(elapsed, 3),
                "exit_status": exit_status,
                "log": record.log,
                "log_tail": _tail(record.log, _LOG_TAIL_LINES),
                "artefacts": _find_failure_artefacts(
                    cfg.project_root, since=started
                ),
            }
        if monotonic() >= deadline:
            return {
                "outcome": "timeout",
                "elapsed_seconds": round(elapsed, 3),
                "pid": record.pid,
                "log": record.log,
                "log_tail": _tail(record.log, _LOG_TAIL_LINES),
                "next_step": (
                    f"run `mo logs --follow --for 60` to keep watching, "
                    f"or `mo kill` to stop pid {record.pid}"
                ),
            }
        sleep(poll)


def _exit_status(pid: int) -> int | None:
    """Best-effort exit-code lookup. None on platforms / states that
    don't retain it for a non-parent observer."""
    try:
        proc = psutil.Process(pid)
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return None
    # psutil's `.wait()` only returns an exit code when called on a
    # child of the current process; detached children won't qualify.
    try:
        return proc.wait(timeout=0)
    except (psutil.TimeoutExpired, psutil.NoSuchProcess):
        return None
    except Exception:  # noqa: BLE001 -- defensive; psutil quirks
        return None


# --- artefact discovery -------------------------------------------------
def _find_failure_artefacts(
    project_root: Path, *, since: float
) -> dict[str, str | None]:
    """Look for hierarchy XML + screenshot dumped by Maestro.

    Searches in known locations, newest first, restricted to files
    modified after `since` (monotonic isn't a wall clock, so we
    compare via mtime + a generous slack).

    Returns {"hierarchy": <path or None>, "screenshot": <path or None>}.
    """
    # We can't compare monotonic seconds to mtime directly; use a wall
    # clock window of "anything modified in the last hour" as a coarse
    # filter so we don't surface stale artefacts from a prior run.
    cutoff = time.time() - 3600.0

    search_dirs: list[Path] = [
        paths.runs_dir(project_root),
        project_root / ".maestro" / "output",
    ]
    home_maestro = Path(os.path.expanduser("~")) / ".maestro" / "tests"
    if home_maestro.is_dir():
        search_dirs.append(home_maestro)

    hierarchy = _newest_match(search_dirs, ("*.xml",), cutoff)
    screenshot = _newest_match(search_dirs, ("*.png", "*.jpg"), cutoff)
    return {
        "hierarchy": str(hierarchy) if hierarchy else None,
        "screenshot": str(screenshot) if screenshot else None,
    }


def _newest_match(
    dirs: list[Path], patterns: tuple[str, ...], cutoff: float
) -> Path | None:
    """Newest file matching any pattern under any dir, mtime >= cutoff."""
    best: tuple[float, Path] | None = None
    for d in dirs:
        if not d.is_dir():
            continue
        for pat in patterns:
            for p in d.rglob(pat):
                try:
                    mtime = p.stat().st_mtime
                except OSError:
                    continue
                if mtime < cutoff:
                    continue
                if best is None or mtime > best[0]:
                    best = (mtime, p)
    return best[1] if best else None


# --- log tail helper ----------------------------------------------------
def _tail(log_path: str | None, n: int) -> list[str]:
    """Return the last `n` lines of `log_path` as a list (no newlines)."""
    if not log_path:
        return []
    try:
        size = os.path.getsize(log_path)
    except OSError:
        return []
    # Bounded read: cap at last 64 KiB regardless of n.
    read_bytes = min(size, 65536)
    try:
        with open(log_path, "rb") as fh:
            fh.seek(size - read_bytes)
            data = fh.read()
    except OSError:
        return []
    text = data.decode("utf-8", errors="replace")
    lines = text.splitlines()
    return lines[-n:]


# --- pidfile read helper ------------------------------------------------
def _read_pidfile(project_root: Path) -> pidfile.PidRecord | None:
    """Read tmp/mo/maestro.pid swallowing parse errors."""
    try:
        return pidfile.read(paths.pid_file(project_root))
    except Exception:  # noqa: BLE001
        return None


# --- emit ---------------------------------------------------------------
def _emit(
    opts: JourneyOptions, console: Console, report: JourneyReport
) -> int:
    if opts.json_output:
        print(
            json.dumps(
                {
                    "exit_code": report.exit_code,
                    "pid": report.pid,
                    "log": report.log,
                    "steps": report.steps,
                    "watch": report.watch,
                },
                indent=2,
                sort_keys=True,
            )
        )
    else:
        _emit_human(opts, console, report)
    return report.exit_code


def _emit_human(
    opts: JourneyOptions, console: Console, report: JourneyReport
) -> None:
    use_color = console.is_terminal and not console.no_color
    for step in report.steps:
        status = step["status"]
        tag = {
            "ok": "[green]OK[/green]" if use_color else "[OK]",
            "fail": "[red]FAIL[/red]" if use_color else "[FAIL]",
            "skip": "[dim]SKIP[/dim]" if use_color else "[SKIP]",
        }.get(status, status)
        console.print(f"journey: {tag} {step['name']}: {step['detail']}")

    if report.pid is not None:
        console.print(
            f"journey: spawned pid {report.pid}; log: {report.log}"
        )

    if report.watch is not None:
        outcome = report.watch.get("outcome", "?")
        elapsed = report.watch.get("elapsed_seconds")
        if outcome == "success":
            msg = f"journey: child exited cleanly after {elapsed}s"
            console.print(
                f"[green]{msg}[/green]" if use_color else msg
            )
        elif outcome == "failure":
            console.print(
                f"[red]journey: child exited non-zero after {elapsed}s[/red]"
                if use_color
                else f"journey: child exited non-zero after {elapsed}s"
            )
            artefacts = report.watch.get("artefacts") or {}
            h = artefacts.get("hierarchy")
            s = artefacts.get("screenshot")
            if h:
                console.print(f"  hierarchy: {h}")
            else:
                console.print("  hierarchy: no hierarchy artefact found")
            if s:
                console.print(f"  screenshot: {s}")
            else:
                console.print("  screenshot: no screenshot artefact found")
            for line in report.watch.get("log_tail", []):
                console.print(f"  | {line}")
        elif outcome == "timeout":
            console.print(
                f"journey: watch timed out after {elapsed}s "
                f"(pid {report.watch.get('pid')} still running)"
            )
            console.print(f"  next: {report.watch.get('next_step')}")
            for line in report.watch.get("log_tail", []):
                console.print(f"  | {line}")
        elif outcome == "no_pid":
            console.print(
                f"journey: watch skipped -- {report.watch.get('detail')}"
            )

    if report.exit_code == EXIT_OK:
        return
    err = Console(stderr=True, no_color=not use_color)
    err.print(f"journey: exit {report.exit_code}")
