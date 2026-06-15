"""Tests for device.py — cross-platform app-data clear and adb reverse."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock

import pytest

from maestro_orchestrator import device


def _completed(rc: int = 0, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(
        args=[], returncode=rc, stdout=stdout, stderr=stderr
    )


# --- clear_app_data -----------------------------------------------------
def test_clear_app_data_android_invokes_pm_clear(monkeypatch: pytest.MonkeyPatch) -> None:
    spy = MagicMock(return_value=_completed(stdout="Success\n"))
    monkeypatch.setattr(device, "_run", spy)
    res = device.clear_app_data(
        host_name="windows", app_id="com.harpa.pro.dev", device_id="ABCD1234"
    )
    assert res.ok, res.detail
    argv = spy.call_args[0][0]
    assert argv == [
        "adb", "-s", "ABCD1234", "shell", "pm", "clear", "com.harpa.pro.dev"
    ]


def test_clear_app_data_android_without_device_omits_serial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spy = MagicMock(return_value=_completed(stdout="Success\n"))
    monkeypatch.setattr(device, "_run", spy)
    res = device.clear_app_data(
        host_name="linux", app_id="com.harpa.pro.dev", device_id=None
    )
    assert res.ok, res.detail
    argv = spy.call_args[0][0]
    assert argv == ["adb", "shell", "pm", "clear", "com.harpa.pro.dev"]


def test_clear_app_data_android_failure_propagates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        device, "_run",
        MagicMock(return_value=_completed(rc=1, stderr="device offline\n")),
    )
    res = device.clear_app_data(
        host_name="windows", app_id="com.harpa.pro.dev", device_id="X"
    )
    assert not res.ok
    assert "device offline" in res.detail


def test_clear_app_data_android_adb_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        device, "_run", MagicMock(side_effect=FileNotFoundError())
    )
    res = device.clear_app_data(
        host_name="windows", app_id="com.harpa.pro.dev", device_id="X"
    )
    assert not res.ok
    assert "adb" in res.detail.lower()


def test_clear_app_data_ios_uses_simctl_uninstall(monkeypatch: pytest.MonkeyPatch) -> None:
    spy = MagicMock(return_value=_completed())
    monkeypatch.setattr(device, "_run", spy)
    res = device.clear_app_data(
        host_name="macos", app_id="com.harpa.pro.dev", device_id=None
    )
    assert res.ok, res.detail
    argv = spy.call_args[0][0]
    assert argv == [
        "xcrun", "simctl", "uninstall", "booted", "com.harpa.pro.dev"
    ]


def test_clear_app_data_ios_xcrun_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(device, "_run", MagicMock(side_effect=FileNotFoundError()))
    res = device.clear_app_data(
        host_name="macos", app_id="com.harpa.pro.dev", device_id=None
    )
    assert not res.ok
    assert "xcrun" in res.detail.lower()


def test_clear_app_data_ios_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        device, "_run",
        MagicMock(return_value=_completed(rc=255, stderr="No such app\n")),
    )
    res = device.clear_app_data(
        host_name="macos", app_id="com.harpa.pro.dev", device_id=None
    )
    assert not res.ok
    assert "no such app" in res.detail.lower()


def test_clear_app_data_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        device, "_run",
        MagicMock(side_effect=subprocess.TimeoutExpired(cmd="adb", timeout=4)),
    )
    res = device.clear_app_data(
        host_name="windows", app_id="com.harpa.pro.dev", device_id="X"
    )
    assert not res.ok
    assert "timed out" in res.detail.lower()


# --- wake_device --------------------------------------------------------
def test_wake_device_ios_is_skipped() -> None:
    res = device.wake_device(host_name="macos", device_id=None)
    assert res.skipped, res.detail


def test_wake_device_android_prepares_device_for_maestro(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spy = MagicMock(return_value=_completed())
    monkeypatch.setattr(device, "_run", spy)
    res = device.wake_device(host_name="windows", device_id="ABC")
    assert res.ok, res.detail
    calls = [c[0][0] for c in spy.call_args_list]
    assert ["adb", "-s", "ABC", "shell", "svc", "power", "stayon", "true"] in calls
    assert [
        "adb", "-s", "ABC", "shell", "settings", "put", "secure",
        "screensaver_enabled", "0",
    ] in calls
    assert [
        "adb", "-s", "ABC", "shell", "settings", "put", "secure",
        "screensaver_activate_on_sleep", "0",
    ] in calls
    assert [
        "adb", "-s", "ABC", "shell", "settings", "put", "secure",
        "screensaver_activate_on_dock", "0",
    ] in calls
    assert [
        "adb", "-s", "ABC", "shell", "input", "keyevent", "KEYCODE_WAKEUP"
    ] in calls
    assert [
        "adb", "-s", "ABC", "shell", "input", "keyevent", "KEYCODE_MENU"
    ] in calls
    assert calls[-1] == ["adb", "-s", "ABC", "shell", "dumpsys", "window"]


def test_wake_device_android_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        device, "_run",
        MagicMock(return_value=_completed(rc=1, stderr="offline\n")),
    )
    res = device.wake_device(host_name="windows", device_id="ABC")
    assert not res.ok
    assert "offline" in res.detail


def test_wake_device_android_refuses_locked_keyguard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    responses = [
        _completed(),
        _completed(),
        _completed(),
        _completed(),
        _completed(),
        _completed(),
        _completed(stdout="mCurrentFocus=Window{be517c0 u0 Bouncer}\n"),
    ]
    monkeypatch.setattr(device, "_run", MagicMock(side_effect=responses))
    res = device.wake_device(host_name="windows", device_id="ABC")
    assert not res.ok
    assert "keyguard" in res.detail.lower()


def test_wake_device_android_allows_stale_bouncer_when_keyguard_is_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    responses = [
        _completed(),
        _completed(),
        _completed(),
        _completed(),
        _completed(),
        _completed(),
        _completed(
            stdout=(
                "mCurrentFocus=Window{99748b2 u0 "
                "com.sec.android.app.launcher/.LauncherActivity}\n"
                "mShowingDream=false mDreamingLockscreen=false\n"
                "isKeyguardShowing=false\n"
                "Window #4 Window{be517c0 u0 Bouncer}:\n"
            )
        ),
    ]
    monkeypatch.setattr(device, "_run", MagicMock(side_effect=responses))
    res = device.wake_device(host_name="windows", device_id="ABC")
    assert res.ok, res.detail


# --- adb_reverse_ports --------------------------------------------------
def test_adb_reverse_ports_ios_is_skipped() -> None:
    res = device.adb_reverse_ports(host_name="macos", device_id=None)
    assert res.skipped, res.detail


def test_adb_reverse_ports_android_invokes_each_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spy = MagicMock(return_value=_completed())
    monkeypatch.setattr(device, "_run", spy)
    res = device.adb_reverse_ports(host_name="windows", device_id="ABC")
    assert res.ok, res.detail
    calls = [c[0][0] for c in spy.call_args_list]
    assert ["adb", "-s", "ABC", "reverse", "tcp:8081", "tcp:8081"] in calls
    assert ["adb", "-s", "ABC", "reverse", "tcp:8787", "tcp:8787"] in calls
    assert ["adb", "-s", "ABC", "reverse", "tcp:9000", "tcp:9000"] in calls
    assert len(calls) == 3


def test_adb_reverse_ports_without_device_omits_serial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spy = MagicMock(return_value=_completed())
    monkeypatch.setattr(device, "_run", spy)
    res = device.adb_reverse_ports(host_name="linux", device_id=None)
    assert res.ok, res.detail
    calls = [c[0][0] for c in spy.call_args_list]
    assert ["adb", "reverse", "tcp:8081", "tcp:8081"] in calls


def test_adb_reverse_ports_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        device, "_run",
        MagicMock(return_value=_completed(rc=1, stderr="error: no devices")),
    )
    res = device.adb_reverse_ports(host_name="windows", device_id="ABC")
    assert not res.ok
    assert "no devices" in res.detail


def test_adb_reverse_ports_adb_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(device, "_run", MagicMock(side_effect=FileNotFoundError()))
    res = device.adb_reverse_ports(host_name="windows", device_id="ABC")
    assert not res.ok
    assert "adb" in res.detail.lower()
