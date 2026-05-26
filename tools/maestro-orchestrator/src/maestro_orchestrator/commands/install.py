"""`mo install` — push the freshly-built debug APK to the device.

Picks the newest `*-debug.apk` under
`apps/mobile/android/app/build/outputs/apk/debug/` and runs
`adb [-s <serial>] install -r <apk>`.

Guard rails:

* If no APK is present → fail (told user to run `mo build`).
* If the newest APK is older than `--max-age` hours (default 24) → fail
  unless `--force`. Catching the common "we forgot to rebuild" trap.
* `adb install -r` (replace) so re-installing the same version_code
  succeeds.
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

from ..config import MoConfig

EXIT_OK = 0
EXIT_NO_APK = 1
EXIT_STALE_APK = 2
EXIT_ADB_FAILED = 3

_INSTALL_TIMEOUT_SECONDS = 180.0


@dataclass(frozen=True)
class InstallOptions:
    """CLI-level options for `mo install`."""

    device: str | None = None
    json_output: bool = False
    force: bool = False
    # Newest APK must be at most this many hours old, else stale.
    max_age_hours: float = 24.0


@dataclass
class InstallReport:
    steps: list[dict[str, Any]] = field(default_factory=list)
    exit_code: int = EXIT_OK

    def add(self, name: str, status: str, detail: str = "") -> None:
        self.steps.append({"name": name, "status": status, "detail": detail})


def _apk_dir(cfg: MoConfig) -> Path:
    return (
        cfg.project_root
        / "apps"
        / "mobile"
        / "android"
        / "app"
        / "build"
        / "outputs"
        / "apk"
        / "debug"
    )


def _newest_apk(cfg: MoConfig) -> Path | None:
    """Most-recently-modified `*.apk` in the debug output dir, or None."""
    out = _apk_dir(cfg)
    try:
        candidates = [p for p in out.iterdir() if p.suffix == ".apk"]
    except FileNotFoundError:
        return None
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def _step_resolve_apk(
    cfg: MoConfig, opts: InstallOptions, report: InstallReport
) -> Path | None:
    apk = _newest_apk(cfg)
    if apk is None:
        report.add(
            "apk",
            "fail",
            f"no APK under {_apk_dir(cfg)} — run `mo build` first",
        )
        return None

    age_seconds = time.time() - apk.stat().st_mtime
    age_hours = age_seconds / 3600.0
    if age_hours > opts.max_age_hours and not opts.force:
        report.add(
            "apk",
            "fail",
            (
                f"{apk.name} is {age_hours:.1f}h old "
                f"(>{opts.max_age_hours:.1f}h); rerun `mo build` "
                f"or pass --force"
            ),
        )
        return None
    report.add("apk", "ok", f"{apk.name} ({age_hours:.1f}h old)")
    return apk


def _step_adb_install(
    opts: InstallOptions, apk: Path, report: InstallReport
) -> bool:
    argv = ["adb"]
    if opts.device:
        argv += ["-s", opts.device]
    argv += ["install", "-r", str(apk)]
    try:
        result = subprocess.run(  # noqa: S603
            argv,
            shell=False,
            capture_output=True,
            text=True,
            timeout=_INSTALL_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError:
        report.add("adb_install", "fail", "`adb` not on PATH")
        return False
    except subprocess.TimeoutExpired:
        report.add(
            "adb_install",
            "fail",
            f"`adb install` exceeded {_INSTALL_TIMEOUT_SECONDS:.0f}s",
        )
        return False
    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "").strip().splitlines()[-3:]
        report.add(
            "adb_install",
            "fail",
            f"adb install exited {result.returncode}: {' | '.join(tail)}",
        )
        return False
    # `adb install` prints "Success" on the happy path; surface that.
    last = (result.stdout or "").strip().splitlines()
    report.add("adb_install", "ok", last[-1] if last else "installed")
    return True


def run_install(
    cfg: MoConfig,
    opts: InstallOptions,
    *,
    console: Console | None = None,
) -> int:
    """Entry point for `mo install`. Returns process exit code."""
    console = console or Console()
    report = InstallReport()

    apk = _step_resolve_apk(cfg, opts, report)
    if apk is None:
        # Distinguish "no APK at all" from "APK too old" by re-reading.
        if _newest_apk(cfg) is None:
            report.exit_code = EXIT_NO_APK
        else:
            report.exit_code = EXIT_STALE_APK
        return _emit(opts, console, report)

    if not _step_adb_install(opts, apk, report):
        report.exit_code = EXIT_ADB_FAILED

    return _emit(opts, console, report)


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


def _emit(opts: InstallOptions, console: Console, report: InstallReport) -> int:
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
    table = Table(title="mo install (android)")
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
        console.print(
            "[green]install: APK pushed[/green]"
            if use_color
            else "install: APK pushed"
        )
    else:
        console.print(
            f"[red]install: exit {report.exit_code}[/red]"
            if use_color
            else f"install: exit {report.exit_code}"
        )
    return report.exit_code
