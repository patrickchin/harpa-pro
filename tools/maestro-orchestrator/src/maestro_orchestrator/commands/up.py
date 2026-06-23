"""`mo up` — idempotent active provisioning.

Brings the local dev stack into "ready to run Maestro" shape:

  1. Ensure docker-compose stack (pg/api/minio) is up and `/healthz`
     returns 200.
  2. Re-establish `adb reverse tcp:8081`, `tcp:8787`, `tcp:8790`, and
     `tcp:9000` if missing.
  3. Ensure the local auth broker is running on :8790.
  4. Ensure Metro packager is running on :8081 with fixture wiring
     (`EXPO_PUBLIC_USE_FIXTURES=true`,
      `EXPO_PUBLIC_API_BASE_URL=http://localhost:8787`).
  5. Run the doctor check catalogue one final time and report.

Each step is short-circuiting: if a sub-step is already in the
desired state we don't redo it. Cold start (everything stopped) is
bounded: Metro spawn is detached and we poll its `/status` endpoint
with a short timeout so the command itself returns within seconds.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table

from .. import checks, device, healthcheck, host, paths, pidfile, spawn
from ..config import MoConfig
from .doctor import run_doctor

EXIT_OK = 0
EXIT_DOCKER_FAILED = 1
EXIT_METRO_FAILED = 2
EXIT_DOCTOR_FAILED = 3
EXIT_AUTH_BROKER_FAILED = 6

# Budgets.
_DOCKER_POLL_TIMEOUT_SECONDS = 60.0
_DOCKER_POLL_INTERVAL = 1.0
_METRO_POLL_TIMEOUT_SECONDS = 60.0
_METRO_POLL_INTERVAL = 1.0
_HTTP_TIMEOUT_SECONDS = 2.0

_API_HEALTH_URL = "http://localhost:8787/healthz"
_AUTH_BROKER_HEALTH_URL = "http://127.0.0.1:8790/healthz"
_METRO_STATUS_URL = "http://localhost:8081/status"
_METRO_STATUS_MARKER = "packager-status:running"
_DEFAULT_TEST_ACCOUNT_EMAILS = "test@harpapro.com,test2@harpapro.com,test3@harpapro.com"


@dataclass(frozen=True)
class UpOptions:
    """CLI-level options for `mo up`."""

    device: str | None = None
    skip_doctor: bool = False
    json_output: bool = False
    # Metro startup deadline (seconds). The default is generous enough for
    # cold-cache first-launch; tests override to keep the suite fast.
    metro_timeout: float = _METRO_POLL_TIMEOUT_SECONDS
    docker_timeout: float = _DOCKER_POLL_TIMEOUT_SECONDS


@dataclass
class UpReport:
    """Renderable record of how `mo up` progressed."""

    steps: list[dict[str, Any]] = field(default_factory=list)
    exit_code: int = EXIT_OK

    def add(self, name: str, status: str, detail: str = "") -> None:
        self.steps.append({"name": name, "status": status, "detail": detail})


# --- docker -------------------------------------------------------------
def _docker_stack_running(cfg: MoConfig) -> bool:
    """True iff `check_docker_stack` reports ok."""
    ctx = checks.DoctorContext(
        cfg=cfg, host_name=host.detect_host(), device=None, fix=False
    )
    return checks.check_docker_stack(ctx).status == "ok"


def _docker_compose_up(cfg: MoConfig) -> tuple[bool, str]:
    """`docker compose up -d` in the project root. Returns (ok, detail)."""
    try:
        result = subprocess.run(  # noqa: S603
            ["docker", "compose", "up", "-d"],
            shell=False,
            capture_output=True,
            text=True,
            timeout=120.0,
            cwd=str(cfg.project_root),
            check=False,
        )
    except FileNotFoundError:
        return False, "`docker` not on PATH"
    except subprocess.TimeoutExpired:
        return False, "`docker compose up -d` timed out"
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[:300]
        return False, f"docker compose up -d exited {result.returncode}: {detail}"
    return True, "docker compose up -d completed"


def _poll_api_healthy(*, deadline: float, sleep: Any = time.sleep) -> bool:
    """Poll `/healthz` until 200 or `deadline` (monotonic seconds) elapses."""
    while time.monotonic() < deadline:
        res = healthcheck.http_get(_API_HEALTH_URL, timeout=_HTTP_TIMEOUT_SECONDS)
        if res.ok:
            return True
        sleep(_DOCKER_POLL_INTERVAL)
    return False


def _step_docker(cfg: MoConfig, opts: UpOptions, report: UpReport) -> bool:
    """Returns True iff stack is up after the step."""
    if _docker_stack_running(cfg):
        # Also confirm /healthz before claiming success.
        res = healthcheck.http_get(_API_HEALTH_URL, timeout=_HTTP_TIMEOUT_SECONDS)
        if res.ok:
            report.add("docker", "skip", "stack already up + healthy")
            return True
        # Containers reported running but API not healthy yet — fall through
        # and poll. No need to re-issue `up -d`.
        deadline = time.monotonic() + max(0.0, opts.docker_timeout)
        if _poll_api_healthy(deadline=deadline):
            report.add("docker", "ok", "API healthy after wait")
            return True
        report.add("docker", "fail", "API did not become healthy in budget")
        return False

    ok, detail = _docker_compose_up(cfg)
    if not ok:
        report.add("docker", "fail", detail)
        return False
    deadline = time.monotonic() + max(0.0, opts.docker_timeout)
    if not _poll_api_healthy(deadline=deadline):
        report.add(
            "docker",
            "fail",
            f"`/healthz` not 200 within {opts.docker_timeout:.0f}s",
        )
        return False
    report.add("docker", "ok", detail)
    return True


# --- adb reverse --------------------------------------------------------
def _step_reverse(cfg: MoConfig, opts: UpOptions, report: UpReport) -> None:
    """Best-effort `adb reverse` re-establish; never blocks `mo up`."""
    host_name = host.detect_host()
    if host_name == "macos":
        report.add("reverse", "skip", "iOS shares host loopback; no adb reverse")
        return
    res = device.adb_reverse_ports(
        host_name=host_name, device_id=opts.device or cfg.device
    )
    if res.skipped:
        report.add("reverse", "skip", res.detail)
    elif res.ok:
        report.add("reverse", "ok", res.detail)
    else:
        # Don't fail mo up over a missing device — doctor will catch it.
        report.add("reverse", "warn", res.detail)


# --- auth broker --------------------------------------------------------
def _auth_broker_ready() -> bool:
    """Auth broker `/healthz` is reachable on localhost:8790."""
    res = healthcheck.http_get(
        _AUTH_BROKER_HEALTH_URL,
        timeout=_HTTP_TIMEOUT_SECONDS,
    )
    return res.ok


def _tracked_auth_broker_alive(project_root: Path) -> bool:
    try:
        record = pidfile.read(paths.auth_broker_pid_file(project_root))
    except Exception:  # noqa: BLE001 — garbled file == not tracked
        return False
    if record is None:
        return False
    return pidfile.is_alive(record)


def _spawn_auth_broker(cfg: MoConfig) -> tuple[int | None, str]:
    """Spawn the local auth broker detached. Returns (pid, detail)."""
    project_root = cfg.project_root
    paths.ensure_layout(project_root)
    log_path = paths.auth_broker_log_file(project_root)
    script = project_root / "scripts" / "dev-e2e-auth-broker.cjs"
    if not script.exists():
        return None, f"auth broker script not found: {script}"

    env = dict(os.environ)
    env.setdefault("TEST_ACCOUNT_EMAILS", _DEFAULT_TEST_ACCOUNT_EMAILS)
    argv = ["node", str(script)]

    try:
        pid = spawn.spawn_detached(
            argv,
            log_path=log_path,
            env=env,
            cwd=project_root,
        )
    except OSError as exc:
        return None, f"failed to spawn auth broker: {exc}"

    try:
        import psutil

        create_time = psutil.Process(pid).create_time()
    except Exception:  # noqa: BLE001
        return None, f"auth broker pid {pid} disappeared immediately"

    record = pidfile.PidRecord(
        pid=pid,
        create_time=create_time,
        flow="auth-broker",
        log=str(log_path),
        started_at=pidfile.now_iso(),
        device=None,
    )
    pidfile.write(paths.auth_broker_pid_file(project_root), record)
    return pid, f"spawned pid {pid}; log: {log_path}"


def _poll_auth_broker_ready(*, deadline: float, sleep: Any = time.sleep) -> bool:
    while time.monotonic() < deadline:
        if _auth_broker_ready():
            return True
        sleep(_DOCKER_POLL_INTERVAL)
    return False


def _step_auth_broker(cfg: MoConfig, opts: UpOptions, report: UpReport) -> bool:
    if _auth_broker_ready():
        report.add("auth_broker", "skip", "already running on :8790")
        return True

    pid, detail = _spawn_auth_broker(cfg)
    if pid is None:
        report.add("auth_broker", "fail", detail)
        return False
    deadline = time.monotonic() + max(0.0, opts.docker_timeout)
    if not _poll_auth_broker_ready(deadline=deadline):
        report.add(
            "auth_broker",
            "fail",
            f"{detail}; /healthz not ready within {opts.docker_timeout:.0f}s",
        )
        return False
    report.add("auth_broker", "ok", detail)
    return True


# --- metro --------------------------------------------------------------
def _metro_ready() -> bool:
    """`/status` returns the canonical packager marker."""
    res = healthcheck.http_get(
        _METRO_STATUS_URL,
        timeout=_HTTP_TIMEOUT_SECONDS,
        must_contain=_METRO_STATUS_MARKER,
    )
    return res.ok


def _tracked_metro_alive(project_root: Path) -> bool:
    """Is there a tmp/mo/metro.pid record pointing at a live process?"""
    try:
        record = pidfile.read(paths.metro_pid_file(project_root))
    except Exception:  # noqa: BLE001 — garbled file == not tracked
        return False
    if record is None:
        return False
    return pidfile.is_alive(record)


def _spawn_metro(cfg: MoConfig) -> tuple[int | None, str]:
    """Spawn `expo start` detached. Returns (pid, detail)."""
    project_root = cfg.project_root
    paths.ensure_layout(project_root)
    log_path = paths.metro_log_file(project_root)

    # pnpm is required on the host; we go through pnpm so the workspace
    # filter resolves the right Expo binary.
    if os.name == "nt":
        pnpm = "pnpm.cmd"
    else:
        pnpm = "pnpm"

    argv = [
        pnpm,
        "--filter",
        "@harpa/mobile",
        "exec",
        "expo",
        "start",
        "--dev-client",
        "--port",
        "8081",
    ]

    env = dict(os.environ)
    env["EXPO_PUBLIC_USE_FIXTURES"] = "true"
    env["EXPO_PUBLIC_API_BASE_URL"] = "http://localhost:8787"

    try:
        pid = spawn.spawn_detached(
            argv,
            log_path=log_path,
            env=env,
            cwd=project_root,
        )
    except OSError as exc:
        return None, f"failed to spawn metro: {exc}"

    # Record the PID for `mo down` / future runs.
    try:
        import psutil

        create_time = psutil.Process(pid).create_time()
    except Exception:  # noqa: BLE001
        return None, f"metro pid {pid} disappeared immediately"

    record = pidfile.PidRecord(
        pid=pid,
        create_time=create_time,
        flow="metro",
        log=str(log_path),
        started_at=pidfile.now_iso(),
        device=None,
    )
    pidfile.write(paths.metro_pid_file(project_root), record)
    return pid, f"spawned pid {pid}; log: {log_path}"


def _poll_metro_ready(*, deadline: float, sleep: Any = time.sleep) -> bool:
    while time.monotonic() < deadline:
        if _metro_ready():
            return True
        sleep(_METRO_POLL_INTERVAL)
    return False


def _step_metro(cfg: MoConfig, opts: UpOptions, report: UpReport) -> bool:
    """Returns True iff Metro is ready after the step."""
    if _metro_ready():
        report.add("metro", "skip", "packager already running")
        return True

    pid, detail = _spawn_metro(cfg)
    if pid is None:
        report.add("metro", "fail", detail)
        return False
    deadline = time.monotonic() + max(0.0, opts.metro_timeout)
    if not _poll_metro_ready(deadline=deadline):
        report.add(
            "metro",
            "fail",
            f"{detail}; /status not ready within {opts.metro_timeout:.0f}s",
        )
        return False
    report.add("metro", "ok", detail)
    return True


# --- doctor final pass --------------------------------------------------
def _step_doctor(
    cfg: MoConfig, opts: UpOptions, report: UpReport, console: Console
) -> bool:
    if opts.skip_doctor:
        report.add("doctor", "skip", "--skip-doctor")
        return True
    code = run_doctor(
        cfg,
        fix=False,
        json_output=False,
        device=opts.device,
        console=console,
    )
    if code == 0:
        report.add("doctor", "ok", "all required checks passed")
        return True
    report.add("doctor", "fail", f"doctor exited {code}")
    return False


# --- top-level ----------------------------------------------------------
def run_up(
    cfg: MoConfig,
    opts: UpOptions,
    *,
    console: Console | None = None,
) -> int:
    """Entry point for `mo up`. Returns process exit code."""
    console = console or Console()
    report = UpReport()

    if not _step_docker(cfg, opts, report):
        report.exit_code = EXIT_DOCKER_FAILED
        return _emit(opts, console, report)

    _step_reverse(cfg, opts, report)

    if not _step_auth_broker(cfg, opts, report):
        report.exit_code = EXIT_AUTH_BROKER_FAILED
        return _emit(opts, console, report)

    if not _step_metro(cfg, opts, report):
        report.exit_code = EXIT_METRO_FAILED
        return _emit(opts, console, report)

    if not _step_doctor(cfg, opts, report, console):
        report.exit_code = EXIT_DOCTOR_FAILED
        return _emit(opts, console, report)

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


def _emit(opts: UpOptions, console: Console, report: UpReport) -> int:
    if opts.json_output:
        print(
            json.dumps(
                {"exit_code": report.exit_code, "steps": report.steps},
                indent=2,
                sort_keys=True,
            )
        )
    else:
        use_color = console.is_terminal and not console.no_color
        table = Table(title=f"mo up — host: {host.detect_host()}")
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
            msg = "up: all steps completed"
            console.print(f"[green]{msg}[/green]" if use_color else msg)
        else:
            console.print(
                f"[red]up: exit {report.exit_code}[/red]"
                if use_color
                else f"up: exit {report.exit_code}"
            )
    return report.exit_code
