"""Tests for `pidfile` — atomic JSON read/write + recycling-safe liveness."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

import psutil
import pytest
from pydantic import ValidationError

from maestro_orchestrator import pidfile


def _make_record(pid: int = 1234, create_time: float = 1700000000.0) -> pidfile.PidRecord:
    return pidfile.PidRecord(
        pid=pid,
        create_time=create_time,
        flow="regression-journey.yaml",
        log="/tmp/run.log",
        started_at="2026-05-26T12:00:00+00:00",
        device=None,
    )


def test_now_iso_is_utc_seconds() -> None:
    s = pidfile.now_iso()
    # ISO-8601 UTC, second precision: "...+00:00"
    assert s.endswith("+00:00")
    assert "." not in s.split("+")[0]  # no fractional seconds


def test_write_then_read_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "maestro.pid"
    rec = _make_record()
    pidfile.write(path, rec)
    assert path.exists()
    loaded = pidfile.read(path)
    assert loaded == rec


def test_read_missing_returns_none(tmp_path: Path) -> None:
    assert pidfile.read(tmp_path / "missing.pid") is None


def test_read_rejects_garbage(tmp_path: Path) -> None:
    path = tmp_path / "maestro.pid"
    path.write_text(json.dumps({"pid": -1}), encoding="utf-8")
    with pytest.raises(ValidationError):
        pidfile.read(path)


def test_read_rejects_truncated_json(tmp_path: Path) -> None:
    path = tmp_path / "maestro.pid"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(json.JSONDecodeError):
        pidfile.read(path)


def test_write_is_atomic(tmp_path: Path) -> None:
    # No .tmp file should linger after write.
    path = tmp_path / "maestro.pid"
    pidfile.write(path, _make_record())
    assert not (tmp_path / "maestro.pid.tmp").exists()


def test_remove_idempotent(tmp_path: Path) -> None:
    path = tmp_path / "maestro.pid"
    assert pidfile.remove(path) is False
    pidfile.write(path, _make_record())
    assert pidfile.remove(path) is True
    assert not path.exists()
    assert pidfile.remove(path) is False


def test_is_alive_returns_false_for_dead_pid() -> None:
    # PID 999999 is "almost certainly" not a real process. We assert
    # via psutil to be sure rather than asserting the specific result.
    pid = 999999
    if psutil.pid_exists(pid):
        pytest.skip(f"PID {pid} happens to exist on this host")
    rec = _make_record(pid=pid, create_time=1.0)
    assert pidfile.is_alive(rec) is False


def test_is_alive_true_for_live_process_with_matching_create_time() -> None:
    # Spawn a real short-lived child, capture its create_time, assert alive.
    proc = subprocess.Popen(  # noqa: S603 — argv explicit
        [sys.executable, "-c", "import time; time.sleep(5)"],
        shell=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        # Give the OS a moment to register the process.
        time.sleep(0.1)
        ps = psutil.Process(proc.pid)
        ct = ps.create_time()
        rec = _make_record(pid=proc.pid, create_time=ct)
        assert pidfile.is_alive(rec) is True
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()


def test_is_alive_false_when_create_time_mismatches() -> None:
    # Same PID, wrong spawn time -> recycled, treat as dead.
    proc = subprocess.Popen(  # noqa: S603
        [sys.executable, "-c", "import time; time.sleep(5)"],
        shell=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(0.1)
        rec = _make_record(pid=proc.pid, create_time=1.0)  # bogus
        assert pidfile.is_alive(rec) is False
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
