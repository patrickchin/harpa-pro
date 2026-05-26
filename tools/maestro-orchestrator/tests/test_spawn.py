"""Tests for `spawn_detached` — the cross-platform detach primitive.

These tests use a real Python subprocess as the child (no mocking)
because the entire correctness argument for this module is "the OS
actually treats this as detached". Mocking would defeat the purpose.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import psutil
import pytest

from maestro_orchestrator import spawn


def _wait_for_pid_exit(pid: int, timeout: float) -> bool:
    """Poll psutil until `pid` is gone or `timeout` elapses."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not psutil.pid_exists(pid):
            return True
        try:
            proc = psutil.Process(pid)
            if proc.status() == psutil.STATUS_ZOMBIE:
                return True
        except psutil.NoSuchProcess:
            return True
        time.sleep(0.05)
    return False


def test_spawn_detached_returns_quickly_even_if_child_sleeps(tmp_path: Path) -> None:
    log = tmp_path / "child.log"
    start = time.monotonic()
    pid = spawn.spawn_detached(
        [sys.executable, "-c", "import time; time.sleep(2)"],
        log_path=log,
    )
    elapsed = time.monotonic() - start
    # Spawn must return well under a second even when the child sleeps.
    assert elapsed < 1.0, f"spawn_detached took {elapsed:.2f}s"
    assert pid > 0
    # Clean up: kill the child so it doesn't linger past the test.
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        proc.wait(timeout=3)
    except psutil.NoSuchProcess:
        pass


def test_spawn_detached_child_runs_to_completion_in_background(tmp_path: Path) -> None:
    log = tmp_path / "child.log"
    marker = tmp_path / "done.marker"
    # Child writes a marker after a tiny sleep — proves it ran post-detach.
    script = (
        "import time, pathlib;"
        "time.sleep(0.3);"
        f"pathlib.Path(r'{marker}').write_text('done', encoding='utf-8')"
    )
    pid = spawn.spawn_detached([sys.executable, "-c", script], log_path=log)
    assert _wait_for_pid_exit(pid, timeout=5.0), "child never exited"
    assert marker.exists(), "child didn't run its body"
    assert marker.read_text(encoding="utf-8") == "done"


def test_spawn_detached_writes_stdout_to_log(tmp_path: Path) -> None:
    log = tmp_path / "out.log"
    pid = spawn.spawn_detached(
        [sys.executable, "-c", "print('hello-from-child')"],
        log_path=log,
    )
    assert _wait_for_pid_exit(pid, timeout=5.0)
    contents = log.read_text(encoding="utf-8")
    assert "hello-from-child" in contents


def test_spawn_detached_merges_stderr_into_log(tmp_path: Path) -> None:
    log = tmp_path / "out.log"
    pid = spawn.spawn_detached(
        [
            sys.executable,
            "-c",
            "import sys; sys.stderr.write('err-line\\n'); sys.stderr.flush()",
        ],
        log_path=log,
    )
    assert _wait_for_pid_exit(pid, timeout=5.0)
    assert "err-line" in log.read_text(encoding="utf-8")


def test_spawn_detached_creates_parent_dirs(tmp_path: Path) -> None:
    log = tmp_path / "nested" / "deep" / "out.log"
    pid = spawn.spawn_detached(
        [sys.executable, "-c", "print('ok')"],
        log_path=log,
    )
    assert _wait_for_pid_exit(pid, timeout=5.0)
    assert log.exists()


def test_spawn_detached_passes_env(tmp_path: Path) -> None:
    log = tmp_path / "out.log"
    custom_env = {**os.environ, "MO_TEST_VAR": "magic-value-xyz"}
    pid = spawn.spawn_detached(
        [
            sys.executable,
            "-c",
            "import os; print('VAR=' + os.environ.get('MO_TEST_VAR', 'missing'))",
        ],
        log_path=log,
        env=custom_env,
    )
    assert _wait_for_pid_exit(pid, timeout=5.0)
    assert "VAR=magic-value-xyz" in log.read_text(encoding="utf-8")


def test_spawn_detached_nonexistent_executable_raises(tmp_path: Path) -> None:
    log = tmp_path / "out.log"
    with pytest.raises((FileNotFoundError, OSError)):
        spawn.spawn_detached(
            ["this-binary-does-not-exist-anywhere-xyz123"],
            log_path=log,
        )
