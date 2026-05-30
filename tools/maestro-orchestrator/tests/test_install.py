"""Tests for `mo install`."""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import Any

import pytest

from maestro_orchestrator.commands import install as install_cmd
from maestro_orchestrator.config import MoConfig


def _cfg(project_root: Path) -> MoConfig:
    return MoConfig(
        project_root=project_root, app_id="com.harpa.pro.dev", device=None
    )


@pytest.fixture()
def project_root(tmp_path: Path) -> Path:
    (tmp_path / "AGENTS.md").write_text("# stub\n", encoding="utf-8")
    (tmp_path / "pnpm-workspace.yaml").write_text(
        "packages: []\n", encoding="utf-8"
    )
    return tmp_path


def _make_apk(project_root: Path, name: str = "app-debug.apk", *, age_hours: float = 0.0) -> Path:
    apk_dir = install_cmd._apk_dir(_cfg(project_root))
    apk_dir.mkdir(parents=True, exist_ok=True)
    p = apk_dir / name
    p.write_bytes(b"PK\x03\x04 fake apk")
    mtime = time.time() - age_hours * 3600.0
    import os as _os

    _os.utime(p, (mtime, mtime))
    return p


# --- resolve apk --------------------------------------------------------
def test_newest_apk_returns_none_when_dir_missing(project_root: Path) -> None:
    assert install_cmd._newest_apk(_cfg(project_root)) is None


def test_newest_apk_returns_none_when_dir_empty(project_root: Path) -> None:
    install_cmd._apk_dir(_cfg(project_root)).mkdir(parents=True)
    assert install_cmd._newest_apk(_cfg(project_root)) is None


def test_newest_apk_picks_most_recent(project_root: Path) -> None:
    old = _make_apk(project_root, "a.apk", age_hours=10)
    new = _make_apk(project_root, "b.apk", age_hours=0)
    picked = install_cmd._newest_apk(_cfg(project_root))
    assert picked == new


def test_step_resolve_apk_fail_when_missing(project_root: Path) -> None:
    report = install_cmd.InstallReport()
    apk = install_cmd._step_resolve_apk(
        _cfg(project_root), install_cmd.InstallOptions(), report
    )
    assert apk is None
    assert "no APK" in report.steps[-1]["detail"]


def test_step_resolve_apk_fail_when_stale(project_root: Path) -> None:
    _make_apk(project_root, age_hours=48)
    report = install_cmd.InstallReport()
    apk = install_cmd._step_resolve_apk(
        _cfg(project_root),
        install_cmd.InstallOptions(max_age_hours=24.0),
        report,
    )
    assert apk is None
    assert "48" in report.steps[-1]["detail"]


def test_step_resolve_apk_accepts_with_force(project_root: Path) -> None:
    _make_apk(project_root, age_hours=48)
    report = install_cmd.InstallReport()
    apk = install_cmd._step_resolve_apk(
        _cfg(project_root),
        install_cmd.InstallOptions(force=True, max_age_hours=24.0),
        report,
    )
    assert apk is not None
    assert report.steps[-1]["status"] == "ok"


def test_step_resolve_apk_ok_when_fresh(project_root: Path) -> None:
    _make_apk(project_root, age_hours=0.1)
    report = install_cmd.InstallReport()
    apk = install_cmd._step_resolve_apk(
        _cfg(project_root), install_cmd.InstallOptions(), report
    )
    assert apk is not None
    assert report.steps[-1]["status"] == "ok"


