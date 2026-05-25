"""`mo logs` — find and print the latest run log without remembering filenames.

Five modes, mutually composable where it makes sense:

* default          — print `maestro-latest.log` in full.
* `--tail N`       — print the last N lines (Python seek; no shelling
                     to `tail`/`Get-Content -Wait`).
* `--flow NAME`    — most recent `runs/maestro-<NAME>-*.log` instead.
* `--follow`       — poll the file for new bytes; bounded by `--for`
                     (default 60 s) AND by the tracked PID's exit,
                     whichever fires first. This is the critical
                     property: `mo logs --follow` MUST be safe to call
                     from a 120 s bash-tool loop. Never blocks forever.
* `--list`         — enumerate every run under `runs/` with metadata.
"""

from __future__ import annotations

import io
import json
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console
from rich.table import Table

from .. import paths, pidfile
from ..config import MoConfig

EXIT_OK = 0
EXIT_NO_LOGS = 1

# Conservative default for --follow; well under the bash-tool 120 s budget
# so a caller looping `mo logs --follow` never hits the outer timeout.
_DEFAULT_FOLLOW_SECONDS = 60.0
_FOLLOW_POLL_INTERVAL = 0.25


@dataclass(frozen=True)
class LogsOptions:
    """CLI-level options for `mo logs`."""

    tail: int | None = None
    flow: str | None = None
    follow: bool = False
    for_seconds: float = _DEFAULT_FOLLOW_SECONDS
    list_runs: bool = False
    json_output: bool = False


@dataclass(frozen=True)
class RunEntry:
    """One row in --list output."""

    path: str
    flow: str
    size_bytes: int
    modified: str  # ISO-8601 UTC


# --- top-level dispatcher ----------------------------------------------
def run_logs(cfg: MoConfig, opts: LogsOptions) -> int:
    """Entry point for `mo logs`."""
    project_root = cfg.project_root

    if opts.list_runs:
        return _do_list(project_root, opts)

    # Pick the file to operate on.
    target = _resolve_target(project_root, opts)
    if target is None:
        return _no_logs(opts, project_root)

    if opts.follow:
        return _do_follow(project_root, target, opts)

    return _do_print(target, opts)


# --- target selection ---------------------------------------------------
def _resolve_target(project_root: Path, opts: LogsOptions) -> Path | None:
    """Return the path of the log file we should read, or None."""
    if opts.flow is not None:
        return _latest_for_flow(project_root, opts.flow)

    # For `--follow`, prefer the PID-recorded log path: on Windows the
    # `maestro-latest.log` alias is typically a *copy* of the run log
    # (no symlink support without admin), so appends to the live log
    # never reach the alias. The PID record points at the real file.
    if opts.follow:
        try:
            record = pidfile.read(paths.pid_file(project_root))
        except Exception:  # noqa: BLE001
            record = None
        if record is not None:
            recorded = Path(record.log)
            if recorded.exists():
                return recorded

    latest = paths.latest_log_link(project_root)
    if latest.exists():
        # Resolve through the symlink (or copy) to the real file so size
        # / mtime checks below see the right inode.
        return latest
    # Fallback: glob runs/.
    runs = paths.runs_dir(project_root)
    if not runs.is_dir():
        return None
    candidates = sorted(runs.glob("maestro-*.log"), key=_mtime, reverse=True)
    return candidates[0] if candidates else None


def _latest_for_flow(project_root: Path, flow: str) -> Path | None:
    """Find newest `runs/maestro-<flow>-*.log`."""
    slug = flow.removesuffix(".yaml")
    runs = paths.runs_dir(project_root)
    if not runs.is_dir():
        return None
    candidates = sorted(
        runs.glob(f"maestro-{slug}-*.log"), key=_mtime, reverse=True
    )
    return candidates[0] if candidates else None


def _mtime(p: Path) -> float:
    try:
        return p.stat().st_mtime
    except OSError:
        return 0.0


# --- print --------------------------------------------------------------
def _do_print(target: Path, opts: LogsOptions) -> int:
    if opts.tail is not None and opts.tail > 0:
        text = _tail_lines(target, opts.tail)
    else:
        text = target.read_text(encoding="utf-8", errors="replace")

    if opts.json_output:
        print(
            json.dumps(
                {
                    "path": str(target),
                    "tail": opts.tail,
                    "content": text,
                },
                indent=2,
                sort_keys=True,
            )
        )
    else:
        # Use sys.stdout directly to avoid rich wrapping log lines.
        import sys

        sys.stdout.write(text)
        if not text.endswith("\n"):
            sys.stdout.write("\n")
    return EXIT_OK


def _tail_lines(path: Path, n: int) -> str:
    """Read the last `n` lines of `path` via reverse-block I/O.

    Bounded memory: reads in 8 KiB chunks from the end of the file.
    Falls back to a full read if the file is small enough that the
    chunked path would be silly.
    """
    if n <= 0:
        return ""
    size = path.stat().st_size
    if size <= 8192:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines(
            keepends=True
        )
        return "".join(lines[-n:])

    chunk_size = 8192
    data = bytearray()
    with path.open("rb") as f:
        f.seek(0, io.SEEK_END)
        pos = f.tell()
        line_count = 0
        while pos > 0 and line_count <= n:
            read_size = min(chunk_size, pos)
            pos -= read_size
            f.seek(pos)
            chunk = f.read(read_size)
            data[:0] = chunk
            line_count = data.count(b"\n")
    text = data.decode("utf-8", errors="replace")
    lines = text.splitlines(keepends=True)
    return "".join(lines[-n:])


