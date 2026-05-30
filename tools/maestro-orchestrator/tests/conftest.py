"""Shared pytest fixtures for maestro-orchestrator."""

from __future__ import annotations

from pathlib import Path

import pytest
from typer.testing import CliRunner


@pytest.fixture()
def runner() -> CliRunner:
    """A Typer/Click CliRunner.

    Click >=8.2 splits stdout/stderr by default; older versions accepted
    a `mix_stderr` kwarg. We rely on the default split behaviour.
    """
    return CliRunner()


@pytest.fixture()
def fake_project_root(tmp_path: Path) -> Path:
    """A tmp directory marked as the harpa-pro monorepo root.

    Contains the two marker files (AGENTS.md + pnpm-workspace.yaml)
    that find_project_root() looks for.
    """
    (tmp_path / "AGENTS.md").write_text("# fake project\n", encoding="utf-8")
    (tmp_path / "pnpm-workspace.yaml").write_text(
        "packages: []\n", encoding="utf-8"
    )
    return tmp_path
