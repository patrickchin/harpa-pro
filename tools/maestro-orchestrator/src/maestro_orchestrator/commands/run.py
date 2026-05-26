"""`mo run <flow>` — spawn `maestro test` detached, log + track via PID file.

This is the cornerstone command: the opencode bash tool has a ~120s
hard timeout, and a Maestro flow can run for many minutes. `mo run`
fires the child off in a brand-new process group, writes a PID
record + log, and returns in well under a second so the orchestrator
itself never trips that timeout.

Flow resolution (in order):

1. Absolute / existing relative path -> use as-is.
2. Bare name -> look it up under `<project_root>/.maestro/`, including
   `<flow>` and `<flow>.yaml` variants, recursive.
3. Nothing matched -> exit non-zero with a clear "flow not found".

Refusal: if `tmp/mo/maestro.pid` exists and references a live process
whose `create_time()` matches, `mo run` exits 2. `--force` overrides
(useful when a previous run died without cleanup and you've already
sanity-checked the device by hand).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

import psutil
from rich.console import Console

from .. import paths, pidfile, spawn
from ..config import MoConfig

# Exit codes (documented above).
EXIT_OK = 0
EXIT_FLOW_NOT_FOUND = 1
EXIT_ALREADY_RUNNING = 2
EXIT_SPAWN_FAILED = 3
EXIT_MAESTRO_NOT_FOUND = 4


@dataclass(frozen=True)
class RunOptions:
    """CLI-level options for `mo run`."""

    flow: str
    device: str | None = None
    force: bool = False
    json_output: bool = False


# --- maestro executable resolution --------------------------------------
from ..maestro_cli import find_maestro_executable as _find_maestro_executable  # noqa: E402


# --- flow resolution ----------------------------------------------------
def _resolve_flow(project_root: Path, flow: str) -> Path | None:
    """Locate the flow file. Returns absolute path or None."""
    p = Path(flow)
    # Absolute path.
    if p.is_absolute() and p.exists():
        return p.resolve()
    # Relative path from cwd.
    cwd_rel = (Path.cwd() / p).resolve()
    if cwd_rel.exists() and cwd_rel.is_file():
        return cwd_rel
    # Relative from project root.
    pr_rel = (project_root / p).resolve()
    if pr_rel.exists() and pr_rel.is_file():
        return pr_rel
    # Bare name search under .maestro/ (recursive).
    maestro_dir = project_root / ".maestro"
    if maestro_dir.is_dir():
        candidates = [flow, flow if flow.endswith(".yaml") else f"{flow}.yaml"]
        for candidate in candidates:
            for hit in maestro_dir.rglob(candidate):
                if hit.is_file():
                    return hit.resolve()
    return None


# --- slug / timestamp ---------------------------------------------------
_SLUG_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _flow_slug(flow_path: Path) -> str:
    """Filesystem-safe identifier for the log filename."""
    stem = flow_path.stem  # drops .yaml
    cleaned = _SLUG_RE.sub("-", stem).strip("-")
    return cleaned or "flow"


def _timestamp_slug() -> str:
    """UTC stamp suitable for a filename: lexicographically ordered."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


