"""`mo kill` — terminate the live runner + orphaned drivers.

Cleans up everything `mo run` (or a hung previous run) might have left
behind:

1. The PID-tracked process (if still alive AND create_time matches).
2. Orphaned `java -jar maestro.jar` JVM processes from prior runs
   (Pitfall windows#1).
3. Orphaned `maestro-driver-ios` helpers (mac).

The first step is gated on a recycle-safe match: if the PID record's
`create_time()` no longer matches the process at that PID, we treat
the PID file as stale and just delete it instead of killing some
unrelated user shell.

`--orphans-only` skips step 1; useful when the PID file is missing
but residual JVMs remain.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal

import psutil
from rich.console import Console
from rich.table import Table

from .. import host, paths, pidfile, procs
from ..config import MoConfig

EXIT_OK = 0

# How long to wait between terminate() and kill() for the PID-tracked
# process. Mirrors `procs.kill_processes`' default for orphan sweeps.
_GRACE_SECONDS = 5.0


@dataclass(frozen=True)
class KillOptions:
    """CLI-level options for `mo kill`."""

    orphans_only: bool = False
    json_output: bool = False


# --- report shape -------------------------------------------------------
KillAction = Literal["terminated", "killed", "skipped", "absent"]


@dataclass(frozen=True)
class KilledProcess:
    """One line in the kill report."""

    pid: int
    kind: str  # "tracked" | "orphan-maestro" | "orphan-ios-driver"
    action: KillAction
    detail: str = ""


@dataclass(frozen=True)
class KillReport:
    """Aggregate report emitted as JSON / table."""

    tracked: KilledProcess | None
    orphans: list[KilledProcess] = field(default_factory=list)
    pid_file_removed: bool = False


# --- tracked-PID killer -------------------------------------------------
def _kill_tracked(record: pidfile.PidRecord) -> KilledProcess:
    """Terminate the PID-file-tracked process.

    Returns a structured outcome:
      * "absent"     — PID not alive or create_time mismatches (recycled).
      * "terminated" — graceful terminate() succeeded within grace window.
      * "killed"     — escalated to kill() after grace expired.
    """
    if not pidfile.is_alive(record):
        return KilledProcess(
            pid=record.pid,
            kind="tracked",
            action="absent",
            detail="not alive or PID recycled",
        )

    try:
        proc = psutil.Process(record.pid)
    except psutil.NoSuchProcess:
        return KilledProcess(
            pid=record.pid, kind="tracked", action="absent", detail="vanished"
        )

    try:
        proc.terminate()
    except psutil.NoSuchProcess:
        return KilledProcess(
            pid=record.pid, kind="tracked", action="absent", detail="vanished"
        )

    try:
        proc.wait(timeout=_GRACE_SECONDS)
        return KilledProcess(
            pid=record.pid,
            kind="tracked",
            action="terminated",
            detail=f"terminated within {_GRACE_SECONDS}s",
        )
    except psutil.TimeoutExpired:
        pass

    try:
        proc.kill()
        return KilledProcess(
            pid=record.pid,
            kind="tracked",
            action="killed",
            detail=f"force-killed after {_GRACE_SECONDS}s grace",
        )
    except psutil.NoSuchProcess:
        return KilledProcess(
            pid=record.pid, kind="tracked", action="terminated", detail="exited"
        )


# --- orphan sweep -------------------------------------------------------
def _sweep_orphans() -> list[KilledProcess]:
    """Kill orphaned maestro JVMs + iOS drivers. Returns one row per PID."""
    results: list[KilledProcess] = []

    # Java-based maestro runner.
    jvm = procs.find_processes("maestro")
    # Filter to those that actually look like the maestro jar — avoid
    # killing unrelated user-installed CLIs that happen to mention the
    # word "maestro".
    jvm = [p for p in jvm if _looks_like_maestro_jvm(p)]
    touched_pids = set(procs.kill_processes(jvm, grace_seconds=2.0))
    for p in jvm:
        results.append(
            KilledProcess(
                pid=p.pid,
                kind="orphan-maestro",
                action="terminated" if p.pid in touched_pids else "absent",
                detail=" ".join(_safe_cmdline(p))[:120],
            )
        )

    # macOS iOS driver helper.
    if host.is_macos():
        ios = procs.find_processes("maestro-driver-ios")
        touched_ios = set(procs.kill_processes(ios, grace_seconds=2.0))
        for p in ios:
            results.append(
                KilledProcess(
                    pid=p.pid,
                    kind="orphan-ios-driver",
                    action="terminated" if p.pid in touched_ios else "absent",
                    detail=" ".join(_safe_cmdline(p))[:120],
                )
            )

    return results


def _looks_like_maestro_jvm(proc: psutil.Process) -> bool:
    """Heuristic: a java process whose cmdline mentions maestro.jar."""
    try:
        cmd = proc.cmdline() or []
        name = (proc.name() or "").lower()
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return False
    joined = " ".join(cmd).lower()
    if "maestro.jar" in joined or "maestro-cli" in joined:
        return True
    # Don't kill the orchestrator's own python.
    if "python" in name:
        return False
    return False


def _safe_cmdline(proc: psutil.Process) -> list[str]:
    try:
        return proc.cmdline() or []
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return []


# --- top-level orchestration -------------------------------------------
def run_kill(cfg: MoConfig, opts: KillOptions) -> int:
    """Entry point for `mo kill`. Always returns 0 unless we can't even start."""
    pid_path = paths.pid_file(cfg.project_root)

    tracked: KilledProcess | None = None
    if not opts.orphans_only:
        try:
            record = pidfile.read(pid_path)
        except Exception:  # noqa: BLE001 — stale/garbled file is a no-op here
            record = None
        if record is not None:
            tracked = _kill_tracked(record)

    orphans = _sweep_orphans()

    pid_removed = False
    if not opts.orphans_only and pid_path.exists():
        pid_removed = pidfile.remove(pid_path)

    report = KillReport(tracked=tracked, orphans=orphans, pid_file_removed=pid_removed)

    # Persist the report next to other mo state.
    _write_report(paths.kill_report(cfg.project_root), report)

    if opts.json_output:
        _emit_json(report)
    else:
        _emit_human(report, cfg.project_root)
    return EXIT_OK


# --- output -------------------------------------------------------------
def _emit_json(report: KillReport) -> None:
    payload = {
        "tracked": asdict(report.tracked) if report.tracked else None,
        "orphans": [asdict(o) for o in report.orphans],
        "pid_file_removed": report.pid_file_removed,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


def _emit_human(report: KillReport, project_root: Path) -> None:
    console = Console()
    use_color = console.is_terminal and not console.no_color
    table = Table(title="mo kill")
    table.add_column("kind")
    table.add_column("pid", no_wrap=True)
    table.add_column("action")
    table.add_column("detail", overflow="fold")
    if report.tracked is not None:
        table.add_row(
            report.tracked.kind,
            str(report.tracked.pid),
            report.tracked.action,
            report.tracked.detail,
        )
    for o in report.orphans:
        table.add_row(o.kind, str(o.pid), o.action, o.detail)
    if report.tracked is None and not report.orphans:
        table.add_row("(none)", "-", "-", "nothing to kill")
    console.print(table)
    if report.pid_file_removed:
        msg = "pid file removed"
        console.print(f"[dim]{msg}[/dim]" if use_color else msg)


def _write_report(path: Path, report: KillReport) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "tracked": asdict(report.tracked) if report.tracked else None,
        "orphans": [asdict(o) for o in report.orphans],
        "pid_file_removed": report.pid_file_removed,
        "at": pidfile.now_iso(),
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
