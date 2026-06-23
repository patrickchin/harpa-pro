"""Tests for `mo run` — flow resolution, PID-file gating, detached spawn.

`maestro` itself is stubbed by replacing the executable-locator with
a path to the current Python interpreter and the script with a tiny
inline program. This lets us assert end-to-end behaviour (PID file
written, log file populated, refusal on second invocation) without
needing the real Maestro CLI on the test host.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import psutil
import pytest

from maestro_orchestrator import device, paths, pidfile
from maestro_orchestrator.commands import run as run_cmd
from maestro_orchestrator.config import MoConfig


# --- fixtures -----------------------------------------------------------
@pytest.fixture()
def project_root(tmp_path: Path) -> Path:
    """Marked-as-project-root tmp dir with a `.maestro/` folder + one flow."""
    (tmp_path / "AGENTS.md").write_text("# stub\n", encoding="utf-8")
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: []\n", encoding="utf-8")
    maestro = tmp_path / ".maestro"
    maestro.mkdir()
    (maestro / "regression-journey.yaml").write_text("# stub flow\n", encoding="utf-8")
    sub = maestro / "modules"
    sub.mkdir()
    (sub / "07-reports.yaml").write_text("# stub\n", encoding="utf-8")
    return tmp_path


def _cfg(project_root: Path, **overrides: object) -> MoConfig:
    base = {
        "project_root": project_root,
        "app_id": "com.harpa.pro.dev",
        "device": None,
    }
    base.update(overrides)
    return MoConfig(**base)  # type: ignore[arg-type]


@pytest.fixture()
def stub_maestro(monkeypatch: pytest.MonkeyPatch) -> tuple[str, list[str]]:
    """Make `_find_maestro_executable` return [python -c 'short script'].

    Returns (exe, prefix-args). We patch the executable lookup to point
    at the current Python interpreter. The script is selected per-test
    so we use a setter-injection style.
    """

    # Default child: print, then sleep briefly. The flow path is
    # appended as argv after "test", so we ignore it.
    script = (
        "import sys, time; "
        "print('stub maestro running with', sys.argv); "
        "time.sleep(0.3)"
    )

    # We replace the executable with python AND insert -c <script>
    # by intercepting argv in spawn_detached. Cleanest: patch the
    # private resolver to return a sentinel and patch spawn_detached
    # to rewrite argv when it sees that sentinel.

    sentinel = "<STUB-MAESTRO>"

    def fake_find() -> str:
        return sentinel

    monkeypatch.setattr(run_cmd, "_find_maestro_executable", fake_find)

    real_spawn = run_cmd.spawn.spawn_detached

    def wrapped_spawn(argv: list[str], **kwargs: object) -> int:
        if argv and argv[0] == sentinel:
            argv = [sys.executable, "-c", script] + argv[1:]
        return real_spawn(argv, **kwargs)

    monkeypatch.setattr(run_cmd.spawn, "spawn_detached", wrapped_spawn)
    return sentinel, [sys.executable, "-c", script]


# --- flow resolution ----------------------------------------------------
def test_resolve_flow_by_bare_name(project_root: Path) -> None:
    result = run_cmd._resolve_flow(project_root, "regression-journey.yaml")
    assert result is not None
    assert result.name == "regression-journey.yaml"


def test_resolve_flow_by_bare_name_without_extension(project_root: Path) -> None:
    result = run_cmd._resolve_flow(project_root, "regression-journey")
    assert result is not None
    assert result.name == "regression-journey.yaml"


def test_resolve_flow_recursive_under_maestro(project_root: Path) -> None:
    result = run_cmd._resolve_flow(project_root, "07-reports.yaml")
    assert result is not None
    assert result.parent.name == "modules"


def test_resolve_flow_absolute_path(project_root: Path) -> None:
    flow = project_root / ".maestro" / "regression-journey.yaml"
    result = run_cmd._resolve_flow(project_root, str(flow))
    assert result == flow.resolve()


def test_resolve_flow_returns_none_for_missing(project_root: Path) -> None:
    assert run_cmd._resolve_flow(project_root, "nope.yaml") is None


# --- happy path ---------------------------------------------------------
def test_run_writes_pid_file_and_log(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
) -> None:
    opts = run_cmd.RunOptions(flow="regression-journey.yaml")
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_OK

    pid_path = paths.pid_file(project_root)
    record = pidfile.read(pid_path)
    assert record is not None
    assert record.pid > 0
    assert record.flow.endswith("regression-journey.yaml")

    # Wait for child to finish so we can assert log contents.
    _wait_pid(record.pid, timeout=5.0)
    log = Path(record.log)
    assert log.exists()
    assert "stub maestro running" in log.read_text(encoding="utf-8")


def test_run_returns_fast_even_when_child_sleeps(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
) -> None:
    opts = run_cmd.RunOptions(flow="regression-journey.yaml")
    start = time.monotonic()
    code = run_cmd.run_run(_cfg(project_root), opts)
    elapsed = time.monotonic() - start
    assert code == run_cmd.EXIT_OK
    # Spec: well under 3 seconds.
    assert elapsed < 3.0, f"mo run took {elapsed:.2f}s"


def test_run_points_latest_log_alias(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
) -> None:
    opts = run_cmd.RunOptions(flow="regression-journey.yaml")
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_OK
    link = paths.latest_log_link(project_root)
    assert link.exists()


def test_run_json_output_schema(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
    capsys: pytest.CaptureFixture[str],
) -> None:
    opts = run_cmd.RunOptions(flow="regression-journey.yaml", json_output=True)
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_OK
    out = capsys.readouterr().out
    payload = json.loads(out)
    assert set(payload.keys()) == {
        "exit_code",
        "pid",
        "flow",
        "log",
        "started_at",
        "device",
    }
    assert payload["exit_code"] == 0
    assert payload["pid"] > 0


# --- refusal & --force --------------------------------------------------
def test_run_refuses_when_prior_pid_alive(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
) -> None:
    opts = run_cmd.RunOptions(flow="regression-journey.yaml")
    assert run_cmd.run_run(_cfg(project_root), opts) == run_cmd.EXIT_OK
    # Don't wait for the child — second invocation should see it alive.
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_ALREADY_RUNNING
    # Cleanup.
    rec = pidfile.read(paths.pid_file(project_root))
    if rec is not None:
        _wait_pid(rec.pid, timeout=5.0)


def test_run_force_overrides_live_pid(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
) -> None:
    base = run_cmd.RunOptions(flow="regression-journey.yaml")
    assert run_cmd.run_run(_cfg(project_root), base) == run_cmd.EXIT_OK
    forced = run_cmd.RunOptions(flow="regression-journey.yaml", force=True)
    code = run_cmd.run_run(_cfg(project_root), forced)
    assert code == run_cmd.EXIT_OK
    # Cleanup.
    rec = pidfile.read(paths.pid_file(project_root))
    if rec is not None:
        _wait_pid(rec.pid, timeout=5.0)


def test_run_proceeds_when_prior_pid_is_dead(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
) -> None:
    # Write a PID record pointing at a definitely-dead PID.
    paths.ensure_layout(project_root)
    pid_path = paths.pid_file(project_root)
    pidfile.write(
        pid_path,
        pidfile.PidRecord(
            pid=999999,
            create_time=1.0,
            flow="ghost.yaml",
            log=str(project_root / "ghost.log"),
            started_at="2026-01-01T00:00:00+00:00",
            device=None,
        ),
    )
    if psutil.pid_exists(999999):
        pytest.skip("PID 999999 happens to exist")

    code = run_cmd.run_run(
        _cfg(project_root),
        run_cmd.RunOptions(flow="regression-journey.yaml"),
    )
    assert code == run_cmd.EXIT_OK


# --- errors -------------------------------------------------------------
def test_run_flow_not_found(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
    capsys: pytest.CaptureFixture[str],
) -> None:
    opts = run_cmd.RunOptions(flow="totally-missing-flow.yaml")
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_FLOW_NOT_FOUND


def test_run_flow_not_found_json(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
    capsys: pytest.CaptureFixture[str],
) -> None:
    opts = run_cmd.RunOptions(flow="missing.yaml", json_output=True)
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_FLOW_NOT_FOUND
    payload = json.loads(capsys.readouterr().out)
    assert payload["exit_code"] == run_cmd.EXIT_FLOW_NOT_FOUND
    assert "error" in payload


def test_run_no_maestro_on_path(
    project_root: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(run_cmd, "_find_maestro_executable", lambda: None)
    opts = run_cmd.RunOptions(flow="regression-journey.yaml")
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_MAESTRO_NOT_FOUND


def test_run_passes_device_via_env(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        run_cmd.device,
        "wake_device",
        lambda *, host_name, device_id: device.DeviceOpResult(ok=True, detail="awake"),
    )
    opts = run_cmd.RunOptions(flow="regression-journey.yaml", device="emulator-5554")
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_OK
    record = pidfile.read(paths.pid_file(project_root))
    assert record is not None
    assert record.device == "emulator-5554"
    _wait_pid(record.pid, timeout=5.0)


def test_run_wakes_target_android_device_before_spawning(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    def fake_wake(*, host_name: str, device_id: str | None) -> device.DeviceOpResult:
        calls.append({"host_name": host_name, "device_id": device_id})
        return device.DeviceOpResult(ok=True, detail="awake")

    monkeypatch.setattr(run_cmd.host, "detect_host", lambda: "windows")
    monkeypatch.setattr(run_cmd.device, "wake_device", fake_wake)

    opts = run_cmd.RunOptions(flow="regression-journey.yaml", device="emulator-5554")
    code = run_cmd.run_run(_cfg(project_root), opts)
    assert code == run_cmd.EXIT_OK
    assert calls == [{"host_name": "windows", "device_id": "emulator-5554"}]

    record = pidfile.read(paths.pid_file(project_root))
    if record is not None:
        _wait_pid(record.pid, timeout=5.0)


def test_run_reports_wake_failure_before_spawning(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(run_cmd.host, "detect_host", lambda: "windows")
    monkeypatch.setattr(
        run_cmd.device,
        "wake_device",
        lambda *, host_name, device_id: device.DeviceOpResult(
            ok=False,
            detail="device offline",
        ),
    )

    code = run_cmd.run_run(
        _cfg(project_root),
        run_cmd.RunOptions(flow="regression-journey.yaml", device="emulator-5554"),
    )

    assert code == run_cmd.EXIT_DEVICE_WAKE_FAILED
    assert pidfile.read(paths.pid_file(project_root)) is None


def test_run_forwards_app_id_via_maestro_env_flag(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Maestro substitutes `${MAESTRO_APP_ID}` only from `--env`, not the
    process env. Regression for `mo run` launching app id `undefined`."""
    captured: dict[str, list[str]] = {}
    real_spawn = run_cmd.spawn.spawn_detached

    def capturing_spawn(argv: list[str], **kwargs: object) -> int:
        captured["argv"] = list(argv)
        return real_spawn(argv, **kwargs)

    monkeypatch.setattr(run_cmd.spawn, "spawn_detached", capturing_spawn)

    opts = run_cmd.RunOptions(flow="regression-journey.yaml")
    code = run_cmd.run_run(_cfg(project_root, app_id="com.harpa.pro.dev"), opts)
    assert code == run_cmd.EXIT_OK

    argv = captured["argv"]
    # Resolver replaces argv[0] with `python -c <script>`; the remainder
    # is what `run_run` constructed.
    assert "--env" in argv, f"expected --env in spawned argv, got {argv}"
    idx = argv.index("--env")
    assert argv[idx + 1] == "MAESTRO_APP_ID=com.harpa.pro.dev", argv
    # The flow path must come after the --env pair, not before.
    flow_idx = next(i for i, a in enumerate(argv) if a.endswith("regression-journey.yaml"))
    assert flow_idx > idx + 1, argv

    rec = pidfile.read(paths.pid_file(project_root))
    if rec is not None:
        _wait_pid(rec.pid, timeout=5.0)


