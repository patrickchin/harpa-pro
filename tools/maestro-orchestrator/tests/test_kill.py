"""Tests for `mo kill` — tracked-PID termination + orphan sweep.

The tracked-PID case uses a real short-lived Python subprocess as the
fixture; we want to actually observe terminate() doing its job rather
than mocking psutil's `Process` class.

The orphan-sweep path is mocked at the `procs.find_processes` /
`procs.kill_processes` boundary because spawning real `java -jar`
processes in a unit test is hostile to CI.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import psutil
import pytest

from maestro_orchestrator import paths, pidfile, procs
from maestro_orchestrator.commands import kill as kill_cmd
from maestro_orchestrator.config import MoConfig


# --- fixtures -----------------------------------------------------------
@pytest.fixture()
def project_root(tmp_path: Path) -> Path:
    (tmp_path / "AGENTS.md").write_text("# stub\n", encoding="utf-8")
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: []\n", encoding="utf-8")
    return tmp_path


def _cfg(project_root: Path) -> MoConfig:
    return MoConfig(project_root=project_root, app_id=None, device=None)


def _spawn_long_running_child() -> subprocess.Popen[bytes]:
    return subprocess.Popen(  # noqa: S603
        [sys.executable, "-c", "import time; time.sleep(30)"],
        shell=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _write_record_for(proc: subprocess.Popen[bytes], project_root: Path) -> Path:
    paths.ensure_layout(project_root)
    ct = psutil.Process(proc.pid).create_time()
    pid_path = paths.pid_file(project_root)
    pidfile.write(
        pid_path,
        pidfile.PidRecord(
            pid=proc.pid,
            create_time=ct,
            flow="stub.yaml",
            log=str(project_root / "stub.log"),
            started_at=pidfile.now_iso(),
            device=None,
        ),
    )
    return pid_path


@pytest.fixture(autouse=True)
def _no_real_orphans(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default: orphan-sweep finds nothing. Tests opt-in via override."""
    monkeypatch.setattr(kill_cmd.procs, "find_processes", lambda *a, **k: [])
    monkeypatch.setattr(kill_cmd.procs, "kill_processes", lambda *a, **k: [])


# --- tracked-PID path ---------------------------------------------------
def test_kill_terminates_tracked_process(project_root: Path) -> None:
    proc = _spawn_long_running_child()
    try:
        time.sleep(0.1)
        _write_record_for(proc, project_root)

        code = kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
        assert code == kill_cmd.EXIT_OK
        # Child should be gone within the 5s grace window.
        assert _wait_pid(proc.pid, timeout=6.0)
        # PID file deleted.
        assert not paths.pid_file(project_root).exists()
    finally:
        if proc.poll() is None:
            proc.kill()


def test_kill_no_pid_file_is_no_op(project_root: Path) -> None:
    code = kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
    assert code == kill_cmd.EXIT_OK
    # Report should still be written.
    assert paths.kill_report(project_root).exists()


def test_kill_stale_pid_file_treated_as_absent(project_root: Path) -> None:
    # PID 999999 ≈ definitely dead.
    if psutil.pid_exists(999999):
        pytest.skip("PID 999999 happens to exist")
    paths.ensure_layout(project_root)
    pidfile.write(
        paths.pid_file(project_root),
        pidfile.PidRecord(
            pid=999999,
            create_time=1.0,
            flow="ghost.yaml",
            log=str(project_root / "ghost.log"),
            started_at="2026-01-01T00:00:00+00:00",
            device=None,
        ),
    )
    code = kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
    assert code == kill_cmd.EXIT_OK
    assert not paths.pid_file(project_root).exists()


def test_kill_orphans_only_skips_tracked_pid(project_root: Path) -> None:
    proc = _spawn_long_running_child()
    try:
        time.sleep(0.1)
        _write_record_for(proc, project_root)

        code = kill_cmd.run_kill(
            _cfg(project_root), kill_cmd.KillOptions(orphans_only=True)
        )
        assert code == kill_cmd.EXIT_OK
        # Tracked process should still be alive — orphans-only doesn't touch it.
        assert psutil.pid_exists(proc.pid)
        # PID file should NOT be removed in orphans-only mode.
        assert paths.pid_file(project_root).exists()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


def test_kill_garbled_pid_file_is_swallowed(project_root: Path) -> None:
    paths.ensure_layout(project_root)
    paths.pid_file(project_root).write_text("{not json", encoding="utf-8")
    code = kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
    assert code == kill_cmd.EXIT_OK
    # We still try to remove it.
    assert not paths.pid_file(project_root).exists()


# --- orphan sweep (mocked psutil) ---------------------------------------
def _fake_proc(pid: int, cmdline: list[str], name: str = "java") -> SimpleNamespace:
    """A psutil.Process stand-in usable with `_looks_like_maestro_jvm`."""
    return SimpleNamespace(
        pid=pid,
        name=lambda: name,
        cmdline=lambda: cmdline,
        terminate=lambda: None,
        kill=lambda: None,
        wait=lambda timeout=None: None,
    )


