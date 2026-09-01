"""`mo reset` — single source of truth for between-runs reset.

Orchestrates the four-step ritual from Pitfall windows#15:

    1. docker pre-check (don't truncate if pg isn't up)
    2. optional device pre-check (only when --device is given)
    3. DB truncate via `docker exec -i harpa-pro-pg psql ...`
    4. App-data clear (Android: `adb shell pm clear`; iOS: `simctl uninstall`)
    5. adb reverse tcp:8081 + tcp:8787 + tcp:8790 + tcp:9000
       (Pitfall windows#20; iOS skipped)

Each step is independently skippable via `--skip-*` for debugging.
Output uses the same `rich` style as `mo doctor` so the surface feels
uniform.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass, field
from typing import Literal

from rich.console import Console

from .. import checks, db, device, host
from ..config import MoConfig
from ..report_renderer import emit_step_report

Status = Literal["ok", "fail", "skip"]

# Generous timeout — a populated DB takes a few seconds to truncate.
_DB_TIMEOUT_SECONDS = 15.0

@dataclass(frozen=True)
class ResetOptions:
    """CLI-level options for `mo reset`."""

    device: str | None = None
    skip_db: bool = False
    skip_app: bool = False
    skip_reverse: bool = False
    # TODO(design Q5): wire `--seed legacy` to re-insert the Alice/Bob
    # seed payload from `scripts/maestro/reset-db.sh`. For now we accept
    # the flag but fail with a helpful message so callers can plan.
    seed: str | None = None
    json_output: bool = False


@dataclass(frozen=True)
class StepOutcome:
    """Internal result for a single reset step before serialisation."""

    ok: bool
    detail: str
    skipped: bool = False


@dataclass(frozen=True)
class StepReport:
    """Final, renderable record of a step's outcome."""

    name: str
    status: Status
    detail: str


# --- precheck wrappers --------------------------------------------------
def _docker_precheck(cfg: MoConfig) -> checks.CheckResult:
    """Reuse `mo doctor`'s docker-stack check verbatim."""
    ctx = checks.DoctorContext(
        cfg=cfg, host_name=host.detect_host(), device=None, fix=False
    )
    return checks.check_docker_stack(ctx)


def _device_precheck(cfg: MoConfig, device_id: str) -> checks.CheckResult:
    """Confirm the requested device is attached (Android only — iOS
    discovery happens implicitly via `xcrun simctl booted`)."""
    if host.detect_host() == "macos":
        # iOS: nothing to verify here; clear_app_data uses `booted`.
        return checks.CheckResult(
            name="device", status="ok", detail=f"requested={device_id} (iOS)"
        )
    ctx = checks.DoctorContext(
        cfg=cfg, host_name=host.detect_host(), device=device_id, fix=False
    )
    return checks.check_adb_device(ctx)