def test_run_forwards_api_base_url_via_maestro_env_flag(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Maestro reads YAML/script globals from explicit --env flags."""
    captured: dict[str, list[str]] = {}
    real_spawn = run_cmd.spawn.spawn_detached

    def capturing_spawn(argv: list[str], **kwargs: object) -> int:
        captured["argv"] = list(argv)
        return real_spawn(argv, **kwargs)

    monkeypatch.setenv("API_BASE_URL", "http://127.0.0.1:8788")
    monkeypatch.setattr(run_cmd.spawn, "spawn_detached", capturing_spawn)

    code = run_cmd.run_run(
        _cfg(project_root, app_id="com.harpa.pro.dev"),
        run_cmd.RunOptions(flow="regression-journey.yaml"),
    )
    assert code == run_cmd.EXIT_OK

    argv = captured["argv"]
    expected = "API_BASE_URL=http://127.0.0.1:8788"
    assert expected in argv, argv
    flow_idx = next(i for i, a in enumerate(argv) if a.endswith("regression-journey.yaml"))
    assert argv.index(expected) < flow_idx, argv

    rec = pidfile.read(paths.pid_file(project_root))
    if rec is not None:
        _wait_pid(rec.pid, timeout=5.0)


def test_run_spawn_oserror_is_reported(
    project_root: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(run_cmd, "_find_maestro_executable", lambda: "fakemaestro")

    def boom(*args: object, **kwargs: object) -> int:
        raise OSError("boom")

    monkeypatch.setattr(run_cmd.spawn, "spawn_detached", boom)
    code = run_cmd.run_run(
        _cfg(project_root),
        run_cmd.RunOptions(flow="regression-journey.yaml"),
    )
    assert code == run_cmd.EXIT_SPAWN_FAILED


def test_run_garbled_pid_file_is_clobbered(
    project_root: Path,
    stub_maestro: tuple[str, list[str]],
) -> None:
    paths.ensure_layout(project_root)
    paths.pid_file(project_root).write_text("{not json", encoding="utf-8")
    code = run_cmd.run_run(
        _cfg(project_root),
        run_cmd.RunOptions(flow="regression-journey.yaml"),
    )
    assert code == run_cmd.EXIT_OK
    rec = pidfile.read(paths.pid_file(project_root))
    assert rec is not None
    _wait_pid(rec.pid, timeout=5.0)


def test_find_maestro_executable_returns_something_or_none() -> None:
    # We can't assert presence on every host, but the function must not
    # raise and must return either None or a string.
    found = run_cmd._find_maestro_executable()
    assert found is None or isinstance(found, str)


# --- helpers ------------------------------------------------------------
def _wait_pid(pid: int, *, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not psutil.pid_exists(pid):
            return
        try:
            if psutil.Process(pid).status() == psutil.STATUS_ZOMBIE:
                return
        except psutil.NoSuchProcess:
            return
        time.sleep(0.05)
    # Force-cleanup if the child still lingers.
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        proc.wait(timeout=2)
    except psutil.NoSuchProcess:
        pass