# --- follow -------------------------------------------------------------
def _do_follow(project_root: Path, target: Path, opts: LogsOptions) -> int:
    """Tail-follow `target` bounded by --for and the tracked PID lifetime.

    Termination conditions (any of):
      1. `opts.for_seconds` elapsed since invocation.
      2. The tracked PID (from `tmp/mo/maestro.pid`) is no longer alive.
      3. Caller-induced KeyboardInterrupt.
    """
    deadline = time.monotonic() + max(0.0, opts.for_seconds)
    pid_path = paths.pid_file(project_root)

    # Seek to end-of-file so we only print new bytes (classic tail -f).
    # If the file has < tail lines, we don't print the head — caller
    # can do `mo logs --tail N` separately for the prefix.
    #
    # Open in binary mode: text-mode `read()` after hitting EOF can
    # latch the EOF state on some platforms (Windows in particular),
    # so newly-appended bytes never appear. Binary mode + an explicit
    # decode per chunk side-steps that.
    try:
        handle = target.open("rb")
    except FileNotFoundError:
        return _no_logs(opts, project_root)

    import sys

    try:
        handle.seek(0, io.SEEK_END)
        while time.monotonic() < deadline:
            chunk = handle.read()
            if chunk:
                sys.stdout.write(chunk.decode("utf-8", errors="replace"))
                sys.stdout.flush()
            else:
                if _tracked_pid_exited(pid_path):
                    final = handle.read()
                    if final:
                        sys.stdout.write(final.decode("utf-8", errors="replace"))
                        sys.stdout.flush()
                    break
                # On some filesystems Python caches EOF; nudge the
                # file pointer to force a fresh underlying read next time.
                handle.seek(handle.tell())
                time.sleep(_FOLLOW_POLL_INTERVAL)
    except KeyboardInterrupt:
        pass
    finally:
        handle.close()
    return EXIT_OK


def _tracked_pid_exited(pid_path: Path) -> bool:
    """True when the tmp/mo/maestro.pid process is gone (or never existed)."""
    try:
        record = pidfile.read(pid_path)
    except Exception:  # noqa: BLE001 — treat garbled as "no tracked run"
        return True
    if record is None:
        return True
    return not pidfile.is_alive(record)


# --- list ---------------------------------------------------------------
def _do_list(project_root: Path, opts: LogsOptions) -> int:
    runs = paths.runs_dir(project_root)
    if not runs.is_dir():
        return _no_logs(opts, project_root)

    entries: list[RunEntry] = []
    for path in sorted(runs.glob("maestro-*.log"), key=_mtime, reverse=True):
        flow = _flow_from_filename(path.name)
        try:
            stat = path.stat()
        except OSError:
            continue
        mtime_iso = (
            datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            .replace(microsecond=0)
            .isoformat()
        )
        entries.append(
            RunEntry(
                path=str(path),
                flow=flow,
                size_bytes=stat.st_size,
                modified=mtime_iso,
            )
        )

    if not entries:
        return _no_logs(opts, project_root)

    if opts.json_output:
        print(
            json.dumps(
                {"runs": [asdict(e) for e in entries]},
                indent=2,
                sort_keys=True,
            )
        )
    else:
        console = Console()
        table = Table(title="mo logs --list")
        table.add_column("flow")
        table.add_column("modified", no_wrap=True)
        table.add_column("size", justify="right", no_wrap=True)
        table.add_column("path", overflow="fold")
        for e in entries:
            table.add_row(e.flow, e.modified, _format_size(e.size_bytes), e.path)
        console.print(table)
    return EXIT_OK


def _flow_from_filename(name: str) -> str:
    """`maestro-<flow>-<timestamp>.log` -> `<flow>`."""
    # Strip the leading "maestro-" prefix and trailing "-<UTC>.log".
    stem = name[: -len(".log")] if name.endswith(".log") else name
    if stem.startswith("maestro-"):
        stem = stem[len("maestro-") :]
    # The timestamp suffix matches `YYYYMMDDTHHMMSSZ` and is appended
    # after a dash. Splitting from the right is the safe way to recover
    # the flow even when its own name contains dashes.
    parts = stem.rsplit("-", 1)
    if len(parts) == 2 and parts[1].endswith("Z"):
        return parts[0]
    return stem


def _format_size(n: int) -> str:
    if n < 1024:
        return f"{n}B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f}K"
    return f"{n / (1024 * 1024):.1f}M"


# --- shared error path --------------------------------------------------
def _no_logs(opts: LogsOptions, project_root: Path) -> int:
    msg = f"no run logs found under {paths.runs_dir(project_root)}"
    if opts.json_output:
        print(
            json.dumps(
                {"exit_code": EXIT_NO_LOGS, "error": msg},
                indent=2,
                sort_keys=True,
            )
        )
    else:
        Console(stderr=True).print(f"[red]{msg}[/red]")
    return EXIT_NO_LOGS
