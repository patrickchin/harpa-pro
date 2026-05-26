"""Cross-platform device interactions for `mo reset`.

Two small functions:

* `clear_app_data(host, app_id, device_id)` — wipe app data on the
  attached device. Android: `adb shell pm clear`. iOS: `xcrun simctl
  uninstall booted <app_id>` (the next dev-client launch reinstalls).
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


def adb_reverse_ports(
    *, host_name: str, device_id: str | None
) -> DeviceOpResult:
    """Re-establish `adb reverse tcp:8081` and `tcp:8787`.

    No-op on macOS (iOS Simulator shares host loopback; no reverse
    needed). On Android hosts (windows / linux), runs both ports
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