# --- DB step ------------------------------------------------------------
def _run_db_truncate() -> StepOutcome:
    """Stream the canonical TRUNCATE SQL into `docker exec ... psql`."""
    argv = db.docker_exec_argv(db.truncate_sql())
    try:
        result = subprocess.run(  # noqa: S603 — argv explicit, shell=False
            argv,
            shell=False,
            input=db.truncate_sql(),
            capture_output=True,
            text=True,
            timeout=_DB_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError:
        return StepOutcome(ok=False, detail="`docker` not on PATH")
    except subprocess.TimeoutExpired:
        return StepOutcome(
            ok=False,
            detail=f"`docker exec psql` timed out after {_DB_TIMEOUT_SECONDS}s",
        )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[:300]
        return StepOutcome(
            ok=False,
            detail=f"psql exited {result.returncode}: {detail}",
        )
    return StepOutcome(ok=True, detail=f"truncated db={db.PG_DATABASE}")


# --- step runners -------------------------------------------------------
def _step_docker(cfg: MoConfig) -> StepReport:
    res = _docker_precheck(cfg)
    if res.status == "ok":
        return StepReport(name="docker", status="ok", detail=res.detail)
    return StepReport(name="docker", status="fail", detail=res.detail)


def _step_device(cfg: MoConfig, device_id: str) -> StepReport:
    res = _device_precheck(cfg, device_id)
    if res.status == "ok":
        return StepReport(name="device", status="ok", detail=res.detail)
    return StepReport(name="device", status="fail", detail=res.detail)


def _step_db(opts: ResetOptions, docker_ok: bool) -> StepReport:
    if opts.skip_db:
        return StepReport(name="db", status="skip", detail="--skip-db")
    if not docker_ok:
        return StepReport(
            name="db", status="skip", detail="docker not up; refusing to truncate"
        )
    outcome = _run_db_truncate()
    return StepReport(
        name="db",
        status="ok" if outcome.ok else "fail",
        detail=outcome.detail,
    )


def _step_app(cfg: MoConfig, opts: ResetOptions) -> StepReport:
    if opts.skip_app:
        return StepReport(name="app", status="skip", detail="--skip-app")
    # Mirror doctor's resolution: prefer explicit MAESTRO_APP_ID, fall
    # back to deriving from APP_VARIANT + apps/mobile/app.config.ts.
    import os as _os

    app_id = cfg.app_id or checks.derive_app_id(
        cfg.project_root, _os.environ.get("APP_VARIANT")
    )
    if not app_id:
        return StepReport(
            name="app",
            status="fail",
            detail="no app_id configured (set MAESTRO_APP_ID)",
        )
    res = device.clear_app_data(
        host_name=host.detect_host(),
        app_id=app_id,
        device_id=opts.device or cfg.device,
    )
    return StepReport(
        name="app",
        status="ok" if res.ok else "fail",
        detail=res.detail,
    )


def _step_reverse(cfg: MoConfig, opts: ResetOptions) -> StepReport:
    if opts.skip_reverse:
        return StepReport(name="reverse", status="skip", detail="--skip-reverse")
    res = device.adb_reverse_ports(
        host_name=host.detect_host(),
        device_id=opts.device or cfg.device,
    )
    if res.skipped:
        return StepReport(name="reverse", status="skip", detail=res.detail)
    return StepReport(
        name="reverse",
        status="ok" if res.ok else "fail",
        detail=res.detail,
    )


# --- seed (Q5: not implemented yet) ------------------------------------
def _seed_step(opts: ResetOptions) -> StepReport | None:
    """If `--seed` is set, return a FAIL stub. Otherwise None."""
    if opts.seed is None:
        return None
    if opts.seed == "legacy":
        return StepReport(
            name="seed",
            status="fail",
            detail=(
                "--seed legacy not implemented (design Q5). Until wired, "
                "use scripts/maestro/reset-db.sh for legacy seed flows."
            ),
        )
    return StepReport(
        name="seed",
        status="fail",
        detail=f"unknown --seed value {opts.seed!r}; expected 'legacy'",
    )


# --- top-level orchestration -------------------------------------------
def run_reset(cfg: MoConfig, opts: ResetOptions) -> int:
    """Run every applicable step; return process exit code.

    Exit code rules:
      0  — every non-skipped step succeeded.
      1  — at least one non-skipped step failed.
    """
    reports: list[StepReport] = []

    # Step 1: docker precheck. Always runs (even if --skip-db, because
    # the operator usually wants to know if the stack is down).
    docker_step = _step_docker(cfg)
    reports.append(docker_step)
    docker_ok = docker_step.status == "ok"

    # Step 1b: device precheck (only when --device was specified).
    if opts.device:
        device_step = _step_device(cfg, opts.device)
        reports.append(device_step)
        device_ok = device_step.status == "ok"
    else:
        device_ok = True

    # Step 2: DB truncate.
    reports.append(_step_db(opts, docker_ok=docker_ok))

    # Step 3: app-data clear. Skipped automatically if device precheck failed.
    if device_ok:
        reports.append(_step_app(cfg, opts))
    else:
        reports.append(
            StepReport(name="app", status="skip", detail="device precheck failed")
        )

    # Step 4: adb reverse.
    if device_ok:
        reports.append(_step_reverse(cfg, opts))
    else:
        reports.append(
            StepReport(name="reverse", status="skip", detail="device precheck failed")
        )

    # Optional seed step.
    seed = _seed_step(opts)
    if seed is not None:
        reports.append(seed)

    exit_code = 0 if all(r.status != "fail" for r in reports) else 1

    if opts.json_output:
        _emit_json(reports, cfg, opts, exit_code)
    else:
        _emit_human(reports, cfg, exit_code)
    return exit_code


# --- output -------------------------------------------------------------
def _emit_json(
    reports: list[StepReport],
    cfg: MoConfig,
    opts: ResetOptions,
    exit_code: int,
) -> None:
    payload = {
        "host": host.detect_host(),
        "project_root": str(cfg.project_root),
        "app_id": cfg.app_id,
        "device": opts.device or cfg.device,
        "skip": {
            "db": opts.skip_db,
            "app": opts.skip_app,
            "reverse": opts.skip_reverse,
        },
        "seed": opts.seed,
        "exit_code": exit_code,
        "steps": [asdict(r) for r in reports],
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


def _emit_human(
    reports: list[StepReport],
    cfg: MoConfig,
    exit_code: int,
    *,
    console: Console | None = None,
) -> None:
    console = console or Console()
    emit_step_report(
        console=console,
        title=f"mo reset — host: {host.detect_host()}",
        steps=reports,
        success_message="reset: all steps completed",
        failure_message=lambda _code, rows: (
            "reset: "
            f"{len([row.name for row in rows if row.status == 'fail'])} failing step(s): "
            f"{[row.name for row in rows if row.status == 'fail']}"
        ),
        exit_code=exit_code,
        failure_to_stderr_plain=True,
    )