def test_kill_orphan_jvm_is_killed(
    project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _fake_proc(
        pid=4242, cmdline=["java", "-jar", "/opt/maestro/maestro.jar"], name="java"
    )
    find = MagicMock(return_value=[fake])
    kill = MagicMock(return_value=[4242])
    monkeypatch.setattr(kill_cmd.procs, "find_processes", find)
    monkeypatch.setattr(kill_cmd.procs, "kill_processes", kill)

    code = kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
    assert code == kill_cmd.EXIT_OK
    find.assert_called()
    kill.assert_called()


def test_kill_skips_non_maestro_java(
    project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A java process whose cmdline doesn't mention maestro.jar should not
    # be killed. The kill_processes call should receive an empty list.
    bystander = _fake_proc(
        pid=5555, cmdline=["java", "-jar", "/opt/elastic/elastic.jar"], name="java"
    )
    monkeypatch.setattr(kill_cmd.procs, "find_processes", lambda *a, **k: [bystander])
    captured: list[list[object]] = []

    def fake_kill(procs_list: list[object], **kwargs: object) -> list[int]:
        captured.append(procs_list)
        return []

    monkeypatch.setattr(kill_cmd.procs, "kill_processes", fake_kill)
    code = kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
    assert code == kill_cmd.EXIT_OK
    # Sweep called once for maestro JVMs; bystander filtered out.
    assert captured and captured[0] == []


def test_kill_json_output_schema(
    project_root: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = kill_cmd.run_kill(
        _cfg(project_root), kill_cmd.KillOptions(json_output=True)
    )
    assert code == kill_cmd.EXIT_OK
    payload = json.loads(capsys.readouterr().out)
    assert set(payload.keys()) == {"tracked", "orphans", "pid_file_removed"}
    assert payload["tracked"] is None
    assert payload["orphans"] == []


def test_kill_writes_report_file(project_root: Path) -> None:
    kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
    report = paths.kill_report(project_root)
    assert report.exists()
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert "tracked" in payload
    assert "orphans" in payload
    assert "at" in payload


# --- _looks_like_maestro_jvm -------------------------------------------
def test_looks_like_maestro_jvm_accepts_maestro_jar() -> None:
    proc = _fake_proc(
        pid=1, cmdline=["java", "-jar", "/opt/maestro/maestro.jar"], name="java"
    )
    assert kill_cmd._looks_like_maestro_jvm(proc) is True  # type: ignore[arg-type]


def test_looks_like_maestro_jvm_rejects_unrelated() -> None:
    proc = _fake_proc(pid=1, cmdline=["java", "-jar", "/opt/x/x.jar"], name="java")
    assert kill_cmd._looks_like_maestro_jvm(proc) is False  # type: ignore[arg-type]


def test_looks_like_maestro_jvm_rejects_python_self() -> None:
    proc = _fake_proc(pid=1, cmdline=["python", "maestro_orchestrator"], name="python")
    assert kill_cmd._looks_like_maestro_jvm(proc) is False  # type: ignore[arg-type]


def test_looks_like_maestro_jvm_handles_dead_process() -> None:
    class Dead:
        pid = 1

        def name(self) -> str:
            raise psutil.NoSuchProcess(1)

        def cmdline(self) -> list[str]:
            raise psutil.NoSuchProcess(1)

    assert kill_cmd._looks_like_maestro_jvm(Dead()) is False  # type: ignore[arg-type]


# --- tracked-pid edge: escalates to kill after grace -------------------
def test_kill_escalates_when_terminate_does_not_finish_in_grace(
    project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Speed up the grace timer for the test.
    monkeypatch.setattr(kill_cmd, "_GRACE_SECONDS", 0.2)

    paths.ensure_layout(project_root)
    # Build a fake psutil.Process that ignores terminate() but yields to kill().
    class FakeProc:
        pid = 12345
        killed = False

        def terminate(self) -> None:
            return None

        def wait(self, timeout: float | None = None) -> int:
            raise psutil.TimeoutExpired(seconds=timeout or 0)

        def kill(self) -> None:
            FakeProc.killed = True

    def fake_process(pid: int) -> FakeProc:
        return FakeProc()

    monkeypatch.setattr(kill_cmd.pidfile, "is_alive", lambda rec: True)
    monkeypatch.setattr(kill_cmd.psutil, "Process", fake_process)

    pidfile.write(
        paths.pid_file(project_root),
        pidfile.PidRecord(
            pid=12345,
            create_time=1.0,
            flow="stub.yaml",
            log=str(project_root / "stub.log"),
            started_at="2026-01-01T00:00:00+00:00",
            device=None,
        ),
    )

    code = kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
    assert code == kill_cmd.EXIT_OK
    assert FakeProc.killed is True


def test_kill_handles_tracked_vanishing_before_terminate(
    project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths.ensure_layout(project_root)

    class FakeProc:
        pid = 22222

        def terminate(self) -> None:
            raise psutil.NoSuchProcess(self.pid)

    def fake_process(pid: int) -> FakeProc:
        return FakeProc()

    monkeypatch.setattr(kill_cmd.pidfile, "is_alive", lambda rec: True)
    monkeypatch.setattr(kill_cmd.psutil, "Process", fake_process)

    pidfile.write(
        paths.pid_file(project_root),
        pidfile.PidRecord(
            pid=22222,
            create_time=1.0,
            flow="stub.yaml",
            log=str(project_root / "stub.log"),
            started_at="2026-01-01T00:00:00+00:00",
            device=None,
        ),
    )

    code = kill_cmd.run_kill(_cfg(project_root), kill_cmd.KillOptions())
    assert code == kill_cmd.EXIT_OK


# --- helpers ------------------------------------------------------------
def _wait_pid(pid: int, *, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not psutil.pid_exists(pid):
            return True
        try:
            if psutil.Process(pid).status() == psutil.STATUS_ZOMBIE:
                return True
        except psutil.NoSuchProcess:
            return True
        time.sleep(0.05)
    return False
