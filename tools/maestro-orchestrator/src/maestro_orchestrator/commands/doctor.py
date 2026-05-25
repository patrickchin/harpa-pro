"""`mo doctor` — preflight checklist runner.

Composes the catalogue in `maestro_orchestrator.checks` into either
a JSON dump (for scripting) or a `rich`-rendered human report.
Exit code 0 iff every required check is OK (or got fixed by --fix).
"""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Callable

from rich.console import Console
from rich.table import Table

from .. import checks, host
from ..config import MoConfig

# Glyphs for human output. rich renders these fine; for non-TTY / no-color
# we fall back to plain ASCII tags so log scrapers can read it.
_GLYPHS_RICH = {
    "ok": ("[green]OK[/green]", "OK"),
    "fail": ("[red]FAIL[/red]", "FAIL"),
    "warn": ("[yellow]WARN[/yellow]", "WARN"),
    "skip": ("[dim]SKIP[/dim]", "SKIP"),
}
_GLYPHS_PLAIN = {
    "ok": "[OK]",
    "fail": "[FAIL]",
    "warn": "[WARN]",
    "skip": "[SKIP]",
}


CheckEntry = tuple[str, Callable[[checks.DoctorContext], checks.CheckResult]]


def _catalogue(ctx: checks.DoctorContext) -> list[CheckEntry]:
    """The ordered list of checks to run for this context.

    Order matters: device must resolve before adb_reverse /
    android_app_installed / ios_app_installed run.
    """
    entries: list[CheckEntry] = [
        ("project_root", checks.check_project_root),
        ("app_id", checks.check_app_id),
        ("maestro_cli", checks.check_maestro_on_path),
        ("docker", checks.check_docker_stack),
        ("fixture_env", checks.check_fixture_env),
        ("metro", checks.check_metro),
        ("api", checks.check_api),
        ("orphan_maestro", checks.check_no_orphan_maestro),
    ]
    if ctx.host_name == "macos":
        entries += [
            ("orphan_ios_driver", checks.check_no_orphan_ios_driver),
            ("ios_simulator", checks.check_ios_simulator_booted),
            ("ios_app_installed", checks.check_ios_app_installed),
        ]
    # Android is supported on Windows, Linux, and macOS-with-Android.
    # We always run the Android suite unless we're on macOS without adb.
    # Simpler: always run; the check itself reports cleanly if `adb` is
    # missing. On macOS, treat Android checks as warn-not-fail since iOS
    # is the canonical mac target.
    entries += [
        ("adb_device", checks.check_adb_device),
        ("adb_reverse", checks.check_adb_reverse),
        ("android_app_installed", checks.check_android_app_installed),
    ]
    return entries


# Checks that must pass for exit 0 on the current host. Anything not in
# this set is advisory (warn / skip / even fail won't fail the run).
def _required_check_names(host_name: str) -> set[str]:
    base = {
        "project_root",
        "app_id",
        "maestro_cli",
        "docker",
        "fixture_env",
        "metro",
        "api",
    }
    if host_name == "macos":
        return base | {"ios_simulator", "ios_app_installed"}
    # windows / linux → Android is the path.
    return base | {"adb_device", "adb_reverse", "android_app_installed"}


def run_doctor(
    cfg: MoConfig,
    *,
    fix: bool = False,
    json_output: bool = False,
    device: str | None = None,
    console: Console | None = None,
) -> int:
    """Run every applicable check and report. Returns process exit code."""
    ctx = checks.DoctorContext(
        cfg=cfg,
        host_name=host.detect_host(),
        device=device,
        fix=fix,
    )
    results: list[checks.CheckResult] = []
    for _name, fn in _catalogue(ctx):
        try:
            results.append(fn(ctx))
        except Exception as exc:  # noqa: BLE001 — never let one check crash the whole report
            results.append(
                checks.CheckResult(
                    name=_name,
                    status="fail",
                    detail=f"check crashed: {type(exc).__name__}: {exc}",
                )
            )

    required = _required_check_names(ctx.host_name)
    failed_required = [
        r for r in results if r.name in required and r.status == "fail"
    ]
    exit_code = 0 if not failed_required else 1

    if json_output:
        _emit_json(results, ctx, exit_code)
    else:
        _emit_human(results, ctx, exit_code, console=console)
    return exit_code


def _emit_json(
    results: list[checks.CheckResult],
    ctx: checks.DoctorContext,
    exit_code: int,
) -> None:
    payload = {
        "host": ctx.host_name,
        "project_root": str(ctx.cfg.project_root),
        "app_id": ctx.cfg.app_id,
        "device": ctx.resolved_device or ctx.device or ctx.cfg.device,
        "fix": ctx.fix,
        "exit_code": exit_code,
        "checks": [asdict(r) for r in results],
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


def _emit_human(
    results: list[checks.CheckResult],
    ctx: checks.DoctorContext,
    exit_code: int,
    *,
    console: Console | None = None,
) -> None:
    console = console or Console()
    use_color = console.is_terminal and not console.no_color

    table = Table(title=f"mo doctor — host: {ctx.host_name}")
    table.add_column("status", no_wrap=True)
    table.add_column("check", no_wrap=True)
    table.add_column("detail", overflow="fold")

    for r in results:
        if use_color:
            tag, _plain = _GLYPHS_RICH[r.status]
        else:
            tag = _GLYPHS_PLAIN[r.status]
        detail = r.detail
        if r.fixed:
            detail = f"{detail} (fixed)"
        table.add_row(tag, r.name, detail)

    console.print(table)

    if exit_code == 0:
        console.print("[green]doctor: all required checks passed[/green]" if use_color else "doctor: all required checks passed")
    else:
        failed = [r.name for r in results if r.status == "fail"]
        msg = f"doctor: {len(failed)} failing check(s): {failed}"
        if use_color:
            console.print(f"[red]{msg}[/red]")
        else:
            Console(stderr=True, no_color=True).print(msg)
