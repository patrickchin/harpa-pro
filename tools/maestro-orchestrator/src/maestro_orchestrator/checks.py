"""The `mo doctor` preflight check catalogue.

Each check is a small function that takes a `DoctorContext` and
returns a `CheckResult`. Checks call into module-level helpers
(subprocess, httpx, psutil) which tests monkeypatch.

See `docs/v4/design-maestro-orchestrator.md` §4.1.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Literal

from . import healthcheck, host, procs
from .config import MoConfig

Status = Literal["ok", "fail", "warn", "skip"]


# --- runtime budgets ----------------------------------------------------
HTTP_TIMEOUT_SECONDS = 2.0
SUBPROCESS_TIMEOUT_SECONDS = 5.0
ORPHAN_MIN_AGE_SECONDS = 300.0  # 5 min — anything younger may be the live run


@dataclass(frozen=True)
class CheckResult:
    """Outcome of a single doctor check."""

    name: str
    status: Status
    detail: str
    fixed: bool = False


@dataclass
class DoctorContext:
    """Per-invocation state shared across checks."""

    cfg: MoConfig
    host_name: str
    device: str | None
    fix: bool
    # Set during the device check so dependent checks (adb reverse, app
    # installed) know which serial to talk to.
    resolved_device: str | None = field(default=None)


CheckFn = Callable[[DoctorContext], CheckResult]


# --- subprocess wrapper -------------------------------------------------
def _run(argv: list[str], *, timeout: float = SUBPROCESS_TIMEOUT_SECONDS) -> subprocess.CompletedProcess[str]:
    """subprocess.run wrapper enforcing shell=False, text, capture, timeout."""
    return subprocess.run(  # noqa: S603 - argv is explicit, shell=False
        argv,
        shell=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _ok(name: str, detail: str = "", fixed: bool = False) -> CheckResult:
    return CheckResult(name=name, status="ok", detail=detail, fixed=fixed)


def _fail(name: str, detail: str) -> CheckResult:
    return CheckResult(name=name, status="fail", detail=detail)


def _warn(name: str, detail: str) -> CheckResult:
    return CheckResult(name=name, status="warn", detail=detail)


def _skip(name: str, detail: str) -> CheckResult:
    return CheckResult(name=name, status="skip", detail=detail)


# --- individual checks --------------------------------------------------
def check_project_root(ctx: DoctorContext) -> CheckResult:
    """HARPA_PROJECT_ROOT resolves (already enforced by load_config)."""
    root = ctx.cfg.project_root
    if root.exists():
        return _ok("project_root", str(root))
    return _fail("project_root", f"path does not exist: {root}")


# Default value used when APP_VARIANT is unset / development.
_DEV_BUNDLE_ID = "com.harpa.pro.dev"
_PROD_BUNDLE_ID = "com.harpa.pro"


def derive_app_id(project_root: Path, app_variant: str | None) -> str | None:
    """Map APP_VARIANT to the bundle id used by app.config.ts.

    Returns None only if `app.config.ts` is missing — callers treat that
    as "couldn't derive" and report a failure.
    """
    config = project_root / "apps" / "mobile" / "app.config.ts"
    if not config.exists():
        return None
    variant = (app_variant or "development").strip()
    if variant == "production":
        return _PROD_BUNDLE_ID
    # preview + development + unknown → dev bundle id
    return _DEV_BUNDLE_ID


def check_app_id(ctx: DoctorContext) -> CheckResult:
    """`MAESTRO_APP_ID` set explicitly, or derivable from app.config.ts."""
    if ctx.cfg.app_id:
        return _ok("app_id", ctx.cfg.app_id)
    import os

    derived = derive_app_id(ctx.cfg.project_root, os.environ.get("APP_VARIANT"))
    if derived is None:
        return _fail(
            "app_id",
            "MAESTRO_APP_ID unset and apps/mobile/app.config.ts not found",
        )
    return _ok("app_id", f"{derived} (derived)")


def check_maestro_on_path(ctx: DoctorContext) -> CheckResult:
    """`maestro --version` succeeds."""
    try:
        result = _run(["maestro", "--version"], timeout=4.0)
    except FileNotFoundError:
        # On Windows, the entry point is maestro.bat under ~/.maestro/bin.
        hint = ""
        if host.is_windows():
            hint = (
                " (try adding %USERPROFILE%\\.maestro\\bin to PATH; "
                "look for maestro.bat)"
            )
        return _fail("maestro_cli", f"`maestro` not on PATH{hint}")
    except subprocess.TimeoutExpired:
        return _fail("maestro_cli", "`maestro --version` timed out")
    if result.returncode != 0:
        return _fail(
            "maestro_cli",
            f"`maestro --version` exited {result.returncode}: {result.stderr.strip()[:200]}",
        )
    return _ok("maestro_cli", result.stdout.strip().splitlines()[0] if result.stdout else "ok")


def check_metro(ctx: DoctorContext) -> CheckResult:
    """Metro packager reachable at http://localhost:8081/status."""
    res = healthcheck.http_get(
        "http://localhost:8081/status",
        timeout=HTTP_TIMEOUT_SECONDS,
        must_contain="packager-status:running",
    )
    if res.ok:
        return _ok("metro", "running on :8081")
    return _fail("metro", res.error or f"HTTP {res.status}")


