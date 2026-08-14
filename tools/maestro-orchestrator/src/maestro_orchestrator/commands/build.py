"""`mo build` — Android dev-client build, detached gradle.

Two-step:

  1. `pnpm --filter @harpa/mobile exec expo prebuild --platform android --clean`
     runs synchronously (~10s, must finish before gradle starts because
     gradle needs the freshly-generated `android/` project).
  2. `gradlew :app:assembleDebug --no-daemon` is spawned detached. Its
     PID is recorded under `tmp/mo/build-android.pid`; stdout/stderr
     stream to `tmp/mo/build-android.log` so the caller can tail it
     with `mo logs --follow --flow build-android` (out of scope for
     this command — `mo logs` already supports arbitrary PID files).

This module deliberately does not try to discover JAVA_HOME or
ANDROID_HOME (Pitfall: silent env-discovery hides setup mistakes).
If either is missing we fail with a clear message and exit non-zero.
iOS is mac-only and intentionally not implemented here.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psutil
from rich.console import Console

from .. import paths, pidfile, spawn
from ..config import MoConfig
from ..report_renderer import emit_step_report

EXIT_OK = 0
EXIT_ENV_MISSING = 1
EXIT_PREBUILD_FAILED = 2
EXIT_GRADLE_SPAWN_FAILED = 3

_PREBUILD_TIMEOUT_SECONDS = 600.0  # cold prebuild can pull plugins; 10min ceiling


@dataclass(frozen=True)
class BuildOptions:
    """CLI-level options for `mo build`."""

    json_output: bool = False
    # Skip the synchronous `expo prebuild` step (useful when iterating
    # on native code without re-running the generator).
    skip_prebuild: bool = False
    variant: str = "debug"


@dataclass
class BuildReport:
    steps: list[dict[str, Any]] = field(default_factory=list)
    exit_code: int = EXIT_OK

    def add(self, name: str, status: str, detail: str = "") -> None:
        self.steps.append({"name": name, "status": status, "detail": detail})


# --- env preflight ------------------------------------------------------
def _require_env(report: BuildReport) -> bool:
    """JAVA_HOME + ANDROID_HOME must be set. We never auto-discover."""
    missing: list[str] = []
    for key in ("JAVA_HOME", "ANDROID_HOME"):
        if not os.environ.get(key):
            missing.append(key)
    if missing:
        report.add(
            "env",
            "fail",
            f"missing env: {', '.join(missing)} — set in shell before `mo build`",
        )
        return False
    report.add("env", "ok", "JAVA_HOME + ANDROID_HOME present")
    return True


# --- prebuild -----------------------------------------------------------
def _pnpm_executable() -> str:
    return "pnpm.cmd" if os.name == "nt" else "pnpm"


def _step_prebuild(cfg: MoConfig, opts: BuildOptions, report: BuildReport) -> bool:
    if opts.skip_prebuild:
        report.add("prebuild", "skip", "--skip-prebuild")
        return True
    argv = [
        _pnpm_executable(),
        "--filter",
        "@harpa/mobile",
        "exec",
        "expo",
        "prebuild",
        "--platform",
        "android",
        "--clean",
    ]
    try:
        result = subprocess.run(  # noqa: S603
            argv,
            shell=False,
            capture_output=True,
            text=True,
            timeout=_PREBUILD_TIMEOUT_SECONDS,
            cwd=str(cfg.project_root),
            check=False,
        )
    except FileNotFoundError:
        report.add("prebuild", "fail", "`pnpm` not on PATH")
        return False
    except subprocess.TimeoutExpired:
        report.add(
            "prebuild",
            "fail",
            f"`expo prebuild` exceeded {_PREBUILD_TIMEOUT_SECONDS:.0f}s",
        )
        return False
    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "").strip().splitlines()[-3:]
        report.add(
            "prebuild",
            "fail",
            f"expo prebuild exited {result.returncode}: {' | '.join(tail)}",
        )
        return False
    report.add("prebuild", "ok", "expo prebuild --platform android --clean")
    return True


# --- gradle -------------------------------------------------------------
def _gradlew_path(project_root: Path) -> Path:
    """Return the platform-correct gradle wrapper path inside `android/`.

    Windows: gradlew.bat. POSIX: ./gradlew. We do not chmod here;
    `expo prebuild` writes the script executable on POSIX hosts.
    """
    android_dir = project_root / "apps" / "mobile" / "android"
    if sys.platform.startswith("win"):
        return android_dir / "gradlew.bat"
    return android_dir / "gradlew"


def _step_gradle(cfg: MoConfig, opts: BuildOptions, report: BuildReport) -> bool:
    gradlew = _gradlew_path(cfg.project_root)
    if not gradlew.exists():
        report.add(
            "gradle",
            "fail",
            f"missing {gradlew} — run prebuild first",
        )
        return False

    assemble_task = (
        ":app:assembleRelease" if opts.variant == "release" else ":app:assembleDebug"
    )
    argv = [str(gradlew), assemble_task, "--no-daemon"]

    paths.ensure_layout(cfg.project_root)
    log_path = paths.build_android_log_file(cfg.project_root)
    pid_path = paths.build_android_pid_file(cfg.project_root)

    try:
        pid = spawn.spawn_detached(
            argv,
            log_path=log_path,
            env=dict(os.environ),
            cwd=gradlew.parent,
        )
    except OSError as exc:
        report.add("gradle", "fail", f"spawn failed: {exc}")
        return False
    try:
        create_time = psutil.Process(pid).create_time()
    except psutil.Error as exc:
        report.add("gradle", "fail", f"pid {pid} disappeared: {exc}")
        return False

    record = pidfile.PidRecord(
        pid=pid,
        create_time=create_time,
        flow="build-android",
        log=str(log_path),
        started_at=pidfile.now_iso(),
        device=None,
    )
    pidfile.write(pid_path, record)
    report.add(
        "gradle",
        "ok",
        f"spawned pid {pid}; log: {log_path}",
    )
    return True


# --- top-level ----------------------------------------------------------
def run_build(
    cfg: MoConfig,
    opts: BuildOptions,
    *,
    console: Console | None = None,
) -> int:
    """Entry point for `mo build`. Returns process exit code."""
    console = console or Console()
    report = BuildReport()

    if not _require_env(report):
        report.exit_code = EXIT_ENV_MISSING
        return _emit(opts, console, report)

    if not _step_prebuild(cfg, opts, report):
        report.exit_code = EXIT_PREBUILD_FAILED
        return _emit(opts, console, report)

    if not _step_gradle(cfg, opts, report):
        report.exit_code = EXIT_GRADLE_SPAWN_FAILED
        return _emit(opts, console, report)

    return _emit(opts, console, report)


# --- output -------------------------------------------------------------
def _emit(opts: BuildOptions, console: Console, report: BuildReport) -> int:
    if opts.json_output:
        print(
            json.dumps(
                {"exit_code": report.exit_code, "steps": report.steps},
                indent=2,
                sort_keys=True,
            )
        )
        return report.exit_code
    emit_step_report(
        console=console,
        title="mo build (android)",
        steps=report.steps,
        success_message=(
            "build: gradle running detached; tail "
            f"{paths.build_android_log_file(Path.cwd())}"
        ),
        failure_message=lambda code, _steps: f"build: exit {code}",
        exit_code=report.exit_code,
    )
    return report.exit_code
