"""Tests for the shared maestro CLI resolver."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

from maestro_orchestrator import maestro_cli


def test_returns_path_when_on_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        maestro_cli.shutil,
        "which",
        lambda name: "/usr/local/bin/maestro" if name == "maestro" else None,
    )
    assert maestro_cli.find_maestro_executable() == "/usr/local/bin/maestro"


def test_prefers_first_match(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_which(name: str) -> str | None:
        calls.append(name)
        return None

    monkeypatch.setattr(maestro_cli.shutil, "which", fake_which)
    monkeypatch.setattr(maestro_cli.sys, "platform", "linux")
    assert maestro_cli.find_maestro_executable() is None
    # Should try all three names before giving up.
    assert calls == ["maestro", "maestro.bat", "maestro.cmd"]


def test_windows_fallback_to_user_profile(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(maestro_cli.shutil, "which", lambda name: None)
    monkeypatch.setattr(maestro_cli.sys, "platform", "win32")
    # Point HOME at a tmp dir with a maestro.bat under .maestro/bin
    home = tmp_path / "user"
    bin_dir = home / ".maestro" / "bin"
    bin_dir.mkdir(parents=True)
    bat = bin_dir / "maestro.bat"
    bat.write_text("@echo dummy\n", encoding="utf-8")
    monkeypatch.setattr(maestro_cli.os.path, "expanduser", lambda _: str(home))
    found = maestro_cli.find_maestro_executable()
    assert found is not None
    assert Path(found) == bat


def test_returns_none_on_nonwindows_when_not_on_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(maestro_cli.shutil, "which", lambda name: None)
    monkeypatch.setattr(maestro_cli.sys, "platform", "darwin")
    assert maestro_cli.find_maestro_executable() is None
