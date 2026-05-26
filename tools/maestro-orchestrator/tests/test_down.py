"""Tests for `mo down`."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from maestro_orchestrator import paths, pidfile
from maestro_orchestrator.commands import down as down_cmd
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


def _write_metro_pid(project_root: Path, pid: int) -> Path:
    paths.ensure_layout(project_root)
    rec = pidfile.PidRecord(
        pid=pid,
        create_time=123.0,
        flow="metro",
        log=str(paths.metro_log_file(project_root)),
        started_at=pidfile.now_iso(),
        device=None,
    )
    p = paths.metro_pid_file(project_root)
    pidfile.write(p, rec)
    return p


# --- metro step ---------------------------------------------------------
def test_step_metro_skip_when_no_pid_file(project_root: Path) -> None:
    report = down_cmd.DownReport()
    down_cmd._step_metro(_cfg(project_root), report)
    assert report.steps[-1]["status"] == "skip"
    assert "no tracked" in report.steps[-1]["detail"]


def test_step_metro_skip_when_dead_process(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _write_metro_pid(project_root, 42)
    monkeypatch.setattr(down_cmd.pidfile, "is_alive", lambda _r: False)
    report = down_cmd.DownReport()
    down_cmd._step_metro(_cfg(project_root), report)
    assert report.steps[-1]["status"] == "skip"
    assert not paths.metro_pid_file(project_root).exists()


def test_step_metro_terminates_live_process(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _write_metro_pid(project_root, 42)
    monkeypatch.setattr(down_cmd.pidfile, "is_alive", lambda _r: True)
    killed: list[int] = []
    monkeypatch.setattr(down_cmd, "_kill_pid", lambda pid: killed.append(pid))
    report = down_cmd.DownReport()
    down_cmd._step_metro(_cfg(project_root), report)
    assert killed == [42]
    assert report.steps[-1]["status"] == "ok"
    assert not paths.metro_pid_file(project_root).exists()


def test_step_metro_handles_corrupt_pidfile(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    paths.ensure_layout(project_root)
    paths.metro_pid_file(project_root).write_text("not json", encoding="utf-8")
    report = down_cmd.DownReport()
    down_cmd._step_metro(_cfg(project_root), report)
    assert report.steps[-1]["status"] == "warn"
    assert not paths.metro_pid_file(project_root).exists()


def test_kill_pid_handles_missing_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import psutil as _psutil

    def raiser(_pid: int) -> object:
        raise _psutil.NoSuchProcess(_pid)

    monkeypatch.setattr(_psutil, "Process", raiser)
    # Should not raise.
    down_cmd._kill_pid(99999)


def test_kill_pid_terminates_children(monkeypatch: pytest.MonkeyPatch) -> None:
    import psutil as _psutil

    terminated: list[str] = []

    class _Child:
        def terminate(self) -> None:
            terminated.append("child")

    class _Parent:
        def children(self, recursive: bool = False) -> list[_Child]:
            return [_Child()]

        def terminate(self) -> None:
            terminated.append("parent")

        def wait(self, timeout: float = 0.0) -> None:
            return None

    monkeypatch.setattr(_psutil, "Process", lambda _pid: _Parent())
    down_cmd._kill_pid(1)
    assert "child" in terminated
    assert "parent" in terminated


def test_kill_pid_force_kills_on_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    import psutil as _psutil

    killed: list[str] = []

    class _P:
        def children(self, recursive: bool = False) -> list[Any]:
            return []

        def terminate(self) -> None:
            return None

        def wait(self, timeout: float = 0.0) -> None:
            raise _psutil.TimeoutExpired(seconds=timeout)

        def kill(self) -> None:
            killed.append("kill")

    monkeypatch.setattr(_psutil, "Process", lambda _pid: _P())
    down_cmd._kill_pid(1)
    assert killed == ["kill"]


# --- docker step --------------------------------------------------------
def test_step_docker_skip_when_keep_docker(project_root: Path) -> None:
    report = down_cmd.DownReport()
    ok = down_cmd._step_docker(
        _cfg(project_root),
        down_cmd.DownOptions(keep_docker=True),
        report,
    )
    assert ok is True
    assert report.steps[-1]["status"] == "skip"


def test_step_docker_ok_on_success(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    class _CP:
        returncode = 0
        stdout = ""
        stderr = ""

    monkeypatch.setattr(down_cmd.subprocess, "run", lambda *_a, **_k: _CP())
    report = down_cmd.DownReport()
    ok = down_cmd._step_docker(
        _cfg(project_root), down_cmd.DownOptions(), report
    )
    assert ok is True


def test_step_docker_fail_on_missing_docker(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    def boom(*_a: object, **_k: object) -> object:
        raise FileNotFoundError("docker")

    monkeypatch.setattr(down_cmd.subprocess, "run", boom)
    report = down_cmd.DownReport()
    ok = down_cmd._step_docker(
        _cfg(project_root), down_cmd.DownOptions(), report
    )
    assert ok is False
    assert "PATH" in report.steps[-1]["detail"]


def test_step_docker_fail_on_timeout(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    def boom(*_a: object, **_k: object) -> object:
        raise subprocess.TimeoutExpired(cmd="docker", timeout=1.0)

    monkeypatch.setattr(down_cmd.subprocess, "run", boom)
    report = down_cmd.DownReport()
    ok = down_cmd._step_docker(
        _cfg(project_root), down_cmd.DownOptions(), report
    )
    assert ok is False
    assert "timed out" in report.steps[-1]["detail"]


def test_step_docker_fail_on_nonzero(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    class _CP:
        returncode = 5
        stdout = "x"
        stderr = "boom"

    monkeypatch.setattr(down_cmd.subprocess, "run", lambda *_a, **_k: _CP())
    report = down_cmd.DownReport()
    ok = down_cmd._step_docker(
        _cfg(project_root), down_cmd.DownOptions(), report
    )
    assert ok is False
    assert "5" in report.steps[-1]["detail"]


# --- top-level ----------------------------------------------------------
def test_run_down_happy_path(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(down_cmd, "_step_metro", lambda *_a, **_k: None)
    monkeypatch.setattr(down_cmd, "_step_docker", lambda *_a, **_k: True)
    code = down_cmd.run_down(_cfg(project_root), down_cmd.DownOptions())
    assert code == 0


def test_run_down_docker_failure_exits_nonzero(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(down_cmd, "_step_metro", lambda *_a, **_k: None)
    monkeypatch.setattr(down_cmd, "_step_docker", lambda *_a, **_k: False)
    code = down_cmd.run_down(_cfg(project_root), down_cmd.DownOptions())
    assert code == down_cmd.EXIT_DOCKER_FAILED


def test_run_down_json_output(
    monkeypatch: pytest.MonkeyPatch,
    project_root: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(down_cmd, "_step_metro", lambda *_a, **_k: None)
    monkeypatch.setattr(down_cmd, "_step_docker", lambda *_a, **_k: True)
    code = down_cmd.run_down(
        _cfg(project_root), down_cmd.DownOptions(json_output=True)
    )
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["exit_code"] == 0
