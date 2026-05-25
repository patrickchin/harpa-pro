"""Tests for `mo logs` — print, tail, list, bounded follow."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from maestro_orchestrator import paths, pidfile
from maestro_orchestrator.commands import logs as logs_cmd
from maestro_orchestrator.config import MoConfig


# --- fixtures -----------------------------------------------------------
@pytest.fixture()
def project_root(tmp_path: Path) -> Path:
    (tmp_path / "AGENTS.md").write_text("# stub\n", encoding="utf-8")
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: []\n", encoding="utf-8")
    paths.ensure_layout(tmp_path)
    return tmp_path


def _cfg(project_root: Path) -> MoConfig:
    return MoConfig(project_root=project_root, app_id=None, device=None)


def _make_log(
    project_root: Path,
    flow: str,
    *,
    content: str = "line\n",
    ts: str = "20260526T120000Z",
) -> Path:
    """Write a run log under runs/ and return its path."""
    log = paths.runs_dir(project_root) / f"maestro-{flow}-{ts}.log"
    log.write_text(content, encoding="utf-8")
    return log


# --- empty / missing ----------------------------------------------------
def test_logs_no_runs_returns_no_logs(project_root: Path) -> None:
    code = logs_cmd.run_logs(_cfg(project_root), logs_cmd.LogsOptions())
    assert code == logs_cmd.EXIT_NO_LOGS


def test_logs_list_empty_returns_no_logs(project_root: Path) -> None:
    code = logs_cmd.run_logs(
        _cfg(project_root), logs_cmd.LogsOptions(list_runs=True)
    )
    assert code == logs_cmd.EXIT_NO_LOGS


# --- default print ------------------------------------------------------
def test_logs_default_prints_latest(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    log = _make_log(project_root, "regression-journey", content="hello world\n")
    paths.point_latest_log(project_root, log)

    code = logs_cmd.run_logs(_cfg(project_root), logs_cmd.LogsOptions())
    assert code == logs_cmd.EXIT_OK
    out = capsys.readouterr().out
    assert "hello world" in out


def test_logs_default_falls_back_to_runs_glob_when_no_symlink(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # No maestro-latest.log written.
    _make_log(project_root, "x", content="content-of-x\n")
    code = logs_cmd.run_logs(_cfg(project_root), logs_cmd.LogsOptions())
    assert code == logs_cmd.EXIT_OK
    assert "content-of-x" in capsys.readouterr().out


# --- --tail -------------------------------------------------------------
def test_logs_tail_returns_last_n_lines(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    content = "".join(f"line-{i}\n" for i in range(50))
    log = _make_log(project_root, "x", content=content)
    paths.point_latest_log(project_root, log)

    code = logs_cmd.run_logs(_cfg(project_root), logs_cmd.LogsOptions(tail=5))
    assert code == logs_cmd.EXIT_OK
    out = capsys.readouterr().out
    assert "line-49" in out
    assert "line-45" in out
    assert "line-44" not in out


def test_logs_tail_on_large_file_uses_reverse_chunks(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # Build a > 8 KiB log to exercise the chunked reverse-read path.
    content = "".join(f"row-{i:05d} {'x' * 100}\n" for i in range(500))
    log = _make_log(project_root, "big", content=content)
    paths.point_latest_log(project_root, log)

    code = logs_cmd.run_logs(_cfg(project_root), logs_cmd.LogsOptions(tail=3))
    assert code == logs_cmd.EXIT_OK
    out = capsys.readouterr().out
    assert "row-00499" in out
    assert "row-00497" in out
    assert "row-00400" not in out


# --- --flow -------------------------------------------------------------
def test_logs_flow_picks_most_recent_for_named_flow(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    older = _make_log(project_root, "alpha", content="OLDER\n", ts="20260101T000000Z")
    newer = _make_log(project_root, "alpha", content="NEWER\n", ts="20260601T000000Z")
    # Touch mtimes so older sorts older.
    older.touch()  # now
    time.sleep(0.01)
    newer.touch()  # newer

    code = logs_cmd.run_logs(
        _cfg(project_root), logs_cmd.LogsOptions(flow="alpha")
    )
    assert code == logs_cmd.EXIT_OK
    out = capsys.readouterr().out
    assert "NEWER" in out
    assert "OLDER" not in out


def test_logs_flow_strips_yaml_suffix(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _make_log(project_root, "beta", content="BETA\n")
    code = logs_cmd.run_logs(
        _cfg(project_root), logs_cmd.LogsOptions(flow="beta.yaml")
    )
    assert code == logs_cmd.EXIT_OK
    assert "BETA" in capsys.readouterr().out


def test_logs_flow_no_match_returns_no_logs(project_root: Path) -> None:
    _make_log(project_root, "alpha", content="A\n")
    code = logs_cmd.run_logs(
        _cfg(project_root), logs_cmd.LogsOptions(flow="missing")
    )
    assert code == logs_cmd.EXIT_NO_LOGS


# --- --list -------------------------------------------------------------
def test_logs_list_enumerates_runs(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _make_log(project_root, "alpha", content="a")
    _make_log(project_root, "beta", content="bb")
    code = logs_cmd.run_logs(
        _cfg(project_root), logs_cmd.LogsOptions(list_runs=True)
    )
    assert code == logs_cmd.EXIT_OK
    out = capsys.readouterr().out
    assert "alpha" in out
    assert "beta" in out


def test_logs_list_json_schema(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _make_log(project_root, "alpha", content="a")
    code = logs_cmd.run_logs(
        _cfg(project_root),
        logs_cmd.LogsOptions(list_runs=True, json_output=True),
    )
    assert code == logs_cmd.EXIT_OK
    payload = json.loads(capsys.readouterr().out)
    assert "runs" in payload
    assert len(payload["runs"]) == 1
    entry = payload["runs"][0]
    assert set(entry.keys()) == {"path", "flow", "size_bytes", "modified"}
    assert entry["flow"] == "alpha"


# --- --follow (bounded) -------------------------------------------------
def test_logs_follow_for_zero_returns_within_budget(project_root: Path) -> None:
    log = _make_log(project_root, "alpha", content="hello\n")
    paths.point_latest_log(project_root, log)

    start = time.monotonic()
    code = logs_cmd.run_logs(
        _cfg(project_root),
        logs_cmd.LogsOptions(follow=True, for_seconds=0.0),
    )
    elapsed = time.monotonic() - start
    assert code == logs_cmd.EXIT_OK
    # Must return well inside the bash-tool budget.
    assert elapsed < 1.0, f"follow took {elapsed:.2f}s with --for 0"


def test_logs_follow_short_window_returns_within_budget(
    project_root: Path,
) -> None:
    log = _make_log(project_root, "alpha", content="hello\n")
    paths.point_latest_log(project_root, log)

    start = time.monotonic()
    code = logs_cmd.run_logs(
        _cfg(project_root),
        logs_cmd.LogsOptions(follow=True, for_seconds=0.5),
    )
    elapsed = time.monotonic() - start
    assert code == logs_cmd.EXIT_OK
    # 0.5s budget + poll interval slack.
    assert elapsed < 2.0


def test_logs_follow_exits_when_tracked_pid_gone(project_root: Path) -> None:
    log = _make_log(project_root, "alpha", content="hello\n")
    paths.point_latest_log(project_root, log)
    # PID file points at a definitely-dead PID -> follow should bail fast.
    pidfile.write(
        paths.pid_file(project_root),
        pidfile.PidRecord(
            pid=999999,
            create_time=1.0,
            flow="ghost.yaml",
            log=str(log),
            started_at="2026-01-01T00:00:00+00:00",
            device=None,
        ),
    )

    start = time.monotonic()
    code = logs_cmd.run_logs(
        _cfg(project_root),
        logs_cmd.LogsOptions(follow=True, for_seconds=10.0),
    )
    elapsed = time.monotonic() - start
    assert code == logs_cmd.EXIT_OK
    # Should exit because PID is dead, well before the 10s budget.
    assert elapsed < 3.0, f"follow took {elapsed:.2f}s; should exit on dead PID"


def test_logs_follow_missing_target_returns_no_logs(project_root: Path) -> None:
    code = logs_cmd.run_logs(
        _cfg(project_root),
        logs_cmd.LogsOptions(follow=True, for_seconds=0.0),
    )
    assert code == logs_cmd.EXIT_NO_LOGS


# --- json output --------------------------------------------------------
def test_logs_default_json_output(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    log = _make_log(project_root, "alpha", content="hello\n")
    paths.point_latest_log(project_root, log)
    code = logs_cmd.run_logs(
        _cfg(project_root), logs_cmd.LogsOptions(json_output=True)
    )
    assert code == logs_cmd.EXIT_OK
    payload = json.loads(capsys.readouterr().out)
    assert set(payload.keys()) == {"path", "tail", "content"}
    assert payload["content"] == "hello\n"


# --- flow-from-filename parsing ----------------------------------------
def test_flow_from_filename_simple() -> None:
    assert (
        logs_cmd._flow_from_filename("maestro-alpha-20260526T120000Z.log")
        == "alpha"
    )


def test_flow_from_filename_with_dashes() -> None:
    assert (
        logs_cmd._flow_from_filename(
            "maestro-regression-journey-20260526T120000Z.log"
        )
        == "regression-journey"
    )


def test_flow_from_filename_without_timestamp_returns_stem() -> None:
    assert logs_cmd._flow_from_filename("weird.log") == "weird"


def test_format_size_bytes_kib_mib() -> None:
    assert logs_cmd._format_size(500) == "500B"
    assert logs_cmd._format_size(2048).endswith("K")
    assert logs_cmd._format_size(5 * 1024 * 1024).endswith("M")


def test_logs_follow_streams_new_bytes(
    project_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # Write the target file, spawn a real short-lived process so the
    # follow loop has a live PID to track, then append more bytes mid-run.
    log = _make_log(project_root, "alpha", content="head\n")
    paths.point_latest_log(project_root, log)

    import subprocess
    import sys
    import threading

    import psutil

    proc = subprocess.Popen(  # noqa: S603
        [sys.executable, "-c", "import time; time.sleep(2.0)"],
        shell=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(0.1)
        ct = psutil.Process(proc.pid).create_time()
        pidfile.write(
            paths.pid_file(project_root),
            pidfile.PidRecord(
                pid=proc.pid,
                create_time=ct,
                flow="alpha.yaml",
                log=str(log),
                started_at=pidfile.now_iso(),
                device=None,
            ),
        )

        def appender() -> None:
            time.sleep(0.2)
            with log.open("a", encoding="utf-8") as f:
                f.write("appended-chunk\n")
                f.flush()

        t = threading.Thread(target=appender, daemon=True)
        t.start()
        code = logs_cmd.run_logs(
            _cfg(project_root),
            logs_cmd.LogsOptions(follow=True, for_seconds=1.0),
        )
        t.join(timeout=2.0)
        assert code == logs_cmd.EXIT_OK
        out = capsys.readouterr().out
        assert "appended-chunk" in out, f"output was: {out!r}"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


def test_logs_follow_garbled_pid_treated_as_exited(project_root: Path) -> None:
    log = _make_log(project_root, "alpha", content="hello\n")
    paths.point_latest_log(project_root, log)
    paths.pid_file(project_root).write_text("{not json", encoding="utf-8")

    start = time.monotonic()
    code = logs_cmd.run_logs(
        _cfg(project_root),
        logs_cmd.LogsOptions(follow=True, for_seconds=10.0),
    )
    elapsed = time.monotonic() - start
    assert code == logs_cmd.EXIT_OK
    assert elapsed < 3.0