def check_api(ctx: DoctorContext) -> CheckResult:
    """API reachable at http://localhost:8787/healthz."""
    res = healthcheck.http_get(
        "http://localhost:8787/healthz",
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if res.ok:
        return _ok("api", "healthy on :8787")
    return _fail("api", res.error or f"HTTP {res.status}")


def check_docker_stack(ctx: DoctorContext) -> CheckResult:
    """`docker compose ps --format json` shows pg + api + minio running.

    Compose outputs one JSON object per line (NDJSON) in modern versions,
    or a JSON array in older versions. Handle both.
    """
    try:
        result = _run(
            ["docker", "compose", "ps", "--format", "json"],
            timeout=5.0,
        )
    except FileNotFoundError:
        return _fail("docker", "`docker` not on PATH")
    except subprocess.TimeoutExpired:
        return _fail("docker", "`docker compose ps` timed out")

    if result.returncode != 0:
        return _fail(
            "docker",
            f"`docker compose ps` exited {result.returncode}: {result.stderr.strip()[:200]}",
        )

    services = _parse_compose_ps(result.stdout)
    required = {"pg", "api", "minio"}
    found = {s["Service"] for s in services if s.get("State") == "running"}
    missing = required - found
    if missing:
        return _fail(
            "docker",
            f"compose services not running: {sorted(missing)}",
        )
    return _ok("docker", f"pg + api + minio running ({len(services)} services)")


def _parse_compose_ps(output: str) -> list[dict[str, str]]:
    """Parse `docker compose ps --format json` output (NDJSON or array)."""
    output = output.strip()
    if not output:
        return []
    # NDJSON: one object per line.
    if output.startswith("{"):
        services: list[dict[str, str]] = []
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                services.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return services
    # Array form.
    try:
        parsed = json.loads(output)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        return []
    return []


def check_fixture_env(ctx: DoctorContext) -> CheckResult:
    """docker-compose.yml pins AI_FIXTURE_MODE=replay + R2_FIXTURE_MODE=live.

    The compose stack is authoritative for these — we don't read a
    separate `.env.local`. The check verifies the compose file at the
    project root contains both settings.
    """
    compose = ctx.cfg.project_root / "docker-compose.yml"
    if not compose.exists():
        return _fail("fixture_env", f"docker-compose.yml not found at {compose}")
    text = compose.read_text(encoding="utf-8")
    needed = ("AI_FIXTURE_MODE: replay", "R2_FIXTURE_MODE")
    missing = [n for n in needed if n not in text]
    if missing:
        return _fail("fixture_env", f"docker-compose.yml missing: {missing}")
    return _ok("fixture_env", "AI_FIXTURE_MODE=replay, R2_FIXTURE_MODE set")


def check_no_orphan_maestro(ctx: DoctorContext) -> CheckResult:
    """No `java -jar maestro.jar` processes older than 5 min."""
    orphans = procs.find_processes(
        "maestro.jar", min_age_seconds=ORPHAN_MIN_AGE_SECONDS
    )
    if not orphans:
        return _ok("orphan_maestro", "none")
    pids = [p.pid for p in orphans]
    if ctx.fix:
        killed = procs.kill_processes(orphans)
        return CheckResult(
            name="orphan_maestro",
            status="ok",
            detail=f"killed orphan PIDs {killed}",
            fixed=True,
        )
    return _warn(
        "orphan_maestro",
        f"{len(orphans)} orphan java/maestro PIDs: {pids} (use --fix)",
    )


def check_no_orphan_ios_driver(ctx: DoctorContext) -> CheckResult:
    """No `maestro-driver-ios` processes older than 5 min (mac only)."""
    if ctx.host_name != "macos":
        return _skip("orphan_ios_driver", "macOS only")
    orphans = procs.find_processes(
        "maestro-driver-ios", min_age_seconds=ORPHAN_MIN_AGE_SECONDS
    )
    if not orphans:
        return _ok("orphan_ios_driver", "none")
    pids = [p.pid for p in orphans]
    if ctx.fix:
        killed = procs.kill_processes(orphans)
        return CheckResult(
            name="orphan_ios_driver",
            status="ok",
            detail=f"killed orphan PIDs {killed}",
            fixed=True,
        )
    return _warn(
        "orphan_ios_driver",
        f"{len(orphans)} orphan driver PIDs: {pids} (use --fix)",
    )


# --- Android-only checks -----------------------------------------------
def _parse_adb_devices(output: str) -> list[str]:
    """Extract attached serials from `adb devices` output.

    Skips the `List of devices attached` header and any `offline` /
    `unauthorized` entries.
    """
    serials: list[str] = []
    for raw in output.splitlines():
        line = raw.strip()
        if not line or line.startswith("List of devices"):
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "device":
            serials.append(parts[0])
    return serials


def check_adb_device(ctx: DoctorContext) -> CheckResult:
    """At least one ADB device attached. Honours MAESTRO_DEVICE / --device."""
    try:
        result = _run(["adb", "devices"], timeout=4.0)
    except FileNotFoundError:
        return _fail("adb_device", "`adb` not on PATH")
    except subprocess.TimeoutExpired:
        return _fail("adb_device", "`adb devices` timed out")
    if result.returncode != 0:
        return _fail("adb_device", f"`adb devices` exited {result.returncode}")

    serials = _parse_adb_devices(result.stdout)
    if not serials:
        return _fail("adb_device", "no devices attached (try `adb devices`)")

    requested = ctx.device or ctx.cfg.device
    if requested:
        if requested not in serials:
            return _fail(
                "adb_device",
                f"requested device {requested!r} not attached; have {serials}",
            )
        ctx.resolved_device = requested
        return _ok("adb_device", f"{requested} attached")

    if len(serials) > 1:
        return _fail(
            "adb_device",
            f"multiple devices attached {serials}; set MAESTRO_DEVICE or pass --device",
        )
    ctx.resolved_device = serials[0]
    return _ok("adb_device", f"{serials[0]} attached")


def _parse_reverse_list(output: str) -> set[str]:
    """Extract local port specs from `adb reverse --list` output.

    Each line looks like: `<serial> tcp:8081 tcp:8081`.
    Returns the set of local specs (the first tcp:N column).
    """
    specs: set[str] = set()
    for raw in output.splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = line.split()
        for token in parts:
            if token.startswith("tcp:"):
                specs.add(token)
                break
    return specs


_REVERSE_PORTS = ("tcp:8081", "tcp:8787")


def check_adb_reverse(ctx: DoctorContext) -> CheckResult:
    """Both tcp:8081 and tcp:8787 forwarded via `adb reverse` (Pitfall #20)."""
    if not ctx.resolved_device:
        return _skip("adb_reverse", "no device resolved")
    serial = ctx.resolved_device
    try:
        result = _run(["adb", "-s", serial, "reverse", "--list"], timeout=4.0)
    except FileNotFoundError:
        return _fail("adb_reverse", "`adb` not on PATH")
    except subprocess.TimeoutExpired:
        return _fail("adb_reverse", "`adb reverse --list` timed out")
    if result.returncode != 0:
        return _fail(
            "adb_reverse",
            f"`adb reverse --list` exited {result.returncode}",
        )

    found = _parse_reverse_list(result.stdout)
    missing = [p for p in _REVERSE_PORTS if p not in found]
    if not missing:
        return _ok("adb_reverse", "tcp:8081 + tcp:8787 forwarded")
    if not ctx.fix:
        return _fail(
            "adb_reverse",
            f"missing reverses {missing}; use --fix to re-establish",
        )
    # --fix: re-establish each missing port (idempotent).
    fix_errors: list[str] = []
    for port in missing:
        try:
            fix_result = _run(
                ["adb", "-s", serial, "reverse", port, port], timeout=4.0
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            fix_errors.append(f"{port}: {exc}")
            continue
        if fix_result.returncode != 0:
            fix_errors.append(f"{port}: rc={fix_result.returncode}")
    if fix_errors:
        return _fail("adb_reverse", f"--fix failed: {fix_errors}")
    return CheckResult(
        name="adb_reverse",
        status="ok",
        detail=f"re-established {missing}",
        fixed=True,
    )


def check_android_app_installed(ctx: DoctorContext) -> CheckResult:
    """Target app id present in `adb shell pm list packages`."""
    if not ctx.resolved_device:
        return _skip("android_app_installed", "no device resolved")
    import os as _os

    app_id = ctx.cfg.app_id or derive_app_id(
        ctx.cfg.project_root, _os.environ.get("APP_VARIANT")
    )
    if not app_id:
        return _skip("android_app_installed", "no app id resolved")
    try:
        result = _run(
            ["adb", "-s", ctx.resolved_device, "shell", "pm", "list", "packages", app_id],
            timeout=4.0,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return _fail("android_app_installed", f"adb error: {exc}")
    if result.returncode != 0:
        return _fail(
            "android_app_installed",
            f"`pm list packages` exited {result.returncode}",
        )
    if f"package:{app_id}" not in result.stdout:
        return _fail(
            "android_app_installed",
            f"{app_id} not installed on {ctx.resolved_device}",
        )
    return _ok("android_app_installed", f"{app_id} installed")


# --- iOS-only checks ----------------------------------------------------
def check_ios_simulator_booted(ctx: DoctorContext) -> CheckResult:
    """A booted iOS simulator exists (mac only)."""
    if ctx.host_name != "macos":
        return _skip("ios_simulator", "macOS only")
    try:
        result = _run(
            ["xcrun", "simctl", "list", "devices", "booted"], timeout=4.0
        )
    except FileNotFoundError:
        return _fail("ios_simulator", "`xcrun` not on PATH")
    except subprocess.TimeoutExpired:
        return _fail("ios_simulator", "`xcrun simctl list` timed out")
    if result.returncode != 0:
        return _fail("ios_simulator", f"xcrun exited {result.returncode}")
    # Parse: lines like `iPhone 15 (UUID) (Booted)` appear under sections.
    booted_udid: str | None = None
    for raw in result.stdout.splitlines():
        line = raw.strip()
        if "(Booted)" in line and "(" in line:
            # Extract first UUID-shaped token in parentheses.
            import re

            m = re.search(r"\(([0-9A-F-]{8,})\)\s*\(Booted\)", line)
            if m:
                booted_udid = m.group(1)
                break
    if not booted_udid:
        return _fail("ios_simulator", "no booted simulator (use `xcrun simctl boot`)")
    ctx.resolved_device = booted_udid
    return _ok("ios_simulator", f"booted UDID {booted_udid}")


def check_ios_app_installed(ctx: DoctorContext) -> CheckResult:
    """App container exists for the resolved app id on booted sim."""
    if ctx.host_name != "macos":
        return _skip("ios_app_installed", "macOS only")
    import os as _os

    app_id = ctx.cfg.app_id or derive_app_id(
        ctx.cfg.project_root, _os.environ.get("APP_VARIANT")
    )
    if not app_id:
        return _skip("ios_app_installed", "no app id resolved")
    try:
        result = _run(
            ["xcrun", "simctl", "get_app_container", "booted", app_id],
            timeout=4.0,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return _fail("ios_app_installed", f"xcrun error: {exc}")
    if result.returncode != 0:
        return _fail(
            "ios_app_installed",
            f"{app_id} not installed on booted sim",
        )
    return _ok("ios_app_installed", f"{app_id} installed")
