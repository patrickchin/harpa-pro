"""Typer CLI surface for `mo`.

Phase 4.0 scaffold: every subcommand is a stub that prints
"not implemented" and exits non-zero. Real behaviour lands in
later phases per docs/v4/design-maestro-orchestrator.md.
"""

from __future__ import annotations

import typer

from . import __version__
from .commands.doctor import run_doctor
from .config import load_config

app = typer.Typer(
    name="mo",
    help=(
        "Orchestrator for Maestro E2E runs across "
        "Windows+Android and macOS+iOS Simulator."
    ),
    add_completion=False,
)


_NOT_IMPLEMENTED_EXIT = 99


def _stub(name: str) -> None:
    """Print a uniform 'not implemented' message and exit non-zero."""
    typer.echo(f"mo {name}: not implemented", err=True)
    raise typer.Exit(code=_NOT_IMPLEMENTED_EXIT)


@app.callback(invoke_without_command=True)
def _root(
    ctx: typer.Context,
    version: bool = typer.Option(
        False,
        "--version",
        help="Print the mo version and exit.",
        is_eager=True,
    ),
) -> None:
    if version:
        typer.echo(__version__)
        raise typer.Exit(code=0)
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())
        raise typer.Exit(code=0)


@app.command()
def doctor(
    fix: bool = typer.Option(
        False, "--fix", help="Auto-fix safe items (adb reverse, orphan procs)."
    ),
    json_output: bool = typer.Option(
        False, "--json", help="Emit machine-readable JSON instead of a table."
    ),
    device: str | None = typer.Option(
        None, "--device", help="ADB serial or iOS simulator UDID to target."
    ),
) -> None:
    """Preflight checklist; gates a journey."""
    cfg = load_config(cli_overrides={"device": device} if device else None)
    code = run_doctor(cfg, fix=fix, json_output=json_output, device=device)
    raise typer.Exit(code=code)


@app.command()
def reset() -> None:
    """Single source of truth for between-runs DB + device reset."""
    _stub("reset")


@app.command()
def run() -> None:
    """Spawn `maestro test` detached with PID + log tracking."""
    _stub("run")


@app.command()
def journey() -> None:
    """Composite: doctor --fix && reset && run regression-journey."""
    _stub("journey")


@app.command()
def kill() -> None:
    """Terminate live runner + orphaned Maestro/driver processes."""
    _stub("kill")


@app.command()
def logs() -> None:
    """Tail the latest run log without remembering the timestamp."""
    _stub("logs")


if __name__ == "__main__":  # pragma: no cover
    app()
