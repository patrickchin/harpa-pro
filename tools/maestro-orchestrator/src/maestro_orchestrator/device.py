"""Cross-platform device interactions for `mo reset`.

Two small functions:

* `clear_app_data(host, app_id, device_id)` — wipe app data on the
  attached device. Android: `adb shell pm clear`. iOS: `xcrun simctl
  uninstall booted <app_id>` (the next dev-client launch reinstalls).
* `wake_device(host, device_id)` — wake an Android device out of
  sleep / DreamActivity before Maestro starts, and fail fast if a
  secure keyguard still blocks automation.
* `adb_reverse_ports(host, device_id)` — re-establish the loopback
  forwards needed after `pm clear` (Pitfall windows#20). No-op on iOS.

Tests monkeypatch `_run`, so we never touch a real device.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass

_SUBPROCESS_TIMEOUT = 8.0
_REVERSE_PORTS: tuple[tuple[str, str], ...] = (
    ("tcp:8081", "tcp:8081"),
    ("tcp:8787", "tcp:8787"),
    ("tcp:9000", "tcp:9000"),
)
_ANDROID_WAKE_COMMANDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("enable stay-awake", ("shell", "svc", "power", "stayon", "true")),
    (
        "disable screensaver",
        ("shell", "settings", "put", "secure", "screensaver_enabled", "0"),
    ),
    (
        "disable sleep dreams",
        (
            "shell",
            "settings",
            "put",
            "secure",
            "screensaver_activate_on_sleep",
            "0",
        ),
    ),
    (
        "disable dock dreams",
        (
            "shell",
            "settings",
            "put",
            "secure",
            "screensaver_activate_on_dock",
            "0",
        ),
    ),
    ("wake device", ("shell", "input", "keyevent", "KEYCODE_WAKEUP")),
    ("dismiss keyguard", ("shell", "input", "keyevent", "KEYCODE_MENU")),
)


@dataclass(frozen=True)
class DeviceOpResult:
    """Outcome of a device operation. Mirrors checks.CheckResult shape
    but lives separately so device.py has zero coupling to the doctor
    catalogue.
    """

    ok: bool
    detail: str
    skipped: bool = False


def _run(argv: list[str], *, timeout: float = _SUBPROCESS_TIMEOUT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 — argv explicit, shell=False
        argv,
        shell=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _ok(detail: str) -> DeviceOpResult:
    return DeviceOpResult(ok=True, detail=detail)


def _fail(detail: str) -> DeviceOpResult:
    return DeviceOpResult(ok=False, detail=detail)


def _skip(detail: str) -> DeviceOpResult:
    return DeviceOpResult(ok=True, detail=detail, skipped=True)


def _adb_argv(device_id: str | None, *rest: str) -> list[str]:
    prefix = ["adb"]
    if device_id:
        prefix += ["-s", device_id]
    return prefix + list(rest)


def clear_app_data(
    *, host_name: str, app_id: str, device_id: str | None
) -> DeviceOpResult:
    """Wipe app data for `app_id` on the connected device.

    Android: `adb [-s <serial>] shell pm clear <app_id>`.
    iOS (macOS only): `xcrun simctl uninstall booted <app_id>`.

    The iOS path uninstalls rather than re-installs; the dev-client
    reinstalls on next launch from `apps/mobile`. Reinstalling from
    a `.app` bundle here is design Q-open (see design doc §4.2 step 3).
    """
    if host_name == "macos":
        argv = ["xcrun", "simctl", "uninstall", "booted", app_id]
        tool = "xcrun"
    else:
        argv = _adb_argv(device_id, "shell", "pm", "clear", app_id)
        tool = "adb"
    try:
        result = _run(argv)
    except FileNotFoundError:
        return _fail(f"`{tool}` not on PATH")
    except subprocess.TimeoutExpired:
        return _fail(f"`{tool}` timed out clearing {app_id}")
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[:200]
        return _fail(
            f"{tool} exited {result.returncode}"
            + (f": {detail}" if detail else "")
        )
    return _ok(f"cleared {app_id}")


def wake_device(*, host_name: str, device_id: str | None) -> DeviceOpResult:
    """Prepare Android so Maestro does not assert against DreamActivity.

    No-op on macOS (iOS Simulator does not enter Android's dream
    state). On Android hosts, keep the device awake, disable dream
    activation, wake it, and press MENU to dismiss non-secure lock
    screens. If a secure keyguard remains, fail before spawning
    Maestro with a message the operator can act on.
    """
    if host_name == "macos":
        return _skip("iOS simulator wake not needed")
    for label, args in _ANDROID_WAKE_COMMANDS:
        argv = _adb_argv(device_id, *args)
        try:
            result = _run(argv)
        except FileNotFoundError:
            return _fail("`adb` not on PATH")
        except subprocess.TimeoutExpired:
            return _fail(f"`adb` timed out during {label}")
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            return _fail(
                f"adb {label} exited {result.returncode}"
                + (f": {detail}" if detail else "")
            )

    state = _read_android_window_state(device_id)
    if not state.ok:
        return state
    blocked = _android_window_blocker(state.detail)
    if blocked is not None:
        return _fail(blocked)
    return _ok("device awake; dreams disabled")


def _read_android_window_state(device_id: str | None) -> DeviceOpResult:
    argv = _adb_argv(device_id, "shell", "dumpsys", "window")
    try:
        result = _run(argv)
    except FileNotFoundError:
        return _fail("`adb` not on PATH")
    except subprocess.TimeoutExpired:
        return _fail("`adb` timed out reading window state")
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        return _fail(
            f"adb dumpsys window exited {result.returncode}"
            + (f": {detail}" if detail else "")
        )
    return _ok(result.stdout)


def _android_window_blocker(window_state: str) -> str | None:
    if "DreamActivity" in window_state or "mShowingDream=true" in window_state:
        return "Android dream/screensaver is still focused; wake or unlock device"
    if "isKeyguardShowing=true" in window_state:
        return "Android keyguard is still showing; unlock the device before E2E"
    for line in window_state.splitlines():
        if (
            ("mCurrentFocus=" in line or "mFocusedWindow=" in line)
            and "Bouncer" in line
        ):
            return "Android keyguard is still showing; unlock the device before E2E"
    return None


def adb_reverse_ports(
    *, host_name: str, device_id: str | None
) -> DeviceOpResult:
    """Re-establish Android loopback forwards for Metro, API, and MinIO.

    No-op on macOS (iOS Simulator shares host loopback; no reverse
    needed). On Android hosts (windows / linux), runs each port
    sequentially. Idempotent — `adb reverse` overwrites any existing
    forward for the same local spec.
    """
    if host_name == "macos":
        return _skip("iOS shares host loopback; no adb reverse needed")
    errors: list[str] = []
    for local, remote in _REVERSE_PORTS:
        argv = _adb_argv(device_id, "reverse", local, remote)
        try:
            result = _run(argv)
        except FileNotFoundError:
            return _fail("`adb` not on PATH")
        except subprocess.TimeoutExpired:
            errors.append(f"{local}: timed out")
            continue
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            errors.append(f"{local}: rc={result.returncode} {detail}".strip())
    if errors:
        return _fail("; ".join(errors))
    forwards = ", ".join(local for local, _ in _REVERSE_PORTS)
    return _ok(f"forwarded {forwards}")
