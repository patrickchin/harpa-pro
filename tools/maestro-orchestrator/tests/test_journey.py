"""Tests for `mo journey` -- composite of doctor + reset + run + optional watch.

We mock `run_doctor`, `run_reset`, and `run_run` at the journey module's
import site so we exercise the orchestrator's sequencing + watch loop
without spinning up a real Maestro / Docker / device stack.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import pytest

from maestro_orchestrator import paths, pidfile
from maestro_orchestrator.commands import journey as journey_mod
from maestro_orchestrator.commands.journey import (
    EXIT_CHILD_FAILED,
    EXIT_DOCTOR_FAILED,
    EXIT_OK,
    EXIT_RESET_FAILED,
    EXIT_RUN_FAILED,
    JourneyOptions,
    run_journey,
)
from maestro_orchestrator.config import MoConfig


# --- fixtures -----------------------------------------------------------
@pytest.fixture()
def project_root(tmp_path: Path) -> Path:
    (tmp_path / "AGENTS.md").write_text("# stub\n", encoding="utf-8")
    (tmp_path / "pnpm-workspace.yaml").write_text(
        "packages: []\n", encoding="utf-8"
    )
    paths.ensure_layout(tmp_path)
    return tmp_path


def _cfg(project_root: Path, **overrides: object) -> MoConfig:
    base: dict[str, object] = {
        "project_root": project_root,
        "app_id": "com.harpa.pro.dev",
        "device": None,
    }
    base.update(overrides)
    return MoConfig(**base)  # type: ignore[arg-type]


@dataclass
class _Calls:
    """Records of what mocks were invoked with."""

    doctor: list[dict[str, Any]]
    reset: list[Any]
    run: list[Any]


@pytest.fixture()
def mock_steps(monkeypatch: pytest.MonkeyPatch) -> _Calls:
    """Default: all three primitives succeed."""
    calls = _Calls(doctor=[], reset=[], run=[])

    def fake_doctor(cfg, *, fix, json_output, device, console=None):
        calls.doctor.append(
            {"fix": fix, "json_output": json_output, "device": device}
        )
        return 0

    def fake_reset(cfg, opts):
        calls.reset.append(opts)
        return 0

    def fake_run(cfg, opts):
        calls.run.append(opts)
        return 0

    monkeypatch.setattr(journey_mod, "run_doctor", fake_doctor)
    monkeypatch.setattr(journey_mod, "run_reset", fake_reset)
    monkeypatch.setattr(journey_mod, "run_run", fake_run)
    return calls


# --- happy path ---------------------------------------------------------
def test_happy_path_calls_all_three_in_order(
    project_root: Path, mock_steps: _Calls
) -> None:
    cfg = _cfg(project_root)
    code = run_journey(cfg, JourneyOptions(flow="x.yaml", json_output=True))
    assert code == EXIT_OK
    assert len(mock_steps.doctor) == 1
    assert mock_steps.doctor[0]["fix"] is True
    assert len(mock_steps.reset) == 1
    assert len(mock_steps.run) == 1
    assert mock_steps.run[0].flow == "x.yaml"


# --- doctor failure halts -----------------------------------------------
def test_doctor_failure_halts_pipeline(
    project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    called = {"reset": 0, "run": 0}
    monkeypatch.setattr(
        journey_mod,
        "run_doctor",
        lambda cfg, *, fix, json_output, device, console=None: 1,
    )
    monkeypatch.setattr(
        journey_mod, "run_reset", lambda c, o: called.__setitem__(
            "reset", called["reset"] + 1
        ) or 0,
    )
    monkeypatch.setattr(
        journey_mod, "run_run", lambda c, o: called.__setitem__(
            "run", called["run"] + 1
        ) or 0,
    )
    code = run_journey(
        _cfg(project_root), JourneyOptions(json_output=True)
    )
    assert code == EXIT_DOCTOR_FAILED
    assert called == {"reset": 0, "run": 0}


def test_skip_doctor_short_circuits_first_step(
    project_root: Path, mock_steps: _Calls, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Force doctor to fail to confirm we never call it.
    monkeypatch.setattr(
        journey_mod,
        "run_doctor",
        lambda *a, **kw: pytest.fail("doctor must not be invoked"),
    )
    code = run_journey(
        _cfg(project_root),
        JourneyOptions(skip_doctor=True, json_output=True),
    )
    assert code == EXIT_OK
    assert len(mock_steps.reset) == 1
    assert len(mock_steps.run) == 1


# --- reset failure halts -----------------------------------------------
def test_reset_failure_halts_pipeline(
    project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    called = {"run": 0}
    monkeypatch.setattr(
        journey_mod,
        "run_doctor",
        lambda cfg, *, fix, json_output, device, console=None: 0,
    )
    monkeypatch.setattr(journey_mod, "run_reset", lambda c, o: 1)
    monkeypatch.setattr(
        journey_mod,
        "run_run",
        lambda c, o: called.__setitem__("run", called["run"] + 1) or 0,
    )
    code = run_journey(
        _cfg(project_root), JourneyOptions(json_output=True)
    )
    assert code == EXIT_RESET_FAILED
    assert called["run"] == 0


def test_skip_reset_short_circuits_second_step(
    project_root: Path, mock_steps: _Calls, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        journey_mod,
        "run_reset",
        lambda *a, **kw: pytest.fail("reset must not be invoked"),
    )
    code = run_journey(
        _cfg(project_root),
        JourneyOptions(skip_reset=True, json_output=True),
    )
    assert code == EXIT_OK
    assert len(mock_steps.doctor) == 1
    assert len(mock_steps.run) == 1


# --- run failure -------------------------------------------------------
def test_run_failure_surfaces_exit_code(
    project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        journey_mod,
        "run_doctor",
        lambda cfg, *, fix, json_output, device, console=None: 0,
    )
    monkeypatch.setattr(journey_mod, "run_reset", lambda c, o: 0)
    monkeypatch.setattr(journey_mod, "run_run", lambda c, o: 4)
    code = run_journey(
        _cfg(project_root), JourneyOptions(json_output=True)
    )
    assert code == EXIT_RUN_FAILED


# --- watch: child exits success ----------------------------------------
def _write_pid(project_root: Path, pid: int, log: str = "x.log") -> None:
    record = pidfile.PidRecord(
        pid=pid,
        create_time=1.0,
        flow="x.yaml",
        log=log,
        started_at="2026-01-01T00:00:00+00:00",
        device=None,
    )
    pidfile.write(paths.pid_file(project_root), record)


def test_watch_success_returns_quickly(
    project_root: Path,
    mock_steps: _Calls,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Have `run_run` write a PID file so journey picks it up.
    log_path = project_root / "tmp" / "mo" / "runs" / "fake.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("hello\nworld\n", encoding="utf-8")

    def fake_run(cfg, opts):
        _write_pid(project_root, pid=4242, log=str(log_path))
        return 0

    monkeypatch.setattr(journey_mod, "run_run", fake_run)
    # Patch liveness: not alive immediately.
    monkeypatch.setattr(journey_mod.pidfile, "is_alive", lambda r: False)
    # And exit status: 0.
    monkeypatch.setattr(journey_mod, "_exit_status", lambda pid: 0)

    start = time.monotonic()
    code = run_journey(
        _cfg(project_root),
        JourneyOptions(
            watch=True,
            watch_timeout=0.5,
            watch_poll=0.1,
            json_output=True,
        ),
    )
    elapsed = time.monotonic() - start
    assert code == EXIT_OK
    assert elapsed < 1.0


def test_watch_failure_surfaces_artefacts(
    project_root: Path,
    mock_steps: _Calls,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    log_path = project_root / "tmp" / "mo" / "runs" / "fake.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("a\nb\nc\n", encoding="utf-8")

    # Drop a hierarchy XML + screenshot under runs/.
    xml = project_root / "tmp" / "mo" / "runs" / "fail.hierarchy.xml"
    xml.write_text("<x/>", encoding="utf-8")
    png = project_root / "tmp" / "mo" / "runs" / "fail.png"
    png.write_bytes(b"\x89PNG")

    def fake_run(cfg, opts):
        _write_pid(project_root, pid=5555, log=str(log_path))
        return 0

    monkeypatch.setattr(journey_mod, "run_run", fake_run)
    monkeypatch.setattr(journey_mod.pidfile, "is_alive", lambda r: False)
    monkeypatch.setattr(journey_mod, "_exit_status", lambda pid: 1)

    code = run_journey(
        _cfg(project_root),
        JourneyOptions(
            watch=True,
            watch_timeout=0.5,
            watch_poll=0.1,
            json_output=True,
        ),
    )
    assert code == EXIT_CHILD_FAILED
    out = capsys.readouterr().out
    payload = json.loads(out)
    artefacts = payload["watch"]["artefacts"]
    assert artefacts["hierarchy"] and artefacts["hierarchy"].endswith(
        ".hierarchy.xml"
    )
    assert artefacts["screenshot"] and artefacts["screenshot"].endswith(
        ".png"
    )


def test_watch_failure_no_artefacts_graceful(
    project_root: Path,
    mock_steps: _Calls,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    log_path = project_root / "tmp" / "mo" / "runs" / "fake.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("a\n", encoding="utf-8")

    def fake_run(cfg, opts):
        _write_pid(project_root, pid=7777, log=str(log_path))
        return 0

    monkeypatch.setattr(journey_mod, "run_run", fake_run)
    monkeypatch.setattr(journey_mod.pidfile, "is_alive", lambda r: False)
    monkeypatch.setattr(journey_mod, "_exit_status", lambda pid: 1)
    # Force the artefact search to find nothing by stubbing the helper.
    monkeypatch.setattr(
        journey_mod,
        "_find_failure_artefacts",
        lambda pr, *, since: {"hierarchy": None, "screenshot": None},
    )

    code = run_journey(
        _cfg(project_root),
        JourneyOptions(
            watch=True,
            watch_timeout=0.5,
            watch_poll=0.1,
            json_output=False,
        ),
    )
    assert code == EXIT_CHILD_FAILED
    out = capsys.readouterr().out
    assert "no hierarchy artefact found" in out
    assert "no screenshot artefact found" in out


def test_watch_timeout_returns_within_budget(
    project_root: Path,
    mock_steps: _Calls,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log_path = project_root / "tmp" / "mo" / "runs" / "fake.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("running\n", encoding="utf-8")

    def fake_run(cfg, opts):
        _write_pid(project_root, pid=9999, log=str(log_path))
        return 0

    monkeypatch.setattr(journey_mod, "run_run", fake_run)
    # Always alive.
    monkeypatch.setattr(journey_mod.pidfile, "is_alive", lambda r: True)

    start = time.monotonic()
    code = run_journey(
        _cfg(project_root),
        JourneyOptions(
            watch=True,
            watch_timeout=0.3,
            watch_poll=0.05,
            json_output=True,
        ),
    )
    elapsed = time.monotonic() - start
    # On timeout we don't surface a child-failed exit -- caller is
    # expected to poll separately.
    assert code == EXIT_OK
    assert elapsed < 1.5


def test_watch_no_pidfile_handled(
    project_root: Path,
    mock_steps: _Calls,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # run_run "succeeds" but writes no PID file.
    code = run_journey(
        _cfg(project_root),
        JourneyOptions(
            watch=True,
            watch_timeout=0.2,
            watch_poll=0.05,
            json_output=True,
        ),
    )
    assert code == EXIT_OK
    payload = json.loads(capsys.readouterr().out)
    assert payload["watch"]["outcome"] == "no_pid"


# --- json schema --------------------------------------------------------
def test_json_schema_has_expected_keys(
    project_root: Path,
    mock_steps: _Calls,
    capsys: pytest.CaptureFixture[str],
) -> None:
    code = run_journey(
        _cfg(project_root),
        JourneyOptions(json_output=True),
    )
    assert code == EXIT_OK
    payload = json.loads(capsys.readouterr().out)
    assert set(payload.keys()) >= {
        "exit_code", "pid", "log", "steps", "watch"
    }
    assert payload["exit_code"] == 0
    assert isinstance(payload["steps"], list)
    step_names = {s["name"] for s in payload["steps"]}
    assert step_names == {"doctor", "reset", "run"}


# --- human output -------------------------------------------------------
def test_human_output_includes_failure_summary(
    project_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        journey_mod,
        "run_doctor",
        lambda cfg, *, fix, json_output, device, console=None: 2,
    )
    monkeypatch.setattr(journey_mod, "run_reset", lambda c, o: 0)
    monkeypatch.setattr(journey_mod, "run_run", lambda c, o: 0)
    code = run_journey(_cfg(project_root), JourneyOptions(json_output=False))
    assert code == EXIT_DOCTOR_FAILED
    captured = capsys.readouterr()
    combined = captured.out + captured.err
    assert "doctor" in combined
    assert "FAIL" in combined or "fail" in combined.lower()


# --- _exit_status defensive paths --------------------------------------
def test_exit_status_returns_none_for_missing_pid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import psutil

    class _Boom:
        def __init__(self, pid: int) -> None:
            raise psutil.NoSuchProcess(pid)

    monkeypatch.setattr(journey_mod.psutil, "Process", _Boom)
    assert journey_mod._exit_status(123456) is None


def test_exit_status_returns_none_on_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import psutil

    class _Hang:
        def __init__(self, pid: int) -> None:
            self.pid = pid

        def wait(self, timeout: float = 0):
            raise psutil.TimeoutExpired(timeout)

    monkeypatch.setattr(journey_mod.psutil, "Process", _Hang)
    assert journey_mod._exit_status(42) is None


# --- _tail helper -------------------------------------------------------
def test_tail_handles_missing_file() -> None:
    assert journey_mod._tail(None, 10) == []
    assert journey_mod._tail("/no/such/path", 10) == []


def test_tail_returns_last_n_lines(tmp_path: Path) -> None:
    p = tmp_path / "log.txt"
    p.write_text("a\nb\nc\nd\ne\n", encoding="utf-8")
    assert journey_mod._tail(str(p), 2) == ["d", "e"]


# --- artefact discovery -------------------------------------------------
def test_find_failure_artefacts_ignores_old_files(
    project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    runs = paths.runs_dir(project_root)
    stale = runs / "stale.xml"
    stale.write_text("<old/>", encoding="utf-8")
    # Backdate it well beyond the 1h cutoff.
    old = time.time() - 7200.0
    import os as _os

    _os.utime(stale, (old, old))
    result = journey_mod._find_failure_artefacts(
        project_root, since=time.monotonic()
    )
    assert result["hierarchy"] is None
