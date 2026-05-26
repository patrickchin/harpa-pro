"""Sanity tests for the CLI surface.

These lock in the *shape* of the CLI before any subcommand is
implemented. When real logic lands, the not-implemented tests
here will be the first to update.
"""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from maestro_orchestrator import __version__
from maestro_orchestrator.cli import app

SUBCOMMANDS = (
    "doctor",
    "reset",
    "run",
    "journey",
    "kill",
    "logs",
    "up",
    "down",
    "build",
    "install",
)
# All commands listed above are real — no stubs remain after phase 4.
_REAL_COMMANDS = set(SUBCOMMANDS)
STUB_SUBCOMMANDS = tuple(c for c in SUBCOMMANDS if c not in _REAL_COMMANDS)


def test_help_exits_zero_and_lists_all_subcommands(runner: CliRunner) -> None:
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0, result.stdout
    for name in SUBCOMMANDS:
        assert name in result.stdout, (
            f"expected `{name}` in --help output:\n{result.stdout}"
        )


def test_version_flag(runner: CliRunner) -> None:
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert __version__ in result.stdout


@pytest.mark.parametrize("name", SUBCOMMANDS)
def test_subcommand_help_exits_zero(runner: CliRunner, name: str) -> None:
    result = runner.invoke(app, [name, "--help"])
    assert result.exit_code == 0, result.stdout


@pytest.mark.parametrize("name", STUB_SUBCOMMANDS)
def test_subcommand_stub_exits_nonzero_with_not_implemented(
    runner: CliRunner, name: str
) -> None:
    result = runner.invoke(app, [name])
    assert result.exit_code != 0, (
        f"`mo {name}` should be a not-implemented stub, "
        f"got exit 0:\nstdout={result.stdout}\nstderr={result.stderr}"
    )
    assert "not implemented" in result.stderr.lower(), result.stderr
