"""`mo down` — stop Metro and the docker-compose stack.

Counterpart to `mo up`. Idempotent: missing PID files or already-stopped
containers are not errors. Volumes are preserved (we call
`docker compose stop`, never `down -v`) — `mo reset` is the canonical
way to wipe state.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from dataclasses import dataclass, field
from typing import Any

import psutil
from rich.console import Console
from rich.table import Table

from .. import paths, pidfile
from ..config import MoConfig

EXIT_OK = 0
EXIT_DOCKER_FAILED = 1

_KILL_GRACE_SECONDS = 5.0


@dataclass(frozen=True)
class DownOptions:
    """CLI-level options for `mo down`."""

    json_output: bool = False
    keep_docker: bool = False


@dataclass
class DownReport:
    """Renderable record of `mo down` progress."""

    steps: list[dict[str, Any]] = field(default_factory=list)
    exit_code: int = EXIT_OK

    def add(self, name: str, status: str, detail: str = "") -> None:
        self.steps.append({"name": name, "status": status, "detail": detail})


# --- metro --------------------------------------------------------------
def _kill_pid(pid: int) -> None:
    """Send SIGTERM (POSIX) / terminate() (Windows). Best-effort, no raise."""
    try:
        proc = psutil.Process(pid)
    except psutil.NoSuchProcess:
        return
    try:
        # Kill children first so Metro's `node` subprocess doesn't get
        # orphaned on Windows when the pnpm shim exits.
        for child in proc.children(recursive=True):
            try:
                child.terminate()
            except psutil.Error:
                pass
        proc.terminate()
    except psutil.Error:
        return
    try:
        proc.wait(timeout=_KILL_GRACE_SECONDS)
    except psutil.TimeoutExpired:
        try:
            proc.kill()
        except psutil.Error:
            pass
    except psutil.Error:
        pass


def _step_metro(cfg: MoConfig, report: DownReport) -> None:
    pid_path = paths.metro_pid_file(cfg.project_root)
    try:
        record = pidfile.read(pid_path)
    except Exception as exc:  # noqa: BLE001 — corrupt PID file
        report.add("metro", "warn", f"unreadable pid file: {exc}")
        pidfile.remove(pid_path)
        return
    if record is None:
        report.add("metro", "skip", "no tracked metro process")
        return
    if not pidfile.is_alive(record):
        report.add("metro", "skip", f"pid {record.pid} not alive")
        pidfile.remove(pid_path)
        return
    _kill_pid(record.pid)
    pidfile.remove(pid_path)
    report.add("metro", "ok", f"terminated pid {record.pid}")


# --- docker -------------------------------------------------------------
def _step_docker(cfg: MoConfig, opts: DownOptions, report: DownReport) -> bool:
    if opts.keep_docker:
        report.add("docker", "skip", "--keep-docker")
        return True
    try:
        result = subprocess.run(  # noqa: S603
            ["docker", "compose", "stop"],
            shell=False,
            capture_output=True,
            text=True,
            timeout=60.0,
            cwd=str(cfg.project_root),
            check=False,
        )
    except FileNotFoundError:
        report.add("docker", "fail", "`docker` not on PATH")
        return False
    except subprocess.TimeoutExpired:
        report.add("docker", "fail", "`docker compose stop` timed out")
        return False
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[:300]
        report.add(
            "docker",
            "fail",
            f"compose stop exited {result.returncode}: {detail}",
        )
        return False
    report.add("docker", "ok", "compose stop completed")
    return True


# --- top-level ----------------------------------------------------------
def run_down(
    cfg: MoConfig,
    opts: DownOptions,
    *,
    console: Console | None = None,
) -> int:
    """Entry point for `mo down`. Returns process exit code."""
    console = console or Console()
    report = DownReport()

    _step_metro(cfg, report)

    if not _step_docker(cfg, opts, report):
        report.exit_code = EXIT_DOCKER_FAILED

    return _emit(opts, console, report)


# --- output -------------------------------------------------------------
_GLYPHS_RICH = {
    "ok": "[green]OK[/green]",
    "fail": "[red]FAIL[/red]",
    "warn": "[yellow]WARN[/yellow]",
    "skip": "[dim]SKIP[/dim]",
}
_GLYPHS_PLAIN = {
    "ok": "[OK]",
    "fail": "[FAIL]",
    "warn": "[WARN]",
    "skip": "[SKIP]",
}


def _emit(opts: DownOptions, console: Console, report: DownReport) -> int:
    if opts.json_output:
        print(
            json.dumps(
                {"exit_code": report.exit_code, "steps": report.steps},
                indent=2,
                sort_keys=True,
            )
        )
        return report.exit_code
    use_color = console.is_terminal and not console.no_color
    table = Table(title="mo down")
    table.add_column("status", no_wrap=True)
    table.add_column("step", no_wrap=True)
    table.add_column("detail", overflow="fold")
    for step in report.steps:
        tag = (
            _GLYPHS_RICH.get(step["status"], step["status"])
            if use_color
            else _GLYPHS_PLAIN.get(step["status"], step["status"])
        )
        table.add_row(tag, step["name"], step["detail"])
    console.print(table)
    if report.exit_code == 0:
        msg = "down: all steps completed"
        console.print(f"[green]{msg}[/green]" if use_color else msg)
    else:
        console.print(
            f"[red]down: exit {report.exit_code}[/red]"
            if use_color
            else f"down: exit {report.exit_code}"
        )
    return report.exit_code
