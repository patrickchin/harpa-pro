"""Host platform detection for mo.

Single source of truth for "what OS are we on?" — used by device
discovery, process spawning flags, and doctor checks. Cross-platform
strategy is documented in `docs/v4/design-maestro-orchestrator.md` §5.
"""

from __future__ import annotations

import sys
from typing import Literal

HostName = Literal["windows", "macos", "linux"]


def detect_host() -> HostName:
    """Return the canonical host name for the current process.

    Maps `sys.platform` values to the three names the orchestrator
    cares about. Anything else raises — mo refuses to guess.
    """
    plat = sys.platform
    if plat.startswith("win") or plat == "cygwin":
        return "windows"
    if plat == "darwin":
        return "macos"
    if plat.startswith("linux"):
        return "linux"
    raise RuntimeError(f"Unsupported host platform: {plat!r}")


def is_windows() -> bool:
    return detect_host() == "windows"


def is_macos() -> bool:
    return detect_host() == "macos"


def is_linux() -> bool:
    return detect_host() == "linux"
