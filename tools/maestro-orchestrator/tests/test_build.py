"""Tests for `mo build`."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from maestro_orchestrator import paths, pidfile
from maestro_orchestrator.commands import build as build_cmd
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


@pytest.fixture()
def with_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JAVA_HOME", "/fake/java")
    monkeypatch.setenv("ANDROID_HOME", "/fake/android")


def _write_gradlew(project_root: Path) -> Path:
    android_dir = project_root / "apps" / "mobile" / "android"
    android_dir.mkdir(parents=True)
    name = "gradlew.bat" if sys.platform.startswith("win") else "gradlew"
    p = android_dir / name
    p.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    return p


# --- env preflight ------------------------------------------------------
def test_require_env_fails_when_java_home_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("JAVA_HOME", raising=False)
    monkeypatch.setenv("ANDROID_HOME", "/x")
    report = build_cmd.BuildReport()
    assert build_cmd._require_env(report) is False
    assert "JAVA_HOME" in report.steps[-1]["detail"]


def test_require_env_fails_when_android_home_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("JAVA_HOME", "/x")
    monkeypatch.delenv("ANDROID_HOME", raising=False)
    report = build_cmd.BuildReport()
    assert build_cmd._require_env(report) is False
    assert "ANDROID_HOME" in report.steps[-1]["detail"]


def test_require_env_ok_when_both_set(with_env: None) -> None:
    report = build_cmd.BuildReport()
    assert build_cmd._require_env(report) is True
    assert report.steps[-1]["status"] == "ok"


# --- prebuild step ------------------------------------------------------
def test_prebuild_skipped_via_flag(project_root: Path) -> None:
    report = build_cmd.BuildReport()
    ok = build_cmd._step_prebuild(
        _cfg(project_root),
        build_cmd.BuildOptions(skip_prebuild=True),
        report,
    )
    assert ok is True
    assert report.steps[-1]["status"] == "skip"


def test_prebuild_invokes_pnpm_with_expected_argv(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    captured: dict[str, Any] = {}

    class _CP:
        returncode = 0
        stdout = ""
        stderr = ""

    def fake_run(argv: list[str], **kw: Any) -> _CP:
        captured["argv"] = argv
        captured["cwd"] = kw.get("cwd")
        return _CP()

    monkeypatch.setattr(build_cmd.subprocess, "run", fake_run)
    report = build_cmd.BuildReport()
    ok = build_cmd._step_prebuild(
        _cfg(project_root), build_cmd.BuildOptions(), report
    )
    assert ok is True
    assert "--filter" in captured["argv"]
    assert "@harpa/mobile" in captured["argv"]
    assert "prebuild" in captured["argv"]
    assert "--platform" in captured["argv"]
    assert "android" in captured["argv"]
    assert "--clean" in captured["argv"]
    assert captured["cwd"] == str(project_root)


def test_prebuild_handles_missing_pnpm(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(
        build_cmd.subprocess,
        "run",
        lambda *_a, **_k: (_ for _ in ()).throw(FileNotFoundError("pnpm")),
    )
    report = build_cmd.BuildReport()
    assert (
        build_cmd._step_prebuild(
            _cfg(project_root), build_cmd.BuildOptions(), report
        )
        is False
    )
    assert "PATH" in report.steps[-1]["detail"]


def test_prebuild_handles_timeout(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    def boom(*_a: object, **_k: object) -> object:
        raise subprocess.TimeoutExpired(cmd="expo", timeout=1.0)

    monkeypatch.setattr(build_cmd.subprocess, "run", boom)
    report = build_cmd.BuildReport()
    assert (
        build_cmd._step_prebuild(
            _cfg(project_root), build_cmd.BuildOptions(), report
        )
        is False
    )
    assert "exceeded" in report.steps[-1]["detail"]


def test_prebuild_handles_nonzero(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    class _CP:
        returncode = 3
        stdout = ""
        stderr = "config error"

    monkeypatch.setattr(build_cmd.subprocess, "run", lambda *_a, **_k: _CP())
    report = build_cmd.BuildReport()
    assert (
        build_cmd._step_prebuild(
            _cfg(project_root), build_cmd.BuildOptions(), report
        )
        is False
    )
    assert "config error" in report.steps[-1]["detail"]


# --- gradle step --------------------------------------------------------
def test_gradle_fails_when_gradlew_missing(project_root: Path) -> None:
    report = build_cmd.BuildReport()
    ok = build_cmd._step_gradle(
        _cfg(project_root), build_cmd.BuildOptions(), report
    )
    assert ok is False
    assert "missing" in report.steps[-1]["detail"]


def test_gradle_spawns_detached_and_writes_pidfile(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _write_gradlew(project_root)
    monkeypatch.setattr(
        build_cmd.spawn, "spawn_detached", lambda *_a, **_k: 7777
    )

    import psutil as _psutil

    class _P:
        def create_time(self) -> float:
            return 1700000000.0

    monkeypatch.setattr(_psutil, "Process", lambda _pid: _P())
    report = build_cmd.BuildReport()
    ok = build_cmd._step_gradle(
        _cfg(project_root), build_cmd.BuildOptions(), report
    )
    assert ok is True
    rec = pidfile.read(paths.build_android_pid_file(project_root))
    assert rec is not None
    assert rec.flow == "build-android"
    assert rec.pid == 7777


def test_gradle_release_variant_changes_task(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _write_gradlew(project_root)
    seen: dict[str, list[str]] = {}

    def fake_spawn(argv: list[str], **_kw: Any) -> int:
        seen["argv"] = argv
        return 1111

    monkeypatch.setattr(build_cmd.spawn, "spawn_detached", fake_spawn)
    import psutil as _psutil

    class _P:
        def create_time(self) -> float:
            return 1.0

    monkeypatch.setattr(_psutil, "Process", lambda _pid: _P())
    report = build_cmd.BuildReport()
    build_cmd._step_gradle(
        _cfg(project_root),
        build_cmd.BuildOptions(variant="release"),
        report,
    )
    assert ":app:assembleRelease" in seen["argv"]


def test_gradle_handles_spawn_oserror(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _write_gradlew(project_root)

    def boom(*_a: object, **_k: object) -> int:
        raise OSError("oom")

    monkeypatch.setattr(build_cmd.spawn, "spawn_detached", boom)
    report = build_cmd.BuildReport()
    ok = build_cmd._step_gradle(
        _cfg(project_root), build_cmd.BuildOptions(), report
    )
    assert ok is False
    assert "oom" in report.steps[-1]["detail"]


def test_gradle_handles_psutil_error(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _write_gradlew(project_root)
    monkeypatch.setattr(build_cmd.spawn, "spawn_detached", lambda *_a, **_k: 1)
    import psutil as _psutil

    def raiser(_pid: int) -> object:
        raise _psutil.NoSuchProcess(_pid)

    monkeypatch.setattr(_psutil, "Process", raiser)
    report = build_cmd.BuildReport()
    ok = build_cmd._step_gradle(
        _cfg(project_root), build_cmd.BuildOptions(), report
    )
    assert ok is False


def test_gradlew_path_picks_platform_correct_script(project_root: Path) -> None:
    p = build_cmd._gradlew_path(project_root)
    if sys.platform.startswith("win"):
        assert p.name == "gradlew.bat"
    else:
        assert p.name == "gradlew"


# --- top-level ----------------------------------------------------------
def test_run_build_env_missing(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.delenv("JAVA_HOME", raising=False)
    monkeypatch.delenv("ANDROID_HOME", raising=False)
    code = build_cmd.run_build(_cfg(project_root), build_cmd.BuildOptions())
    assert code == build_cmd.EXIT_ENV_MISSING


def test_run_build_prebuild_failure(
    monkeypatch: pytest.MonkeyPatch, project_root: Path, with_env: None
) -> None:
    monkeypatch.setattr(build_cmd, "_step_prebuild", lambda *_a, **_k: False)
    monkeypatch.setattr(build_cmd, "_step_gradle", lambda *_a, **_k: True)
    code = build_cmd.run_build(_cfg(project_root), build_cmd.BuildOptions())
    assert code == build_cmd.EXIT_PREBUILD_FAILED


def test_run_build_gradle_failure(
    monkeypatch: pytest.MonkeyPatch, project_root: Path, with_env: None
) -> None:
    monkeypatch.setattr(build_cmd, "_step_prebuild", lambda *_a, **_k: True)
    monkeypatch.setattr(build_cmd, "_step_gradle", lambda *_a, **_k: False)
    code = build_cmd.run_build(_cfg(project_root), build_cmd.BuildOptions())
    assert code == build_cmd.EXIT_GRADLE_SPAWN_FAILED


def test_run_build_happy_path(
    monkeypatch: pytest.MonkeyPatch, project_root: Path, with_env: None
) -> None:
    monkeypatch.setattr(build_cmd, "_step_prebuild", lambda *_a, **_k: True)
    monkeypatch.setattr(build_cmd, "_step_gradle", lambda *_a, **_k: True)
    code = build_cmd.run_build(_cfg(project_root), build_cmd.BuildOptions())
    assert code == 0


def test_run_build_json_output(
    monkeypatch: pytest.MonkeyPatch,
    project_root: Path,
    with_env: None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(build_cmd, "_step_prebuild", lambda *_a, **_k: True)
    monkeypatch.setattr(build_cmd, "_step_gradle", lambda *_a, **_k: True)
    code = build_cmd.run_build(
        _cfg(project_root), build_cmd.BuildOptions(json_output=True)
    )
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["exit_code"] == 0
