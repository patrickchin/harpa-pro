"""Tests for the tmp/mo/ layout helpers."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from maestro_orchestrator import paths


def test_mo_root_under_tmp(tmp_path: Path) -> None:
    assert paths.mo_root(tmp_path) == tmp_path / "tmp" / "mo"


def test_named_files_are_under_mo_root(tmp_path: Path) -> None:
    root = paths.mo_root(tmp_path)
    assert paths.pid_file(tmp_path) == root / "maestro.pid"
    assert paths.latest_log_link(tmp_path) == root / "maestro-latest.log"
    assert paths.runs_dir(tmp_path) == root / "runs"
    assert paths.doctor_report(tmp_path) == root / "doctor-last.json"
    assert paths.reset_report(tmp_path) == root / "reset-last.json"
    assert paths.kill_report(tmp_path) == root / "kill-last.json"


def test_ensure_layout_creates_runs_dir(tmp_path: Path) -> None:
    assert not paths.runs_dir(tmp_path).exists()
    paths.ensure_layout(tmp_path)
    assert paths.runs_dir(tmp_path).is_dir()
    # Idempotent.
    paths.ensure_layout(tmp_path)
    assert paths.runs_dir(tmp_path).is_dir()


def test_point_latest_log_creates_link_or_copy(tmp_path: Path) -> None:
    paths.ensure_layout(tmp_path)
    target = paths.runs_dir(tmp_path) / "run-abc.log"
    target.write_text("hello\n", encoding="utf-8")

    link = paths.point_latest_log(tmp_path, target)

    assert link == paths.latest_log_link(tmp_path)
    assert link.exists()
    assert link.read_text(encoding="utf-8") == "hello\n"


def test_point_latest_log_replaces_existing(tmp_path: Path) -> None:
    paths.ensure_layout(tmp_path)
    first = paths.runs_dir(tmp_path) / "first.log"
    first.write_text("one\n", encoding="utf-8")
    second = paths.runs_dir(tmp_path) / "second.log"
    second.write_text("two\n", encoding="utf-8")

    paths.point_latest_log(tmp_path, first)
    paths.point_latest_log(tmp_path, second)

    assert paths.latest_log_link(tmp_path).read_text(encoding="utf-8") == "two\n"


def test_point_latest_log_falls_back_to_copy_when_symlink_unavailable(
    tmp_path: Path,
) -> None:
    paths.ensure_layout(tmp_path)
    target = paths.runs_dir(tmp_path) / "run.log"
    target.write_text("data\n", encoding="utf-8")

    with patch.object(
        Path, "symlink_to", side_effect=OSError("symlink not supported")
    ):
        link = paths.point_latest_log(tmp_path, target)

    assert link.exists()
    assert not link.is_symlink()
    assert link.read_text(encoding="utf-8") == "data\n"
