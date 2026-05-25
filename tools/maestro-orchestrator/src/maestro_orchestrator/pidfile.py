"""PID-file read/write with recycling-safe liveness checks.

A `mo run` invocation persists a JSON record under `tmp/mo/maestro.pid`
so later commands (`mo kill`, `mo logs --follow`) can find the
detached child process.

The record carries the kernel-assigned PID *and* the process's
`create_time()` — a check on PID alone is unsafe because PIDs are
recycled (Pitfall: long-running hosts run out of low PIDs and
recycle them within hours; checking only `pid_exists` is how you
end up killing an unrelated user shell).

Writes are atomic: write to a sibling `.tmp` file, then `os.replace`.
This is durable across both POSIX and Windows.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psutil
from pydantic import BaseModel, ConfigDict, Field

# Time tolerance (seconds) when comparing `psutil.Process.create_time()`
# against the value we persisted. We compare floats with a small slack
# because psutil sometimes rounds to 10ms on Windows.
_CREATE_TIME_TOLERANCE_SEC = 1.0


class PidRecord(BaseModel):
    """Persisted shape of `tmp/mo/maestro.pid`.

    Validated via pydantic on read so a hand-edited or truncated file
    can't crash callers — they get a clean ValidationError instead.
    """

    model_config = ConfigDict(frozen=True)

    pid: int = Field(..., gt=0)
    create_time: float = Field(..., description="psutil.Process.create_time() at spawn.")
    flow: str = Field(..., min_length=1)
    log: str = Field(..., min_length=1, description="Absolute path to the run's log file.")
    started_at: str = Field(..., min_length=1, description="ISO-8601 UTC timestamp.")
    device: str | None = Field(default=None)


def now_iso() -> str:
    """UTC ISO-8601 with second precision — used in PID records + log slugs."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read(path: Path) -> PidRecord | None:
    """Read+validate the PID file at `path`. Returns None if missing.

    Raises `pydantic.ValidationError` if the file exists but is malformed
    — callers should treat that as a hard error and refuse to proceed
    rather than silently clobbering an unknown state.
    """
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8")
    data: dict[str, Any] = json.loads(raw)
    return PidRecord.model_validate(data)


def write(path: Path, record: PidRecord) -> None:
    """Atomically persist `record` to `path` (write-tmp + rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(record.model_dump(), indent=2, sort_keys=True)
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


def remove(path: Path) -> bool:
    """Delete the PID file if present. Returns True if a file was removed."""
    try:
        path.unlink()
        return True
    except FileNotFoundError:
        return False


def is_alive(record: PidRecord) -> bool:
    """True iff `record.pid` is alive AND its create_time matches.

    PID-recycling-safe: a process with the right number but the wrong
    spawn time is treated as dead (someone else is using that PID).
    """
    if not psutil.pid_exists(record.pid):
        return False
    try:
        proc = psutil.Process(record.pid)
        actual = proc.create_time()
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return False
    return abs(actual - record.create_time) <= _CREATE_TIME_TOLERANCE_SEC
