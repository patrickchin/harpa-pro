"""Tests for `mo up`.

Strategy: monkeypatch the side-effectful collaborators
(`subprocess.run`, `httpx`/`healthcheck.http_get`, `spawn.spawn_detached`,
`pidfile`) so we never touch docker / Metro / adb. Assert on the
recorded UpReport step ordering and exit codes.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from maestro_orchestrator import checks, device, healthcheck
from maestro_orchestrator.commands import up as up_cmd
from maestro_orchestrator.config import MoConfig


def _cfg(project_root: Path) -> MoConfig:
    return MoConfig(
        project_root=project_root,
        app_id="com.harpa.pro.dev",
        device=None,
    )


@pytest.fixture()
def project_root(tmp_path: Path) -> Path:
    (tmp_path / "AGENTS.md").write_text("# stub\n", encoding="utf-8")
    (tmp_path / "pnpm-workspace.yaml").write_text(
        "packages: []\n", encoding="utf-8"
    )
    return tmp_path


def _patch_no_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disable `time.sleep` inside `up` so polling loops are instant."""
    monkeypatch.setattr(up_cmd.time, "sleep", lambda _s: None)


# --- step: docker -------------------------------------------------------
def test_docker_skip_when_stack_running_and_healthy(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(
        up_cmd, "_docker_stack_running", lambda _cfg: True
    )
    monkeypatch.setattr(
        up_cmd.healthcheck,
        "http_get",
        lambda *_a, **_k: healthcheck.HealthResult(ok=True, status=200, error=None),
    )
    report = up_cmd.UpReport()
    ok = up_cmd._step_docker(_cfg(project_root), up_cmd.UpOptions(), report)
    assert ok is True
    assert report.steps[0] == {
        "name": "docker",
        "status": "skip",
        "detail": "stack already up + healthy",
    }


def test_docker_compose_up_when_stack_down(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _patch_no_sleep(monkeypatch)
    monkeypatch.setattr(up_cmd, "_docker_stack_running", lambda _cfg: False)

    called: dict[str, object] = {}

    def fake_compose(cfg: MoConfig) -> tuple[bool, str]:
        called["compose"] = cfg.project_root
        return True, "ok"

    monkeypatch.setattr(up_cmd, "_docker_compose_up", fake_compose)
    monkeypatch.setattr(
        up_cmd.healthcheck,
        "http_get",
        lambda *_a, **_k: healthcheck.HealthResult(ok=True, status=200, error=None),
    )
    report = up_cmd.UpReport()
    ok = up_cmd._step_docker(_cfg(project_root), up_cmd.UpOptions(), report)
    assert ok is True
    assert called["compose"] == project_root
    assert report.steps[0]["status"] == "ok"


def test_docker_fail_when_compose_up_fails(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd, "_docker_stack_running", lambda _cfg: False)
    monkeypatch.setattr(
        up_cmd, "_docker_compose_up", lambda _cfg: (False, "boom")
    )
    report = up_cmd.UpReport()
    ok = up_cmd._step_docker(_cfg(project_root), up_cmd.UpOptions(), report)
    assert ok is False
    assert report.steps[0]["status"] == "fail"
    assert "boom" in report.steps[0]["detail"]


def test_docker_fail_when_health_never_returns(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _patch_no_sleep(monkeypatch)
    monkeypatch.setattr(up_cmd, "_docker_stack_running", lambda _cfg: False)
    monkeypatch.setattr(
        up_cmd, "_docker_compose_up", lambda _cfg: (True, "started")
    )
    monkeypatch.setattr(
        up_cmd.healthcheck,
        "http_get",
        lambda *_a, **_k: healthcheck.HealthResult(
            ok=False, status=None, error="connect refused"
        ),
    )
    report = up_cmd.UpReport()
    ok = up_cmd._step_docker(
        _cfg(project_root),
        up_cmd.UpOptions(docker_timeout=0.0),
        report,
    )
    assert ok is False
    assert "healthz" in report.steps[0]["detail"]


def test_docker_stack_running_calls_check_docker_stack(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    """The internal probe defers to `checks.check_docker_stack`."""
    seen: dict[str, Any] = {}

    def fake_check(ctx: checks.DoctorContext) -> checks.CheckResult:
        seen["ctx"] = ctx
        return checks.CheckResult(
            name="docker", status="ok", detail="stub"
        )

    monkeypatch.setattr(up_cmd.checks, "check_docker_stack", fake_check)
    assert up_cmd._docker_stack_running(_cfg(project_root)) is True
    assert seen["ctx"].cfg.project_root == project_root


def test_docker_compose_up_handles_missing_docker(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    def boom(*_a: object, **_k: object) -> object:
        raise FileNotFoundError("docker")

    monkeypatch.setattr(up_cmd.subprocess, "run", boom)
    ok, detail = up_cmd._docker_compose_up(_cfg(project_root))
    assert ok is False
    assert "PATH" in detail


def test_docker_compose_up_nonzero_returncode(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    class _CP:
        returncode = 1
        stdout = "x"
        stderr = "boom"

    monkeypatch.setattr(up_cmd.subprocess, "run", lambda *_a, **_k: _CP())
    ok, detail = up_cmd._docker_compose_up(_cfg(project_root))
    assert ok is False
    assert "boom" in detail


# --- step: reverse ------------------------------------------------------
def test_reverse_skips_on_macos(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd.host, "detect_host", lambda: "macos")
    report = up_cmd.UpReport()
    up_cmd._step_reverse(_cfg(project_root), up_cmd.UpOptions(), report)
    assert report.steps[-1]["status"] == "skip"


def test_reverse_warn_on_failure(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd.host, "detect_host", lambda: "windows")
    monkeypatch.setattr(
        up_cmd.device,
        "adb_reverse_ports",
        lambda *_a, **_k: device.DeviceOpResult(ok=False, detail="no device"),
    )
    report = up_cmd.UpReport()
    up_cmd._step_reverse(_cfg(project_root), up_cmd.UpOptions(), report)
    # Don't fail mo up — warn only.
    assert report.steps[-1]["status"] == "warn"


def test_reverse_ok_on_success(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd.host, "detect_host", lambda: "windows")
    monkeypatch.setattr(
        up_cmd.device,
        "adb_reverse_ports",
        lambda *_a, **_k: device.DeviceOpResult(ok=True, detail="forwarded"),
    )
    report = up_cmd.UpReport()
    up_cmd._step_reverse(_cfg(project_root), up_cmd.UpOptions(), report)
    assert report.steps[-1]["status"] == "ok"


# --- step: metro --------------------------------------------------------
def test_metro_skip_when_already_running(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd, "_metro_ready", lambda: True)
    report = up_cmd.UpReport()
    ok = up_cmd._step_metro(_cfg(project_root), up_cmd.UpOptions(), report)
    assert ok is True
    assert report.steps[-1]["status"] == "skip"


def test_metro_spawns_and_polls_ready(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _patch_no_sleep(monkeypatch)
    state = {"ready": False, "polled": 0}

    def fake_ready() -> bool:
        # Not ready at the initial check; flip after first poll.
        state["polled"] += 1
        return state["polled"] > 1

    monkeypatch.setattr(up_cmd, "_metro_ready", fake_ready)
    monkeypatch.setattr(
        up_cmd, "_spawn_metro", lambda _cfg: (12345, "spawned 12345")
    )
    report = up_cmd.UpReport()
    ok = up_cmd._step_metro(
        _cfg(project_root),
        up_cmd.UpOptions(metro_timeout=5.0),
        report,
    )
    assert ok is True
    assert report.steps[-1]["status"] == "ok"
    assert "12345" in report.steps[-1]["detail"]


def test_metro_fails_when_never_ready(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    _patch_no_sleep(monkeypatch)
    monkeypatch.setattr(up_cmd, "_metro_ready", lambda: False)
    monkeypatch.setattr(
        up_cmd, "_spawn_metro", lambda _cfg: (12345, "spawned 12345")
    )
    report = up_cmd.UpReport()
    ok = up_cmd._step_metro(
        _cfg(project_root),
        up_cmd.UpOptions(metro_timeout=0.0),
        report,
    )
    assert ok is False
    assert "not ready" in report.steps[-1]["detail"]


def test_metro_fails_when_spawn_returns_none(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd, "_metro_ready", lambda: False)
    monkeypatch.setattr(
        up_cmd, "_spawn_metro", lambda _cfg: (None, "spawn failed: boom")
    )
    report = up_cmd.UpReport()
    ok = up_cmd._step_metro(_cfg(project_root), up_cmd.UpOptions(), report)
    assert ok is False
    assert "spawn failed" in report.steps[-1]["detail"]


def test_spawn_metro_writes_pid_file(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    """`_spawn_metro` records the PID under tmp/mo/metro.pid."""
    monkeypatch.setattr(
        up_cmd.spawn, "spawn_detached", lambda *_a, **_k: 99999
    )

    class _FakeProc:
        def __init__(self, pid: int) -> None:
            self.pid = pid

        def create_time(self) -> float:
            return 1700000000.0

    import psutil as _psutil

    monkeypatch.setattr(_psutil, "Process", _FakeProc)
    pid, detail = up_cmd._spawn_metro(_cfg(project_root))
    assert pid == 99999
    from maestro_orchestrator import paths, pidfile

    rec = pidfile.read(paths.metro_pid_file(project_root))
    assert rec is not None
    assert rec.pid == 99999
    assert rec.flow == "metro"


def test_spawn_metro_handles_oserror(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    def boom(*_a: object, **_k: object) -> int:
        raise OSError("nope")

    monkeypatch.setattr(up_cmd.spawn, "spawn_detached", boom)
    pid, detail = up_cmd._spawn_metro(_cfg(project_root))
    assert pid is None
    assert "nope" in detail


def test_spawn_metro_handles_disappeared_pid(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd.spawn, "spawn_detached", lambda *_a, **_k: 11111)
    import psutil as _psutil

    def raiser(_pid: int) -> object:
        raise _psutil.NoSuchProcess(_pid)

    monkeypatch.setattr(_psutil, "Process", raiser)
    pid, detail = up_cmd._spawn_metro(_cfg(project_root))
    assert pid is None
    assert "disappeared" in detail


def test_metro_ready_marker_passthrough(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, object] = {}

    def fake_get(url: str, **kw: object) -> healthcheck.HealthResult:
        seen["url"] = url
        seen.update(kw)
        return healthcheck.HealthResult(ok=True, status=200, error=None)

    monkeypatch.setattr(up_cmd.healthcheck, "http_get", fake_get)
    assert up_cmd._metro_ready() is True
    assert seen["url"].endswith("/status")
    assert seen["must_contain"] == "packager-status:running"


def test_tracked_metro_alive_handles_missing_file(project_root: Path) -> None:
    assert up_cmd._tracked_metro_alive(project_root) is False


# --- doctor step --------------------------------------------------------
def test_doctor_step_skipped(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    report = up_cmd.UpReport()
    ok = up_cmd._step_doctor(
        _cfg(project_root),
        up_cmd.UpOptions(skip_doctor=True),
        report,
        up_cmd.Console(),
    )
    assert ok is True
    assert report.steps[-1]["status"] == "skip"


def test_doctor_step_ok(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd, "run_doctor", lambda *_a, **_k: 0)
    report = up_cmd.UpReport()
    ok = up_cmd._step_doctor(
        _cfg(project_root), up_cmd.UpOptions(), report, up_cmd.Console()
    )
    assert ok is True
    assert report.steps[-1]["status"] == "ok"


def test_doctor_step_fail(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd, "run_doctor", lambda *_a, **_k: 1)
    report = up_cmd.UpReport()
    ok = up_cmd._step_doctor(
        _cfg(project_root), up_cmd.UpOptions(), report, up_cmd.Console()
    )
    assert ok is False
    assert report.steps[-1]["status"] == "fail"


# --- top-level run_up ---------------------------------------------------
def test_run_up_happy_path(
    monkeypatch: pytest.MonkeyPatch, project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(up_cmd, "_step_docker", lambda *_a, **_k: True)
    monkeypatch.setattr(up_cmd, "_step_reverse", lambda *_a, **_k: None)
    monkeypatch.setattr(up_cmd, "_step_metro", lambda *_a, **_k: True)
    monkeypatch.setattr(up_cmd, "_step_doctor", lambda *_a, **_k: True)
    code = up_cmd.run_up(_cfg(project_root), up_cmd.UpOptions())
    assert code == 0


def test_run_up_docker_failure_short_circuits(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    called: dict[str, bool] = {"metro": False}
    monkeypatch.setattr(up_cmd, "_step_docker", lambda *_a, **_k: False)

    def metro(*_a: object, **_k: object) -> bool:
        called["metro"] = True
        return True

    monkeypatch.setattr(up_cmd, "_step_metro", metro)
    code = up_cmd.run_up(_cfg(project_root), up_cmd.UpOptions())
    assert code == up_cmd.EXIT_DOCKER_FAILED
    assert called["metro"] is False


def test_run_up_metro_failure(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd, "_step_docker", lambda *_a, **_k: True)
    monkeypatch.setattr(up_cmd, "_step_reverse", lambda *_a, **_k: None)
    monkeypatch.setattr(up_cmd, "_step_metro", lambda *_a, **_k: False)
    code = up_cmd.run_up(_cfg(project_root), up_cmd.UpOptions())
    assert code == up_cmd.EXIT_METRO_FAILED


def test_run_up_doctor_failure(
    monkeypatch: pytest.MonkeyPatch, project_root: Path
) -> None:
    monkeypatch.setattr(up_cmd, "_step_docker", lambda *_a, **_k: True)
    monkeypatch.setattr(up_cmd, "_step_reverse", lambda *_a, **_k: None)
    monkeypatch.setattr(up_cmd, "_step_metro", lambda *_a, **_k: True)
    monkeypatch.setattr(up_cmd, "_step_doctor", lambda *_a, **_k: False)
    code = up_cmd.run_up(_cfg(project_root), up_cmd.UpOptions())
    assert code == up_cmd.EXIT_DOCTOR_FAILED


def test_run_up_json_output(
    monkeypatch: pytest.MonkeyPatch,
    project_root: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(up_cmd, "_step_docker", lambda *_a, **_k: True)
    monkeypatch.setattr(up_cmd, "_step_reverse", lambda *_a, **_k: None)
    monkeypatch.setattr(up_cmd, "_step_metro", lambda *_a, **_k: True)
    monkeypatch.setattr(up_cmd, "_step_doctor", lambda *_a, **_k: True)
    code = up_cmd.run_up(
        _cfg(project_root), up_cmd.UpOptions(json_output=True)
    )
    assert code == 0
    import json

    payload = json.loads(capsys.readouterr().out)
    assert payload["exit_code"] == 0
    assert isinstance(payload["steps"], list)