# --- the command --------------------------------------------------------
def run_run(cfg: MoConfig, opts: RunOptions) -> int:
    """Entry point for `mo run` — returns process exit code."""
    console = Console()
    project_root = cfg.project_root

    # 1. Resolve flow.
    resolved = _resolve_flow(project_root, opts.flow)
    if resolved is None:
        return _emit_error(
            console,
            opts,
            EXIT_FLOW_NOT_FOUND,
            f"flow not found: {opts.flow!r} "
            f"(searched cwd, project root, and {project_root / '.maestro'})",
        )

    # 2. Refuse if a prior run is live (unless --force).
    pid_path = paths.pid_file(project_root)
    existing = _read_existing_pid(pid_path)
    if existing is not None and pidfile.is_alive(existing) and not opts.force:
        return _emit_error(
            console,
            opts,
            EXIT_ALREADY_RUNNING,
            f"a run is already in progress (pid={existing.pid} flow={existing.flow!r}); "
            "run `mo kill` first, or pass --force",
        )

    # 3. Locate maestro.
    maestro_exe = _find_maestro_executable()
    if maestro_exe is None:
        return _emit_error(
            console,
            opts,
            EXIT_MAESTRO_NOT_FOUND,
            "could not locate the `maestro` CLI on PATH or in ~/.maestro/bin",
        )

    # 4. Compute paths + ensure layout.
    paths.ensure_layout(project_root)
    slug = _flow_slug(resolved)
    log_path = paths.runs_dir(project_root) / f"maestro-{slug}-{_timestamp_slug()}.log"

    # 5. Build env (pass through caller's env; surface MAESTRO_APP_ID).
    env = dict(os.environ)
    if cfg.app_id:
        env.setdefault("MAESTRO_APP_ID", cfg.app_id)
    if opts.device:
        env["MAESTRO_DEVICE"] = opts.device
    elif cfg.device:
        env.setdefault("MAESTRO_DEVICE", cfg.device)

    # 6. Spawn detached.
    #
    #    Maestro substitutes `${VAR}` placeholders in flow YAMLs only
    #    from values passed via `--env KEY=VALUE`, NOT from the spawned
    #    process environment. Every flow under `.maestro/` declares
    #    `appId: ${MAESTRO_APP_ID}`, so we must forward `cfg.app_id`
    #    through `--env` or Maestro tries to launch the literal app id
    #    `undefined`. The env var on the child process is still set
    #    above as a courtesy, but `--env` is what Maestro actually
    #    reads.
    argv = [maestro_exe, "test"]
    if cfg.app_id:
        argv += ["--env", f"MAESTRO_APP_ID={cfg.app_id}"]
    argv += [str(resolved)]
    try:
        pid = spawn.spawn_detached(
            argv,
            log_path=log_path,
            env=env,
            cwd=project_root,
        )
    except OSError as exc:
        return _emit_error(
            console,
            opts,
            EXIT_SPAWN_FAILED,
            f"failed to spawn maestro: {exc}",
        )

    # 7. Capture create_time for recycle-safe PID tracking. The child
    #    has just spawned; psutil should see it. Tolerate a transient
    #    NoSuchProcess (child crashed instantly) but treat it as failure
    #    because we have no honest PID record to write.
    try:
        create_time = psutil.Process(pid).create_time()
    except psutil.NoSuchProcess:
        return _emit_error(
            console,
            opts,
            EXIT_SPAWN_FAILED,
            f"child pid {pid} disappeared before we could record it",
        )

    # 8. Write PID record + point latest-log alias.
    record = pidfile.PidRecord(
        pid=pid,
        create_time=create_time,
        flow=str(resolved),
        log=str(log_path),
        started_at=pidfile.now_iso(),
        device=opts.device or cfg.device,
    )
    pidfile.write(pid_path, record)
    paths.point_latest_log(project_root, log_path)

    # 9. Tell the user.
    rel_log = _relative_to_root(log_path, project_root)
    if opts.json_output:
        print(
            json.dumps(
                {
                    "exit_code": EXIT_OK,
                    "pid": pid,
                    "flow": str(resolved),
                    "log": str(log_path),
                    "started_at": record.started_at,
                    "device": record.device,
                },
                indent=2,
                sort_keys=True,
            )
        )
    else:
        console.print(
            f"started maestro {opts.flow} as pid {pid}; log: {rel_log}"
        )
    return EXIT_OK


# --- helpers ------------------------------------------------------------
def _read_existing_pid(pid_path: Path) -> pidfile.PidRecord | None:
    """Read+validate the PID file; swallow malformed and treat as absent.

    We swallow ValidationError specifically because a stale or truncated
    PID file from an earlier crash shouldn't prevent the next run; it's
    safe to clobber.
    """
    try:
        return pidfile.read(pid_path)
    except Exception:  # noqa: BLE001 — defensive; see docstring
        return None


def _relative_to_root(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path)


def _emit_error(
    console: Console,
    opts: RunOptions,
    exit_code: int,
    message: str,
) -> int:
    if opts.json_output:
        print(
            json.dumps(
                {"exit_code": exit_code, "error": message},
                indent=2,
                sort_keys=True,
            )
        )
    else:
        console.print(f"[red]error:[/red] {message}", style=None)
    return exit_code
