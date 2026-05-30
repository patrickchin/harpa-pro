"""Detached subprocess spawn — the heart of `mo run`.

Wraps `subprocess.Popen` with the right per-OS flags so the spawned
child outlives the orchestrator's own exit:

* **Windows**: `CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS`. We must
  not inherit the parent's console handles, or closing the orchestrator
  shell will SIGINT the child. Also `close_fds=True` to avoid leaking
  handles into the child.
* **POSIX**: `start_new_session=True`. The child becomes its own
  session leader, surviving the parent.

Stdout and stderr are redirected to `log_path`; the parent never
holds an open writable file handle to it after spawn (the OS keeps
the fd alive on the child). This means `mo logs --follow` can be a
plain reader without locking concerns.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Mapping


def spawn_detached(
    argv: list[str],
    *,
    log_path: Path,
    env: Mapping[str, str] | None = None,
    cwd: Path | None = None,
) -> int:
    """Spawn `argv` detached, redirecting stdout+stderr to `log_path`.

    Returns the spawned child's PID. Does NOT wait. The parent's
    write-fd to `log_path` is closed immediately after fork/spawn so
    only the child holds it.

    `argv` is passed as an explicit list (shell=False). Caller is
    responsible for resolving the executable.
    """
    log_path.parent.mkdir(parents=True, exist_ok=True)
    # Use a fresh handle per spawn; the child inherits it via Popen.
    # We open in 'wb' (binary append-mode would also work) and close
    # in the parent — the OS keeps the fd alive in the child.
    log_fh = log_path.open("wb")
    try:
        popen_kwargs: dict[str, object] = {
            "stdin": subprocess.DEVNULL,
            "stdout": log_fh,
            "stderr": subprocess.STDOUT,
            "close_fds": True,
            "shell": False,
            "cwd": str(cwd) if cwd is not None else None,
        }
        if env is not None:
            popen_kwargs["env"] = dict(env)
        if sys.platform.startswith("win"):
            # On Windows we MUST give the child a (hidden) console.
            # `DETACHED_PROCESS` strips the console entirely, which
            # breaks any child that is actually a `.bat` / `.cmd`
            # wrapper (cmd.exe needs a console to interpret the
            # script). `maestro.bat` and `gradlew.bat` both fall in
            # this category. `CREATE_NO_WINDOW` hides the console
            # but keeps it attached so the wrapper can run normally.
            # `CREATE_NEW_PROCESS_GROUP` still detaches the child
            # from the parent's Ctrl+C signal group so closing the
            # orchestrator shell doesn't kill the long-running flow.
            #
            # CREATE_NEW_PROCESS_GROUP = 0x00000200
            # CREATE_NO_WINDOW         = 0x08000000
            popen_kwargs["creationflags"] = 0x00000200 | 0x08000000
        else:
            popen_kwargs["start_new_session"] = True

        proc = subprocess.Popen(argv, **popen_kwargs)  # noqa: S603
        return proc.pid
    finally:
        # Close our copy of the fd; the child still owns its inherited copy.
        log_fh.close()
