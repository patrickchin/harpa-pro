"""Tests for `mo reset` — the between-runs DB + device reset.

Reset is purely orchestration: it composes `db.truncate_sql()`,
`device.clear_app_data`, and `device.adb_reverse_ports` with a
docker-stack pre-check borrowed from `checks.check_docker_stack`.
Tests stub each collaborator so we never touch docker / adb.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from typer.testing import CliRunner

from maestro_orchestrator import checks, device
from maestro_orchestrator.cli import app
from maestro_orchestrator.commands import reset as reset_cmd
from maestro_orchestrator.config import MoConfig


# --- shared helpers -----------------------------------------------------
def _cfg(project_root: Path, *, app_id: str = "com.harpa.pro.dev") -> MoConfig:
    return MoConfig(project_root=project_root, app_id=app_id, device=None)


def _completed(rc: int = 0, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(
        args=[], returncode=rc, stdout=stdout, stderr=stderr
    )


def _stub_all_steps_ok(monkeypatch: pytest.MonkeyPatch) -> dict[str, MagicMock]:
    """Make every step succeed. Returns the spy dict for assertions."""
    docker_check = MagicMock(
        return_value=checks.CheckResult(name="docker", status="ok", detail="up")
    )
    monkeypatch.setattr(reset_cmd, "_docker_precheck", docker_check)

    device_check = MagicMock(
        return_value=checks.CheckResult(
            name="adb_device", status="ok", detail="ABC attached"
        )
    )
    monkeypatch.setattr(reset_cmd, "_device_precheck", device_check)

    truncate = MagicMock(return_value=reset_cmd.StepOutcome(ok=True, detail="db truncated"))
    monkeypatch.setattr(reset_cmd, "_run_db_truncate", truncate)

    clear = MagicMock(
        return_value=device.DeviceOpResult(ok=True, detail="cleared X")
    )
    monkeypatch.setattr(device, "clear_app_data", clear)

    reverse = MagicMock(
        return_value=device.DeviceOpResult(ok=True, detail="forwarded ports")
    )
    monkeypatch.setattr(device, "adb_reverse_ports", reverse)

    return {
        "docker": docker_check,
        "device": device_check,
        "truncate": truncate,
        "clear": clear,
        "reverse": reverse,
    }


def _opts(**kwargs: object) -> reset_cmd.ResetOptions:
    """Build ResetOptions with overrides; defaults are 'do everything'."""
    base = dict(
        device=None,
        skip_db=False,
        skip_app=False,
        skip_reverse=False,
        seed=None,
        json_output=False,
    )
    base.update(kwargs)
    return reset_cmd.ResetOptions(**base)  # type: ignore[arg-type]


# --- happy path ---------------------------------------------------------
def test_happy_path_runs_all_steps_returns_zero(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts())
    assert code == 0
    spies["docker"].assert_called_once()
    spies["truncate"].assert_called_once()
    spies["clear"].assert_called_once()
    spies["reverse"].assert_called_once()


def test_happy_path_passes_app_id_through_to_clear(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    cfg = _cfg(fake_project_root, app_id="com.foo.bar")
    code = reset_cmd.run_reset(cfg, _opts())
    assert code == 0
    _, kwargs = spies["clear"].call_args
    assert kwargs["app_id"] == "com.foo.bar"


# --- skip flags ---------------------------------------------------------
def test_skip_db_short_circuits_truncate(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts(skip_db=True))
    assert code == 0
    spies["truncate"].assert_not_called()
    spies["clear"].assert_called_once()
    spies["reverse"].assert_called_once()


def test_skip_app_short_circuits_clear(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts(skip_app=True))
    assert code == 0
    spies["clear"].assert_not_called()


def test_skip_reverse_short_circuits_reverse(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts(skip_reverse=True))
    assert code == 0
    spies["reverse"].assert_not_called()


def test_skip_all_returns_zero_does_nothing(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(
        _cfg(fake_project_root),
        _opts(skip_db=True, skip_app=True, skip_reverse=True),
    )
    assert code == 0
    spies["truncate"].assert_not_called()
    spies["clear"].assert_not_called()
    spies["reverse"].assert_not_called()


# --- failure paths ------------------------------------------------------
def test_docker_down_fails_cleanly(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_all_steps_ok(monkeypatch)
    monkeypatch.setattr(
        reset_cmd, "_docker_precheck",
        MagicMock(return_value=checks.CheckResult(
            name="docker", status="fail", detail="docker daemon not running"
        )),
    )
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts())
    assert code != 0


def test_docker_down_skips_db_step(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    monkeypatch.setattr(
        reset_cmd, "_docker_precheck",
        MagicMock(return_value=checks.CheckResult(
            name="docker", status="fail", detail="not running"
        )),
    )
    reset_cmd.run_reset(_cfg(fake_project_root), _opts())
    spies["truncate"].assert_not_called()


def test_db_truncate_failure_propagates_exit_code(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_all_steps_ok(monkeypatch)
    monkeypatch.setattr(
        reset_cmd, "_run_db_truncate",
        MagicMock(return_value=reset_cmd.StepOutcome(ok=False, detail="psql: error")),
    )
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts())
    assert code != 0


def test_clear_failure_propagates(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_all_steps_ok(monkeypatch)
    monkeypatch.setattr(
        device, "clear_app_data",
        MagicMock(return_value=device.DeviceOpResult(ok=False, detail="adb: device offline")),
    )
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts())
    assert code != 0


def test_reverse_failure_propagates(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_all_steps_ok(monkeypatch)
    monkeypatch.setattr(
        device, "adb_reverse_ports",
        MagicMock(return_value=device.DeviceOpResult(ok=False, detail="adb: no devices")),
    )
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts())
    assert code != 0


def test_device_precheck_failure_does_not_run_clear(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    monkeypatch.setattr(
        reset_cmd, "_device_precheck",
        MagicMock(return_value=checks.CheckResult(
            name="adb_device", status="fail", detail="no device"
        )),
    )
    # Device precheck only runs when --device is specified.
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts(device="ABC"))
    assert code != 0
    spies["clear"].assert_not_called()


def test_device_precheck_only_runs_when_device_specified(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spies = _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts())
    assert code == 0
    spies["device"].assert_not_called()


# --- seed legacy --------------------------------------------------------
def test_seed_legacy_returns_failure_not_implemented(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts(seed="legacy"))
    assert code != 0


def test_seed_unknown_value_fails(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(_cfg(fake_project_root), _opts(seed="bogus"))
    assert code != 0


# --- JSON output --------------------------------------------------------
def test_json_output_schema(
    fake_project_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _stub_all_steps_ok(monkeypatch)
    code = reset_cmd.run_reset(
        _cfg(fake_project_root), _opts(json_output=True)
    )
    assert code == 0
    out = capsys.readouterr().out
    payload = json.loads(out)
    assert payload["exit_code"] == 0
    assert payload["host"] in {"windows", "macos", "linux"}
    assert "project_root" in payload
    assert "app_id" in payload
    assert isinstance(payload["steps"], list)
    names = [s["name"] for s in payload["steps"]]
    # Docker precheck always present; db / app / reverse present unless skipped.
    assert "docker" in names
    assert "db" in names
    assert "app" in names
    assert "reverse" in names
    for s in payload["steps"]:
        assert s["status"] in {"ok", "fail", "skip"}
        assert "detail" in s


def test_json_output_skip_marks_steps(
    fake_project_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _stub_all_steps_ok(monkeypatch)
    reset_cmd.run_reset(
        _cfg(fake_project_root),
        _opts(json_output=True, skip_db=True, skip_app=True, skip_reverse=True),
    )
    payload = json.loads(capsys.readouterr().out)
    by_name = {s["name"]: s for s in payload["steps"]}
    assert by_name["db"]["status"] == "skip"
    assert by_name["app"]["status"] == "skip"
    assert by_name["reverse"]["status"] == "skip"


# --- _docker_precheck wraps checks.check_docker_stack ------------------
def test_docker_precheck_delegates_to_check_docker_stack(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spy = MagicMock(return_value=checks.CheckResult(
        name="docker", status="ok", detail="up"
    ))
    monkeypatch.setattr(checks, "check_docker_stack", spy)
    result = reset_cmd._docker_precheck(_cfg(fake_project_root))
    assert result.status == "ok"
    spy.assert_called_once()


# --- _device_precheck wraps adb checks ---------------------------------
def test_device_precheck_delegates_to_check_adb_device(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spy = MagicMock(return_value=checks.CheckResult(
        name="adb_device", status="ok", detail="ABC attached"
    ))
    monkeypatch.setattr(checks, "check_adb_device", spy)
    result = reset_cmd._device_precheck(_cfg(fake_project_root), "ABC")
    assert result.status == "ok"
    spy.assert_called_once()


# --- _run_db_truncate composes argv from db.py -------------------------
def test_run_db_truncate_invokes_docker_exec_with_sql_on_stdin(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from maestro_orchestrator import db as db_mod

    spy = MagicMock(return_value=_completed())
    monkeypatch.setattr(reset_cmd.subprocess, "run", spy)
    result = reset_cmd._run_db_truncate()
    assert result.ok, result.detail
    args, kwargs = spy.call_args
    assert args[0] == db_mod.docker_exec_argv("ignored")
    assert kwargs.get("input") == db_mod.truncate_sql()
    assert kwargs.get("shell") is False
    assert kwargs.get("timeout") is not None


def test_run_db_truncate_failure(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        reset_cmd.subprocess, "run",
        MagicMock(return_value=_completed(rc=1, stderr="psql: bad connection")),
    )
    result = reset_cmd._run_db_truncate()
    assert not result.ok
    assert "psql" in result.detail


def test_run_db_truncate_docker_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        reset_cmd.subprocess, "run", MagicMock(side_effect=FileNotFoundError())
    )
    result = reset_cmd._run_db_truncate()
    assert not result.ok
    assert "docker" in result.detail.lower()


def test_run_db_truncate_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        reset_cmd.subprocess, "run",
        MagicMock(side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=15)),
    )
    result = reset_cmd._run_db_truncate()
    assert not result.ok
    assert "timed out" in result.detail.lower()


# --- CLI surface --------------------------------------------------------
def test_cli_reset_help_exits_zero(runner: CliRunner) -> None:
    result = runner.invoke(app, ["reset", "--help"])
    assert result.exit_code == 0
    # Spot-check flags are listed.
    for flag in ("--device", "--skip-db", "--skip-app", "--skip-reverse", "--seed", "--json"):
        assert flag in result.stdout, f"missing {flag} in --help"


def test_cli_reset_propagates_exit_code(
    fake_project_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    runner: CliRunner,
) -> None:
    from maestro_orchestrator import cli as cli_mod

    monkeypatch.setenv("HARPA_PROJECT_ROOT", str(fake_project_root))
    monkeypatch.setattr(cli_mod, "run_reset", MagicMock(return_value=7))
    result = runner.invoke(app, ["reset", "--skip-db", "--skip-app", "--skip-reverse"])
    assert result.exit_code == 7


def test_cli_reset_skip_all_returns_zero(
    fake_project_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    runner: CliRunner,
) -> None:
    monkeypatch.setenv("HARPA_PROJECT_ROOT", str(fake_project_root))
    _stub_all_steps_ok(monkeypatch)
    result = runner.invoke(
        app, ["reset", "--skip-db", "--skip-app", "--skip-reverse"]
    )
    assert result.exit_code == 0
