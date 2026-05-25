"""Tests for `mo doctor`.

Each individual check is exercised by monkeypatching the underlying
helper (subprocess._run, healthcheck.http_get, procs.find_processes).
The orchestrator is exercised by running with a stubbed catalogue.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest
from typer.testing import CliRunner

from maestro_orchestrator import checks, healthcheck, procs
from maestro_orchestrator.cli import app
from maestro_orchestrator.commands import doctor as doctor_cmd
from maestro_orchestrator.config import MoConfig


# --- shared helpers -----------------------------------------------------
def _ctx(
    project_root: Path,
    *,
    app_id: str | None = None,
    device: str | None = None,
    host_name: str = "windows",
    fix: bool = False,
) -> checks.DoctorContext:
    cfg = MoConfig(project_root=project_root, app_id=app_id, device=None)
    return checks.DoctorContext(
        cfg=cfg, host_name=host_name, device=device, fix=fix
    )


def _completed(rc: int = 0, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(
        args=[], returncode=rc, stdout=stdout, stderr=stderr
    )


# --- check_project_root -------------------------------------------------
def test_check_project_root_ok(fake_project_root: Path) -> None:
    r = checks.check_project_root(_ctx(fake_project_root))
    assert r.status == "ok"


def test_check_project_root_missing(tmp_path: Path) -> None:
    missing = tmp_path / "ghost"
    cfg = MoConfig(project_root=missing, app_id=None, device=None)
    ctx = checks.DoctorContext(
        cfg=cfg, host_name="windows", device=None, fix=False
    )
    r = checks.check_project_root(ctx)
    assert r.status == "fail"


# --- check_app_id / derive_app_id --------------------------------------
def test_derive_app_id_production(fake_project_root: Path) -> None:
    (fake_project_root / "apps" / "mobile").mkdir(parents=True)
    (fake_project_root / "apps" / "mobile" / "app.config.ts").write_text(
        "// stub\n", encoding="utf-8"
    )
    assert checks.derive_app_id(fake_project_root, "production") == "com.harpa.pro"


def test_derive_app_id_dev_default(fake_project_root: Path) -> None:
    (fake_project_root / "apps" / "mobile").mkdir(parents=True)
    (fake_project_root / "apps" / "mobile" / "app.config.ts").write_text(
        "", encoding="utf-8"
    )
    assert checks.derive_app_id(fake_project_root, None) == "com.harpa.pro.dev"
    assert checks.derive_app_id(fake_project_root, "development") == "com.harpa.pro.dev"
    assert checks.derive_app_id(fake_project_root, "preview") == "com.harpa.pro.dev"


def test_derive_app_id_no_config(fake_project_root: Path) -> None:
    assert checks.derive_app_id(fake_project_root, "development") is None


def test_check_app_id_explicit(fake_project_root: Path) -> None:
    r = checks.check_app_id(_ctx(fake_project_root, app_id="com.example"))
    assert r.status == "ok"
    assert "com.example" in r.detail


def test_check_app_id_derived(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (fake_project_root / "apps" / "mobile").mkdir(parents=True)
    (fake_project_root / "apps" / "mobile" / "app.config.ts").write_text("", encoding="utf-8")
    monkeypatch.delenv("APP_VARIANT", raising=False)
    r = checks.check_app_id(_ctx(fake_project_root))
    assert r.status == "ok"
    assert "com.harpa.pro.dev" in r.detail


def test_check_app_id_unresolvable(fake_project_root: Path) -> None:
    # no app.config.ts and no env override
    r = checks.check_app_id(_ctx(fake_project_root))
    assert r.status == "fail"


# --- check_maestro_on_path ---------------------------------------------
def test_check_maestro_ok(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from maestro_orchestrator import maestro_cli

    monkeypatch.setattr(maestro_cli, "find_maestro_executable", lambda: "/usr/local/bin/maestro")
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, "1.40.0\n")
    )
    r = checks.check_maestro_on_path(_ctx(fake_project_root))
    assert r.status == "ok"
    assert "1.40.0" in r.detail


def test_check_maestro_not_on_path(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from maestro_orchestrator import maestro_cli

    monkeypatch.setattr(maestro_cli, "find_maestro_executable", lambda: None)
    r = checks.check_maestro_on_path(_ctx(fake_project_root))
    assert r.status == "fail"
    assert "not found" in r.detail


def test_check_maestro_timeout(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from maestro_orchestrator import maestro_cli

    monkeypatch.setattr(maestro_cli, "find_maestro_executable", lambda: "/usr/local/bin/maestro")

    def _raise(*a: Any, **kw: Any):
        raise subprocess.TimeoutExpired(cmd="maestro", timeout=4.0)

    monkeypatch.setattr(checks, "_run", _raise)
    r = checks.check_maestro_on_path(_ctx(fake_project_root))
    assert r.status == "fail"
    assert "timed out" in r.detail


def test_check_maestro_nonzero(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from maestro_orchestrator import maestro_cli

    monkeypatch.setattr(maestro_cli, "find_maestro_executable", lambda: "/usr/local/bin/maestro")
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(2, "", "oops")
    )
    r = checks.check_maestro_on_path(_ctx(fake_project_root))
    assert r.status == "fail"


# --- check_metro / check_api -------------------------------------------
def test_check_metro_ok(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        healthcheck,
        "http_get",
        lambda *a, **kw: healthcheck.HealthResult(ok=True, status=200, error=None),
    )
    r = checks.check_metro(_ctx(fake_project_root))
    assert r.status == "ok"


def test_check_metro_fail(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        healthcheck,
        "http_get",
        lambda *a, **kw: healthcheck.HealthResult(
            ok=False, status=None, error="connect refused"
        ),
    )
    r = checks.check_metro(_ctx(fake_project_root))
    assert r.status == "fail"


def test_check_api_ok(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        healthcheck,
        "http_get",
        lambda *a, **kw: healthcheck.HealthResult(ok=True, status=200, error=None),
    )
    r = checks.check_api(_ctx(fake_project_root))
    assert r.status == "ok"


def test_check_api_fail(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        healthcheck,
        "http_get",
        lambda *a, **kw: healthcheck.HealthResult(
            ok=False, status=503, error=None
        ),
    )
    r = checks.check_api(_ctx(fake_project_root))
    assert r.status == "fail"


# --- check_docker_stack -------------------------------------------------
_NDJSON_HEALTHY = '\n'.join([
    '{"Service":"pg","State":"running"}',
    '{"Service":"api","State":"running"}',
    '{"Service":"minio","State":"running"}',
    '{"Service":"adminer","State":"running"}',
])

_NDJSON_API_DOWN = '\n'.join([
    '{"Service":"pg","State":"running"}',
    '{"Service":"minio","State":"running"}',
])


def test_check_docker_all_healthy(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, _NDJSON_HEALTHY)
    )
    r = checks.check_docker_stack(_ctx(fake_project_root))
    assert r.status == "ok"


def test_check_docker_missing_service(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, _NDJSON_API_DOWN)
    )
    r = checks.check_docker_stack(_ctx(fake_project_root))
    assert r.status == "fail"
    assert "api" in r.detail


def test_check_docker_not_installed(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise FileNotFoundError("docker")

    monkeypatch.setattr(checks, "_run", _raise)
    r = checks.check_docker_stack(_ctx(fake_project_root))
    assert r.status == "fail"


def test_check_docker_timeout(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise subprocess.TimeoutExpired(cmd="docker", timeout=5.0)

    monkeypatch.setattr(checks, "_run", _raise)
    r = checks.check_docker_stack(_ctx(fake_project_root))
    assert r.status == "fail"


def test_check_docker_nonzero(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(1, "", "daemon not running")
    )
    r = checks.check_docker_stack(_ctx(fake_project_root))
    assert r.status == "fail"


def test_parse_compose_ps_array_form() -> None:
    out = '[{"Service":"pg","State":"running"}]'
    assert checks._parse_compose_ps(out) == [
        {"Service": "pg", "State": "running"}
    ]


def test_parse_compose_ps_empty() -> None:
    assert checks._parse_compose_ps("") == []
    assert checks._parse_compose_ps("not json") == []


def test_parse_compose_ps_ndjson_skips_bad_lines() -> None:
    out = '{"Service":"pg","State":"running"}\nnot-json\n{"Service":"api","State":"running"}'
    parsed = checks._parse_compose_ps(out)
    assert len(parsed) == 2


# --- check_fixture_env --------------------------------------------------
def test_check_fixture_env_ok(fake_project_root: Path) -> None:
    (fake_project_root / "docker-compose.yml").write_text(
        "services:\n  api:\n    environment:\n      AI_FIXTURE_MODE: replay\n      R2_FIXTURE_MODE: live\n",
        encoding="utf-8",
    )
    r = checks.check_fixture_env(_ctx(fake_project_root))
    assert r.status == "ok"


def test_check_fixture_env_missing(fake_project_root: Path) -> None:
    (fake_project_root / "docker-compose.yml").write_text(
        "services:\n  api: {}\n", encoding="utf-8"
    )
    r = checks.check_fixture_env(_ctx(fake_project_root))
    assert r.status == "fail"


def test_check_fixture_env_no_compose(fake_project_root: Path) -> None:
    r = checks.check_fixture_env(_ctx(fake_project_root))
    assert r.status == "fail"


# --- orphan checks ------------------------------------------------------
def test_check_no_orphan_maestro_clean(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(procs, "find_processes", lambda *a, **kw: [])
    r = checks.check_no_orphan_maestro(_ctx(fake_project_root))
    assert r.status == "ok"


def test_check_no_orphan_maestro_warn(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = MagicMock(pid=999)
    monkeypatch.setattr(procs, "find_processes", lambda *a, **kw: [fake])
    r = checks.check_no_orphan_maestro(_ctx(fake_project_root))
    assert r.status == "warn"
    assert "999" in r.detail


def test_check_no_orphan_maestro_fix(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = MagicMock(pid=999)
    monkeypatch.setattr(procs, "find_processes", lambda *a, **kw: [fake])
    monkeypatch.setattr(procs, "kill_processes", lambda *a, **kw: [999])
    r = checks.check_no_orphan_maestro(_ctx(fake_project_root, fix=True))
    assert r.status == "ok"
    assert r.fixed is True


def test_check_orphan_ios_driver_skipped_on_windows(
    fake_project_root: Path,
) -> None:
    r = checks.check_no_orphan_ios_driver(
        _ctx(fake_project_root, host_name="windows")
    )
    assert r.status == "skip"


def test_check_orphan_ios_driver_warn_on_mac(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = MagicMock(pid=42)
    monkeypatch.setattr(procs, "find_processes", lambda *a, **kw: [fake])
    r = checks.check_no_orphan_ios_driver(
        _ctx(fake_project_root, host_name="macos")
    )
    assert r.status == "warn"


def test_check_orphan_ios_driver_fix(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = MagicMock(pid=42)
    monkeypatch.setattr(procs, "find_processes", lambda *a, **kw: [fake])
    monkeypatch.setattr(procs, "kill_processes", lambda *a, **kw: [42])
    r = checks.check_no_orphan_ios_driver(
        _ctx(fake_project_root, host_name="macos", fix=True)
    )
    assert r.status == "ok"
    assert r.fixed is True


def test_check_orphan_ios_driver_clean_on_mac(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(procs, "find_processes", lambda *a, **kw: [])
    r = checks.check_no_orphan_ios_driver(
        _ctx(fake_project_root, host_name="macos")
    )
    assert r.status == "ok"


# --- adb device --------------------------------------------------------
_ADB_DEVICES_ONE = "List of devices attached\nR3CT7092S2H\tdevice\n"
_ADB_DEVICES_MANY = "List of devices attached\nR3CT7092S2H\tdevice\nemulator-5554\tdevice\n"
_ADB_DEVICES_NONE = "List of devices attached\n"
_ADB_DEVICES_OFFLINE = "List of devices attached\nR3CT7092S2H\toffline\n"


def test_parse_adb_devices_one() -> None:
    assert checks._parse_adb_devices(_ADB_DEVICES_ONE) == ["R3CT7092S2H"]


def test_parse_adb_devices_skips_offline() -> None:
    assert checks._parse_adb_devices(_ADB_DEVICES_OFFLINE) == []


def test_parse_adb_devices_many() -> None:
    assert checks._parse_adb_devices(_ADB_DEVICES_MANY) == [
        "R3CT7092S2H",
        "emulator-5554",
    ]


def test_check_adb_device_single(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, _ADB_DEVICES_ONE)
    )
    ctx = _ctx(fake_project_root)
    r = checks.check_adb_device(ctx)
    assert r.status == "ok"
    assert ctx.resolved_device == "R3CT7092S2H"


def test_check_adb_device_none(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, _ADB_DEVICES_NONE)
    )
    r = checks.check_adb_device(_ctx(fake_project_root))
    assert r.status == "fail"


def test_check_adb_device_many_requires_selection(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, _ADB_DEVICES_MANY)
    )
    r = checks.check_adb_device(_ctx(fake_project_root))
    assert r.status == "fail"


def test_check_adb_device_honours_request(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, _ADB_DEVICES_MANY)
    )
    ctx = _ctx(fake_project_root, device="emulator-5554")
    r = checks.check_adb_device(ctx)
    assert r.status == "ok"
    assert ctx.resolved_device == "emulator-5554"


def test_check_adb_device_requested_missing(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, _ADB_DEVICES_ONE)
    )
    r = checks.check_adb_device(_ctx(fake_project_root, device="nope"))
    assert r.status == "fail"


def test_check_adb_device_not_installed(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise FileNotFoundError("adb")

    monkeypatch.setattr(checks, "_run", _raise)
    r = checks.check_adb_device(_ctx(fake_project_root))
    assert r.status == "fail"


def test_check_adb_device_timeout(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise subprocess.TimeoutExpired(cmd="adb", timeout=4.0)

    monkeypatch.setattr(checks, "_run", _raise)
    r = checks.check_adb_device(_ctx(fake_project_root))
    assert r.status == "fail"


def test_check_adb_device_nonzero(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(1, "", "err")
    )
    r = checks.check_adb_device(_ctx(fake_project_root))
    assert r.status == "fail"


# --- adb reverse -------------------------------------------------------
_REVERSE_OK = "R3CT7092S2H tcp:8081 tcp:8081\nR3CT7092S2H tcp:8787 tcp:8787\n"
_REVERSE_PARTIAL = "R3CT7092S2H tcp:8081 tcp:8081\n"


def test_check_adb_reverse_skipped_without_device(
    fake_project_root: Path,
) -> None:
    r = checks.check_adb_reverse(_ctx(fake_project_root))
    assert r.status == "skip"


def test_check_adb_reverse_ok(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(0, _REVERSE_OK))
    ctx = _ctx(fake_project_root)
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_adb_reverse(ctx)
    assert r.status == "ok"


def test_check_adb_reverse_missing_no_fix(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks, "_run", lambda *a, **kw: _completed(0, _REVERSE_PARTIAL)
    )
    ctx = _ctx(fake_project_root)
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_adb_reverse(ctx)
    assert r.status == "fail"
    assert "tcp:8787" in r.detail


def test_check_adb_reverse_fix_succeeds(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = {"n": 0}

    def fake_run(argv, **kw):
        calls["n"] += 1
        if argv[-1] == "--list":
            return _completed(0, _REVERSE_PARTIAL)
        # fix: `adb -s ... reverse tcp:8787 tcp:8787`
        return _completed(0)

    monkeypatch.setattr(checks, "_run", fake_run)
    ctx = _ctx(fake_project_root, fix=True)
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_adb_reverse(ctx)
    assert r.status == "ok"
    assert r.fixed is True


def test_check_adb_reverse_fix_fails(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_run(argv, **kw):
        if argv[-1] == "--list":
            return _completed(0, _REVERSE_PARTIAL)
        return _completed(1, "", "permission denied")

    monkeypatch.setattr(checks, "_run", fake_run)
    ctx = _ctx(fake_project_root, fix=True)
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_adb_reverse(ctx)
    assert r.status == "fail"


def test_check_adb_reverse_adb_missing(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise FileNotFoundError("adb")

    monkeypatch.setattr(checks, "_run", _raise)
    ctx = _ctx(fake_project_root)
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_adb_reverse(ctx)
    assert r.status == "fail"


def test_check_adb_reverse_timeout(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise subprocess.TimeoutExpired(cmd="adb", timeout=4.0)

    monkeypatch.setattr(checks, "_run", _raise)
    ctx = _ctx(fake_project_root)
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_adb_reverse(ctx)
    assert r.status == "fail"


def test_check_adb_reverse_list_nonzero(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(1, "", "err"))
    ctx = _ctx(fake_project_root)
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_adb_reverse(ctx)
    assert r.status == "fail"


# --- android app installed ---------------------------------------------
def test_check_android_app_installed_ok(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        checks,
        "_run",
        lambda *a, **kw: _completed(0, "package:com.harpa.pro.dev\n"),
    )
    ctx = _ctx(fake_project_root, app_id="com.harpa.pro.dev")
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_android_app_installed(ctx)
    assert r.status == "ok"


def test_check_android_app_installed_missing(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(0, ""))
    ctx = _ctx(fake_project_root, app_id="com.harpa.pro.dev")
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_android_app_installed(ctx)
    assert r.status == "fail"


def test_check_android_app_installed_skipped_without_device(
    fake_project_root: Path,
) -> None:
    r = checks.check_android_app_installed(
        _ctx(fake_project_root, app_id="com.harpa.pro.dev")
    )
    assert r.status == "skip"


def test_check_android_app_installed_skipped_without_app_id(
    fake_project_root: Path,
) -> None:
    ctx = _ctx(fake_project_root)
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_android_app_installed(ctx)
    assert r.status == "skip"


def test_check_android_app_installed_adb_error(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise FileNotFoundError("adb")

    monkeypatch.setattr(checks, "_run", _raise)
    ctx = _ctx(fake_project_root, app_id="com.harpa.pro.dev")
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_android_app_installed(ctx)
    assert r.status == "fail"


def test_check_android_app_installed_nonzero(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(1))
    ctx = _ctx(fake_project_root, app_id="com.harpa.pro.dev")
    ctx.resolved_device = "R3CT7092S2H"
    r = checks.check_android_app_installed(ctx)
    assert r.status == "fail"


# --- iOS simulator / app installed -------------------------------------
_SIMCTL_BOOTED = (
    "== Devices ==\n"
    "-- iOS 17.0 --\n"
    "    iPhone 15 (12345678-90AB-CDEF-1234-567890ABCDEF) (Booted)\n"
)
_SIMCTL_NONE = "== Devices ==\n-- iOS 17.0 --\n"


def test_check_ios_simulator_skipped_off_mac(
    fake_project_root: Path,
) -> None:
    r = checks.check_ios_simulator_booted(
        _ctx(fake_project_root, host_name="windows")
    )
    assert r.status == "skip"


def test_check_ios_simulator_booted(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(0, _SIMCTL_BOOTED))
    ctx = _ctx(fake_project_root, host_name="macos")
    r = checks.check_ios_simulator_booted(ctx)
    assert r.status == "ok"
    assert ctx.resolved_device == "12345678-90AB-CDEF-1234-567890ABCDEF"


def test_check_ios_simulator_none_booted(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(0, _SIMCTL_NONE))
    r = checks.check_ios_simulator_booted(
        _ctx(fake_project_root, host_name="macos")
    )
    assert r.status == "fail"


def test_check_ios_simulator_xcrun_missing(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise FileNotFoundError("xcrun")

    monkeypatch.setattr(checks, "_run", _raise)
    r = checks.check_ios_simulator_booted(
        _ctx(fake_project_root, host_name="macos")
    )
    assert r.status == "fail"


def test_check_ios_simulator_timeout(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise subprocess.TimeoutExpired(cmd="xcrun", timeout=4.0)

    monkeypatch.setattr(checks, "_run", _raise)
    r = checks.check_ios_simulator_booted(
        _ctx(fake_project_root, host_name="macos")
    )
    assert r.status == "fail"


def test_check_ios_simulator_nonzero(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(1))
    r = checks.check_ios_simulator_booted(
        _ctx(fake_project_root, host_name="macos")
    )
    assert r.status == "fail"


def test_check_ios_app_installed_ok(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(0, "/path"))
    r = checks.check_ios_app_installed(
        _ctx(fake_project_root, host_name="macos", app_id="com.harpa.pro.dev")
    )
    assert r.status == "ok"


def test_check_ios_app_installed_missing(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(checks, "_run", lambda *a, **kw: _completed(1))
    r = checks.check_ios_app_installed(
        _ctx(fake_project_root, host_name="macos", app_id="com.harpa.pro.dev")
    )
    assert r.status == "fail"


def test_check_ios_app_installed_skipped_off_mac(
    fake_project_root: Path,
) -> None:
    r = checks.check_ios_app_installed(
        _ctx(fake_project_root, host_name="windows")
    )
    assert r.status == "skip"


def test_check_ios_app_installed_no_app_id(
    fake_project_root: Path,
) -> None:
    r = checks.check_ios_app_installed(
        _ctx(fake_project_root, host_name="macos")
    )
    assert r.status == "skip"


def test_check_ios_app_installed_xcrun_error(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _raise(*a: Any, **kw: Any):
        raise FileNotFoundError("xcrun")

    monkeypatch.setattr(checks, "_run", _raise)
    r = checks.check_ios_app_installed(
        _ctx(fake_project_root, host_name="macos", app_id="com.harpa.pro.dev")
    )
    assert r.status == "fail"


# --- orchestrator: run_doctor ------------------------------------------
def _stub_all_checks(monkeypatch: pytest.MonkeyPatch, status: str = "ok") -> None:
    """Patch every check function to return the given status quickly.

    Stubbed results use the canonical bare name (strip `check_` prefix
    and the `_booted` / `_on_path` suffixes) so the orchestrator's
    required-set matching still works.
    """
    def make(name: str):
        def fn(ctx: checks.DoctorContext) -> checks.CheckResult:
            return checks.CheckResult(name=name, status=status, detail="stub")

        return fn

    for attr, bare in _CHECK_NAME_MAP.items():
        monkeypatch.setattr(checks, attr, make(bare))


_CHECK_NAME_MAP: dict[str, str] = {
    "check_project_root": "project_root",
    "check_app_id": "app_id",
    "check_maestro_on_path": "maestro_cli",
    "check_metro": "metro",
    "check_api": "api",
    "check_docker_stack": "docker",
    "check_fixture_env": "fixture_env",
    "check_no_orphan_maestro": "orphan_maestro",
    "check_no_orphan_ios_driver": "orphan_ios_driver",
    "check_adb_device": "adb_device",
    "check_adb_reverse": "adb_reverse",
    "check_android_app_installed": "android_app_installed",
    "check_ios_simulator_booted": "ios_simulator",
    "check_ios_app_installed": "ios_app_installed",
}


def test_run_doctor_all_ok_exits_zero(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _stub_all_checks(monkeypatch, "ok")
    monkeypatch.setattr(
        "maestro_orchestrator.commands.doctor.host.detect_host",
        lambda: "windows",
    )
    cfg = MoConfig(project_root=fake_project_root, app_id=None, device=None)
    code = doctor_cmd.run_doctor(cfg)
    assert code == 0


def test_run_doctor_required_fail_exits_one(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_all_checks(monkeypatch, "fail")
    monkeypatch.setattr(
        "maestro_orchestrator.commands.doctor.host.detect_host",
        lambda: "windows",
    )
    cfg = MoConfig(project_root=fake_project_root, app_id=None, device=None)
    code = doctor_cmd.run_doctor(cfg)
    assert code == 1


def test_run_doctor_warns_do_not_fail(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_all_checks(monkeypatch, "warn")
    monkeypatch.setattr(
        "maestro_orchestrator.commands.doctor.host.detect_host",
        lambda: "windows",
    )
    cfg = MoConfig(project_root=fake_project_root, app_id=None, device=None)
    code = doctor_cmd.run_doctor(cfg)
    assert code == 0


def test_run_doctor_json_output_valid(
    fake_project_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _stub_all_checks(monkeypatch, "ok")
    monkeypatch.setattr(
        "maestro_orchestrator.commands.doctor.host.detect_host",
        lambda: "windows",
    )
    cfg = MoConfig(project_root=fake_project_root, app_id="com.x", device=None)
    code = doctor_cmd.run_doctor(cfg, json_output=True)
    assert code == 0
    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert payload["exit_code"] == 0
    assert payload["host"] == "windows"
    assert payload["app_id"] == "com.x"
    assert isinstance(payload["checks"], list)
    assert all("name" in c and "status" in c for c in payload["checks"])


def test_run_doctor_handles_crashing_check(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Stub everything ok, then make one check explode.
    _stub_all_checks(monkeypatch, "ok")

    def boom(ctx: checks.DoctorContext) -> checks.CheckResult:
        raise RuntimeError("boom")

    monkeypatch.setattr(checks, "check_api", boom)
    monkeypatch.setattr(
        "maestro_orchestrator.commands.doctor.host.detect_host",
        lambda: "windows",
    )
    cfg = MoConfig(project_root=fake_project_root, app_id=None, device=None)
    code = doctor_cmd.run_doctor(cfg, json_output=True)
    assert code == 1  # api is required


def test_run_doctor_fix_flag_threaded_through(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen_fix: list[bool] = []

    def spy(ctx: checks.DoctorContext) -> checks.CheckResult:
        seen_fix.append(ctx.fix)
        return checks.CheckResult(name="project_root", status="ok", detail="x")

    monkeypatch.setattr(checks, "check_project_root", spy)
    # Stub the rest to ok so we don't fail.
    _stub_all_checks_except(monkeypatch, skip={"check_project_root"})
    monkeypatch.setattr(
        "maestro_orchestrator.commands.doctor.host.detect_host",
        lambda: "windows",
    )
    cfg = MoConfig(project_root=fake_project_root, app_id=None, device=None)
    doctor_cmd.run_doctor(cfg, fix=True)
    assert seen_fix == [True]


def _stub_all_checks_except(
    monkeypatch: pytest.MonkeyPatch, *, skip: set[str]
) -> None:
    def make(name: str):
        def fn(ctx: checks.DoctorContext) -> checks.CheckResult:
            return checks.CheckResult(name=name, status="ok", detail="stub")

        return fn

    for attr, bare in _CHECK_NAME_MAP.items():
        if attr in skip:
            continue
        monkeypatch.setattr(checks, attr, make(bare))


def test_run_doctor_macos_uses_ios_checks(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """On macOS, ios_simulator + ios_app_installed must be required."""
    captured_names: list[str] = []

    def make(name: str):
        def fn(ctx: checks.DoctorContext) -> checks.CheckResult:
            captured_names.append(name)
            return checks.CheckResult(name=name, status="ok", detail="x")

        return fn

    for attr, bare in _CHECK_NAME_MAP.items():
        monkeypatch.setattr(checks, attr, make(bare))
    monkeypatch.setattr(
        "maestro_orchestrator.commands.doctor.host.detect_host",
        lambda: "macos",
    )
    cfg = MoConfig(project_root=fake_project_root, app_id="x", device=None)
    code = doctor_cmd.run_doctor(cfg, json_output=True)
    assert code == 0
    assert "ios_simulator" in captured_names
    assert "ios_app_installed" in captured_names


# --- CLI integration ---------------------------------------------------
def test_cli_doctor_help(runner: CliRunner) -> None:
    result = runner.invoke(app, ["doctor", "--help"])
    assert result.exit_code == 0
    assert "--fix" in result.stdout
    assert "--json" in result.stdout
    assert "--device" in result.stdout


def test_cli_doctor_json_runs(
    fake_project_root: Path, monkeypatch: pytest.MonkeyPatch, runner: CliRunner
) -> None:
    _stub_all_checks(monkeypatch, "ok")
    monkeypatch.setattr(
        "maestro_orchestrator.commands.doctor.host.detect_host",
        lambda: "windows",
    )
    monkeypatch.setenv("HARPA_PROJECT_ROOT", str(fake_project_root))
    monkeypatch.setenv("MAESTRO_APP_ID", "com.x")
    result = runner.invoke(app, ["doctor", "--json"])
    assert result.exit_code == 0, result.stdout
    payload = json.loads(result.stdout)
    assert payload["exit_code"] == 0
