"""Helpers for the `tmp/mo/` runtime layout.

All `mo`-managed state lives under `<project_root>/tmp/mo/`:

    tmp/mo/
    ├── maestro.pid          # active run's PID json
    ├── maestro-latest.log   # symlink (or copy) to the newest run log
    ├── doctor-last.json
    ├── reset-last.json
    ├── kill-last.json
    └── runs/
        ├── <flow>-<utc>.log
        └── <flow>-<utc>.err.log

Windows is symlink-unfriendly without admin (Pitfall windows#19),
so `point_latest_log()` falls back to a plain copy when the
symlink syscall fails.
"""

from __future__ import annotations

import shutil
from pathlib import Path


def mo_root(project_root: Path) -> Path:
    """Return `<project_root>/tmp/mo`."""
    return project_root / "tmp" / "mo"


def runs_dir(project_root: Path) -> Path:
    """Return `<project_root>/tmp/mo/runs`."""
    return mo_root(project_root) / "runs"


def pid_file(project_root: Path) -> Path:
    """Return `<project_root>/tmp/mo/maestro.pid`."""
    return mo_root(project_root) / "maestro.pid"


def latest_log_link(project_root: Path) -> Path:
    """Return `<project_root>/tmp/mo/maestro-latest.log`."""
    return mo_root(project_root) / "maestro-latest.log"


def metro_pid_file(project_root: Path) -> Path:
    """Return `<project_root>/tmp/mo/metro.pid` (managed by `mo up`)."""
    return mo_root(project_root) / "metro.pid"


def metro_log_file(project_root: Path) -> Path:
    """Return `<project_root>/tmp/mo/metro.log` (managed by `mo up`)."""
    return mo_root(project_root) / "metro.log"


def build_android_pid_file(project_root: Path) -> Path:
    """Return `<project_root>/tmp/mo/build-android.pid`."""
    return mo_root(project_root) / "build-android.pid"


def build_android_log_file(project_root: Path) -> Path:
    """Return `<project_root>/tmp/mo/build-android.log`."""
    return mo_root(project_root) / "build-android.log"


def doctor_report(project_root: Path) -> Path:
    return mo_root(project_root) / "doctor-last.json"


def reset_report(project_root: Path) -> Path:
    return mo_root(project_root) / "reset-last.json"


def kill_report(project_root: Path) -> Path:
    return mo_root(project_root) / "kill-last.json"


def ensure_layout(project_root: Path) -> None:
    """Create the `tmp/mo/` and `tmp/mo/runs/` directories if missing."""
    runs_dir(project_root).mkdir(parents=True, exist_ok=True)


def point_latest_log(project_root: Path, target: Path) -> Path:
    """Point `maestro-latest.log` at `target`.

    Tries a symlink first; falls back to a copy on Windows where
    creating symlinks usually requires elevation (Pitfall windows#19).
    Returns the path that was written.
    """
    ensure_layout(project_root)
    link = latest_log_link(project_root)
    if link.exists() or link.is_symlink():
        link.unlink()

    try:
        link.symlink_to(target)
    except (OSError, NotImplementedError):
        # Symlink unavailable (Windows without dev-mode / admin).
        # Fall back to a copy so the path still resolves.
        shutil.copy2(target, link)
    return link
