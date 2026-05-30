"""Tests for host platform detection."""

from __future__ import annotations

import pytest

from maestro_orchestrator import host as host_mod


@pytest.mark.parametrize(
    "platform_value,expected",
    [
        ("win32", "windows"),
        ("cygwin", "windows"),
        ("darwin", "macos"),
        ("linux", "linux"),
        ("linux2", "linux"),
    ],
)
def test_detect_host_known_platforms(
    monkeypatch: pytest.MonkeyPatch, platform_value: str, expected: str
) -> None:
    monkeypatch.setattr(host_mod.sys, "platform", platform_value)
    assert host_mod.detect_host() == expected


def test_detect_host_unknown_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(host_mod.sys, "platform", "haiku")
    with pytest.raises(RuntimeError, match="Unsupported host"):
        host_mod.detect_host()


def test_is_windows_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(host_mod.sys, "platform", "win32")
    assert host_mod.is_windows() is True
    assert host_mod.is_macos() is False
    assert host_mod.is_linux() is False


def test_is_macos_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(host_mod.sys, "platform", "darwin")
    assert host_mod.is_windows() is False
    assert host_mod.is_macos() is True
    assert host_mod.is_linux() is False
