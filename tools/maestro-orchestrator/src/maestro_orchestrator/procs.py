"""Process discovery + termination via psutil.

Used by `mo doctor` to spot orphaned `java -jar maestro.jar` and
`maestro-driver-ios` processes from past runs (Pitfalls
windows#1, mac/general), and by `mo kill` to actually clean them up.
"""

from __future__ import annotations

import psutil


def find_processes(
    cmdline_substr: str,
    *,
    min_age_seconds: float = 0.0,
) -> list[psutil.Process]:
    """Return live processes whose name or cmdline contains `cmdline_substr`.

    `min_age_seconds` filters out processes younger than that — used by
    doctor to avoid flagging the currently-spawning run as an "orphan".
    Iteration-time errors (NoSuchProcess, AccessDenied) are swallowed
    per-process so a single dying PID can't crash the scan.
    """
    needle = cmdline_substr
    matches: list[psutil.Process] = []
    now = _now()
    for proc in psutil.process_iter(attrs=["pid", "name", "cmdline"]):
        try:
            name = proc.name() or ""
            cmd = proc.cmdline() or []
            haystack = " ".join([name, *cmd])
            if needle not in haystack:
                continue
            if min_age_seconds > 0:
                age = now - proc.create_time()
                if age < min_age_seconds:
                    continue
            matches.append(proc)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return matches


def kill_processes(
    procs: list[psutil.Process],
    *,
    grace_seconds: float = 2.0,
) -> list[int]:
    """terminate() each proc; escalate to kill() if still alive after grace.

    Returns the PIDs that were touched. PIDs that were already gone
    (NoSuchProcess at terminate-time) are skipped silently.
    """
    touched: list[int] = []
    for proc in procs:
        pid = proc.pid
        try:
            proc.terminate()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        touched.append(pid)
        try:
            proc.wait(timeout=grace_seconds)
        except psutil.TimeoutExpired:
            try:
                proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return touched


def _now() -> float:
    import time

    return time.time()
