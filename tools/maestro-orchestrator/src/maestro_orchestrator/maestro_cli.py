"""Locate the `maestro` CLI executable across hosts.

Single source of truth so `mo doctor` and `mo run` agree on whether
maestro is installed. The Maestro installer drops `maestro.bat` under
`%USERPROFILE%\\.maestro\\bin\\` on Windows and that location is often
not on PATH; we check it explicitly before giving up.
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def find_maestro_executable() -> str | None:
    """Return absolute path to the maestro CLI, or None if not found."""
    for name in ("maestro", "maestro.bat", "maestro.cmd"):
        found = shutil.which(name)
        if found:
            return found
    if sys.platform.startswith("win"):
        home = Path(os.path.expanduser("~"))
        for candidate in (
            home / ".maestro" / "bin" / "maestro.bat",
            home / ".maestro" / "bin" / "maestro.cmd",
            home / ".maestro" / "bin" / "maestro",
        ):
            if candidate.exists():
                return str(candidate)
    return None