# --- adb install --------------------------------------------------------
def test_adb_install_passes_device_serial(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    captured: dict[str, list[str]] = {}

    class _CP:
        returncode = 0
        stdout = "Success\n"
        stderr = ""

    def fake_run(argv: list[str], **_kw: Any) -> _CP:
        captured["argv"] = argv
        return _CP()

    monkeypatch.setattr(install_cmd.subprocess, "run", fake_run)
    apk = _make_apk(project_root)
    report = install_cmd.InstallReport()
    ok = install_cmd._step_adb_install(
        install_cmd.InstallOptions(device="emulator-5554"), apk, report
    )
    assert ok is True
    assert captured["argv"][:4] == ["adb", "-s", "emulator-5554", "install"]
    assert "-r" in captured["argv"]
    assert str(apk) in captured["argv"]


def test_adb_install_omits_serial_when_unset(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    captured: dict[str, list[str]] = {}

    class _CP:
        returncode = 0
        stdout = "Success\n"
        stderr = ""

    def fake_run(argv: list[str], **_kw: Any) -> _CP:
        captured["argv"] = argv
        return _CP()

    monkeypatch.setattr(install_cmd.subprocess, "run", fake_run)
    apk = _make_apk(project_root)
    report = install_cmd.InstallReport()
    ok = install_cmd._step_adb_install(
        install_cmd.InstallOptions(), apk, report
    )
    assert ok is True
    assert "-s" not in captured["argv"]


def test_adb_install_handles_missing_adb(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    def boom(*_a: object, **_k: object) -> object:
        raise FileNotFoundError("adb")

    monkeypatch.setattr(install_cmd.subprocess, "run", boom)
    apk = _make_apk(project_root)
    report = install_cmd.InstallReport()
    ok = install_cmd._step_adb_install(
        install_cmd.InstallOptions(), apk, report
    )
    assert ok is False
    assert "PATH" in report.steps[-1]["detail"]


def test_adb_install_handles_timeout(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    def boom(*_a: object, **_k: object) -> object:
        raise subprocess.TimeoutExpired(cmd="adb", timeout=1.0)

    monkeypatch.setattr(install_cmd.subprocess, "run", boom)
    apk = _make_apk(project_root)
    report = install_cmd.InstallReport()
    ok = install_cmd._step_adb_install(
        install_cmd.InstallOptions(), apk, report
    )
    assert ok is False
    assert "exceeded" in report.steps[-1]["detail"]


def test_adb_install_handles_nonzero_returncode(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    class _CP:
        returncode = 1
        stdout = ""
        stderr = "INSTALL_FAILED_VERSION_DOWNGRADE"

    monkeypatch.setattr(install_cmd.subprocess, "run", lambda *_a, **_k: _CP())
    apk = _make_apk(project_root)
    report = install_cmd.InstallReport()
    ok = install_cmd._step_adb_install(
        install_cmd.InstallOptions(), apk, report
    )
    assert ok is False
    assert "VERSION_DOWNGRADE" in report.steps[-1]["detail"]


# --- top-level ----------------------------------------------------------
def test_run_install_no_apk(project_root: Path) -> None:
    code = install_cmd.run_install(
        _cfg(project_root), install_cmd.InstallOptions()
    )
    assert code == install_cmd.EXIT_NO_APK


def test_run_install_stale_apk(project_root: Path) -> None:
    _make_apk(project_root, age_hours=48)
    code = install_cmd.run_install(
        _cfg(project_root),
        install_cmd.InstallOptions(max_age_hours=24.0),
    )
    assert code == install_cmd.EXIT_STALE_APK


def test_run_install_adb_failure(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _make_apk(project_root, age_hours=0.1)

    class _CP:
        returncode = 1
        stdout = ""
        stderr = "boom"

    monkeypatch.setattr(install_cmd.subprocess, "run", lambda *_a, **_k: _CP())
    code = install_cmd.run_install(
        _cfg(project_root), install_cmd.InstallOptions()
    )
    assert code == install_cmd.EXIT_ADB_FAILED


def test_run_install_happy_path(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _make_apk(project_root, age_hours=0.1)

    class _CP:
        returncode = 0
        stdout = "Success\n"
        stderr = ""

    monkeypatch.setattr(install_cmd.subprocess, "run", lambda *_a, **_k: _CP())
    code = install_cmd.run_install(
        _cfg(project_root), install_cmd.InstallOptions()
    )
    assert code == 0


def test_run_install_json_output(
    monkeypatch: pytest.MonkeyPatch,
    project_root: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _make_apk(project_root, age_hours=0.1)

    class _CP:
        returncode = 0
        stdout = "Success\n"
        stderr = ""

    monkeypatch.setattr(install_cmd.subprocess, "run", lambda *_a, **_k: _CP())
    code = install_cmd.run_install(
        _cfg(project_root), install_cmd.InstallOptions(json_output=True)
    )
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["exit_code"] == 0
