"""Typer CLI surface for `mo`.

Phase 4.0 scaffold: every subcommand is a stub that prints
"not implemented" and exits non-zero. Real behaviour lands in
later phases per docs/v4/design-maestro-orchestrator.md.
"""

from __future__ import annotations

import typer

from . import __version__
from .commands.doctor import run_doctor
from .commands.journey import JourneyOptions, run_journey
from .commands.kill import KillOptions, run_kill
from .commands.logs import LogsOptions, run_logs
from .commands.reset import ResetOptions, run_reset
from .commands.run import RunOptions, run_run
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
def reset(
    device: str | None = typer.Option(
        None, "--device", help="ADB serial or iOS simulator UDID to target."
    ),
    skip_db: bool = typer.Option(
        False, "--skip-db", help="Skip the DB truncate step."
    ),
    skip_app: bool = typer.Option(
        False, "--skip-app", help="Skip the app-data clear step."
    ),
    skip_reverse: bool = typer.Option(
        False, "--skip-reverse", help="Skip re-establishing adb reverse forwards."
    ),
    seed: str | None = typer.Option(
        None,
        "--seed",
        help="Seed payload (currently only 'legacy'; not yet implemented).",
    ),
    json_output: bool = typer.Option(
        False, "--json", help="Emit machine-readable JSON instead of a table."
    ),
) -> None:
    """Single source of truth for between-runs DB + device reset."""
    cfg = load_config(cli_overrides={"device": device} if device else None)
    code = run_reset(
        cfg,
        ResetOptions(
            device=device,
            skip_db=skip_db,
            skip_app=skip_app,
            skip_reverse=skip_reverse,
            seed=seed,
            json_output=json_output,
        ),
    )
    raise typer.Exit(code=code)


@app.command()
def run(
    flow: str = typer.Argument(
        ...,
        help="Flow path or bare name (e.g. 'regression-journey.yaml').",
    ),
    device: str | None = typer.Option(
        None, "--device", help="ADB serial or iOS simulator UDID to target."
    ),
    force: bool = typer.Option(
        False,
        "--force",
        help="Override the in-flight-run guard. Use after manually verifying state.",
    ),
    json_output: bool = typer.Option(
        False, "--json", help="Emit machine-readable JSON instead of a one-liner."
    ),
) -> None:
    """Spawn `maestro test` detached with PID + log tracking."""
    cfg = load_config(cli_overrides={"device": device} if device else None)
    code = run_run(
        cfg,
        RunOptions(
            flow=flow,
            device=device,
            force=force,
            json_output=json_output,
        ),
    )
    raise typer.Exit(code=code)


@app.command()
def journey(
    device: str | None = typer.Option(
        None, "--device", help="ADB serial or iOS simulator UDID to target."
    ),
    flow: str = typer.Option(
        "regression-journey.yaml",
        "--flow",
        help="Flow to run after doctor + reset (default: regression-journey.yaml).",
    ),
    skip_doctor: bool = typer.Option(
        False, "--skip-doctor", help="Skip the doctor --fix step."
    ),
    skip_reset: bool = typer.Option(
        False, "--skip-reset", help="Skip the reset step."
    ),
    watch: bool = typer.Option(
        False,
        "--watch",
        help="Poll the spawned child until it exits or --watch-timeout fires.",
    ),
    watch_timeout: float = typer.Option(
        1800.0,
        "--watch-timeout",
        help="Maximum seconds for --watch before returning (default 1800).",
    ),
    watch_poll: float = typer.Option(
        5.0,
        "--watch-poll",
        help="Poll interval in seconds when --watch is set (default 5).",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        help="Override the in-flight-run guard on `mo run`.",
    ),
    json_output: bool = typer.Option(
        False, "--json", help="Emit machine-readable JSON instead of text."
    ),
) -> None:
    """Composite: doctor --fix && reset && run regression-journey."""
    cfg = load_config(cli_overrides={"device": device} if device else None)
    code = run_journey(
        cfg,
        JourneyOptions(
            device=device,
            flow=flow,
            skip_doctor=skip_doctor,
            skip_reset=skip_reset,
            watch=watch,
            watch_timeout=watch_timeout,
            watch_poll=watch_poll,
            force=force,
            json_output=json_output,
        ),
    )
    raise typer.Exit(code=code)


@app.command()
def kill(
    json_output: bool = typer.Option(
        False, "--json", help="Emit machine-readable JSON instead of a table."
    ),
    orphans_only: bool = typer.Option(
        False,
        "--orphans-only",
        help="Skip the PID-file-tracked process; just sweep orphaned drivers.",
    ),
) -> None:
    """Terminate live runner + orphaned Maestro/driver processes."""
    cfg = load_config()
    code = run_kill(
        cfg,
        KillOptions(orphans_only=orphans_only, json_output=json_output),
    )
    raise typer.Exit(code=code)


@app.command()
def logs(
    tail: int | None = typer.Option(
        None, "--tail", help="Print only the last N lines."
    ),
    flow: str | None = typer.Option(
        None,
        "--flow",
        help="Read the newest log for this flow instead of maestro-latest.log.",
    ),
    follow: bool = typer.Option(
        False, "--follow", help="Tail-follow new bytes (bounded by --for)."
    ),
    for_seconds: float = typer.Option(
        60.0,
        "--for",
        help="Maximum seconds to follow before returning (default 60).",
    ),
    list_runs: bool = typer.Option(
        False, "--list", help="List every run under tmp/mo/runs/."
    ),
    json_output: bool = typer.Option(
        False, "--json", help="Emit machine-readable JSON instead of plain text."
    ),
) -> None:
    """Tail the latest run log without remembering the timestamp."""
    cfg = load_config()
    code = run_logs(
        cfg,
        LogsOptions(
            tail=tail,
            flow=flow,
            follow=follow,
            for_seconds=for_seconds,
            list_runs=list_runs,
            json_output=json_output,
        ),
    )
    raise typer.Exit(code=code)


if __name__ == "__main__":  # pragma: no cover
    app()
