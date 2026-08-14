"""Sanity tests for the CLI surface."""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from maestro_orchestrator import __version__
from maestro_orchestrator import cli as cli_mod
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


def test_cli_module_no_longer_mentions_stub_phase() -> None:
    doc = cli_mod.__doc__ or ""
    assert "not implemented" not in doc
    assert "stub" not in doc.lower()
    assert not hasattr(cli_mod, "_stub")


@pytest.mark.parametrize("name", SUBCOMMANDS)
def test_subcommand_help_exits_zero(runner: CliRunner, name: str) -> None:
    result = runner.invoke(app, [name, "--help"])
    assert result.exit_code == 0, result.stdout
