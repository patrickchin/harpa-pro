"""Tests for psutil-based process discovery and termination."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from maestro_orchestrator import procs


def _fake_proc(pid: int, name: str, cmdline: list[str], age_seconds: float = 0.0):
    """Build a stand-in psutil.Process double for `process_iter` results."""
    proc = MagicMock()
    proc.pid = pid
    proc.info = {"pid": pid, "name": name, "cmdline": cmdline}
    proc.cmdline.return_value = cmdline
    proc.name.return_value = name
    # create_time is stored as epoch seconds; older process = smaller value.
    import time as _t

    proc.create_time.return_value = _t.time() - age_seconds
    return proc


def test_find_processes_matches_cmdline_substring(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = _fake_proc(101, "java", ["java", "-jar", "/opt/maestro/maestro.jar"])
    other = _fake_proc(202, "python", ["python", "server.py"])
    monkeypatch.setattr(procs.psutil, "process_iter", lambda attrs=None: [target, other])

    found = procs.find_processes("maestro.jar")
    assert [p.pid for p in found] == [101]


def test_find_processes_matches_name(monkeypatch: pytest.MonkeyPatch) -> None:
    target = _fake_proc(303, "maestro-driver-ios", ["maestro-driver-ios"])
    other = _fake_proc(404, "bash", ["bash"])
    monkeypatch.setattr(procs.psutil, "process_iter", lambda attrs=None: [target, other])

    found = procs.find_processes("maestro-driver-ios")
    assert [p.pid for p in found] == [303]


def test_find_processes_skips_inaccessible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """NoSuchProcess / AccessDenied during iteration must not crash."""
    bad = MagicMock()
    bad.info = {"pid": 1, "name": "x", "cmdline": None}
    # Raising on cmdline() simulates a process dying mid-iteration.
    bad.cmdline.side_effect = procs.psutil.NoSuchProcess(1)
    good = _fake_proc(500, "java", ["java", "maestro.jar"])
    monkeypatch.setattr(procs.psutil, "process_iter", lambda attrs=None: [bad, good])

    found = procs.find_processes("maestro")
    assert [p.pid for p in found] == [500]


def test_find_processes_filters_by_min_age(monkeypatch: pytest.MonkeyPatch) -> None:
    young = _fake_proc(11, "java", ["java", "maestro.jar"], age_seconds=10)
    old = _fake_proc(22, "java", ["java", "maestro.jar"], age_seconds=600)
    monkeypatch.setattr(procs.psutil, "process_iter", lambda attrs=None: [young, old])

    found = procs.find_processes("maestro.jar", min_age_seconds=300)
    assert [p.pid for p in found] == [22]


def test_kill_processes_terminates_then_kills(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """terminate() then escalate to kill() if still alive after grace."""
    p1 = MagicMock()
    p1.pid = 1
    p1.wait.return_value = 0  # exits cleanly
    p2 = MagicMock()
    p2.pid = 2
    p2.wait.side_effect = procs.psutil.TimeoutExpired(2)

    killed = procs.kill_processes([p1, p2], grace_seconds=0.01)
    assert killed == [1, 2]
    p1.terminate.assert_called_once()
    p2.terminate.assert_called_once()
    p2.kill.assert_called_once()


def test_kill_processes_handles_already_gone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A process that's already gone shouldn't blow up the loop."""
    p1 = MagicMock()
    p1.pid = 7
    p1.terminate.side_effect = procs.psutil.NoSuchProcess(7)

    killed = procs.kill_processes([p1], grace_seconds=0.01)
    assert killed == []


def test_kill_processes_empty_list() -> None:
    assert procs.kill_processes([], grace_seconds=0.01) == []
