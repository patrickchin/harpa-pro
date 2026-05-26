"""Tests for config resolution (CLI > env > mo.toml + project-root discovery)."""

from __future__ import annotations

from pathlib import Path

import pytest

from maestro_orchestrator.config import (
    MoConfig,
    find_project_root,
    load_config,
)


class TestFindProjectRoot:
    def test_finds_root_when_cwd_is_root(self, fake_project_root: Path) -> None:
        assert find_project_root(fake_project_root) == fake_project_root

    def test_finds_root_from_nested_directory(self, fake_project_root: Path) -> None:
        nested = fake_project_root / "apps" / "mobile" / "src" / "screens"
        nested.mkdir(parents=True)
        assert find_project_root(nested) == fake_project_root

    def test_returns_none_when_no_markers(self, tmp_path: Path) -> None:
        # tmp_path is empty — no AGENTS.md, no pnpm-workspace.yaml.
        assert find_project_root(tmp_path) is None

    def test_requires_both_markers(self, tmp_path: Path) -> None:
        (tmp_path / "AGENTS.md").write_text("x", encoding="utf-8")
        # Missing pnpm-workspace.yaml.
        assert find_project_root(tmp_path) is None


class TestLoadConfig:
    def test_loads_from_env(self, fake_project_root: Path) -> None:
        cfg = load_config(
            env={
                "HARPA_PROJECT_ROOT": str(fake_project_root),
                "MAESTRO_APP_ID": "com.example.app",
                "MAESTRO_DEVICE": "emulator-5554",
            },
            cwd=fake_project_root,
        )
        assert isinstance(cfg, MoConfig)
        assert cfg.project_root == fake_project_root.resolve()
        assert cfg.app_id == "com.example.app"
        assert cfg.device == "emulator-5554"

    def test_auto_detects_project_root_from_cwd(
        self, fake_project_root: Path
    ) -> None:
        nested = fake_project_root / "packages" / "api"
        nested.mkdir(parents=True)
        cfg = load_config(env={}, cwd=nested)
        assert cfg.project_root == fake_project_root.resolve()

    def test_auto_detects_project_root_from_root_itself(
        self, fake_project_root: Path
    ) -> None:
        cfg = load_config(env={}, cwd=fake_project_root)
        assert cfg.project_root == fake_project_root.resolve()

    def test_raises_when_no_root_resolvable(self, tmp_path: Path) -> None:
        with pytest.raises(RuntimeError, match="HARPA_PROJECT_ROOT"):
            load_config(env={}, cwd=tmp_path)

    def test_cli_overrides_env(self, fake_project_root: Path) -> None:
        cfg = load_config(
            cli_overrides={"app_id": "cli.win", "device": "udid-cli"},
            env={
                "HARPA_PROJECT_ROOT": str(fake_project_root),
                "MAESTRO_APP_ID": "env.lose",
                "MAESTRO_DEVICE": "udid-env",
            },
            cwd=fake_project_root,
        )
        assert cfg.app_id == "cli.win"
        assert cfg.device == "udid-cli"

    def test_env_overrides_toml(self, fake_project_root: Path) -> None:
        (fake_project_root / "mo.toml").write_text(
            'app_id = "toml.lose"\ndevice = "toml.lose"\n', encoding="utf-8"
        )
        cfg = load_config(
            env={
                "HARPA_PROJECT_ROOT": str(fake_project_root),
                "MAESTRO_APP_ID": "env.win",
            },
            cwd=fake_project_root,
        )
        assert cfg.app_id == "env.win"
        # Device falls through to mo.toml since env doesn't set it.
        assert cfg.device == "toml.lose"

    def test_toml_used_when_no_env_or_cli(self, fake_project_root: Path) -> None:
        (fake_project_root / "mo.toml").write_text(
            'app_id = "only.toml"\n', encoding="utf-8"
        )
        cfg = load_config(
            env={"HARPA_PROJECT_ROOT": str(fake_project_root)},
            cwd=fake_project_root,
        )
        assert cfg.app_id == "only.toml"
        assert cfg.device is None

    def test_cli_project_root_overrides_env(
        self, fake_project_root: Path, tmp_path: Path
    ) -> None:
        other = tmp_path / "other"
        other.mkdir()
        (other / "AGENTS.md").write_text("x", encoding="utf-8")
        (other / "pnpm-workspace.yaml").write_text("x", encoding="utf-8")
        cfg = load_config(
            cli_overrides={"project_root": str(other)},
            env={"HARPA_PROJECT_ROOT": str(fake_project_root)},
            cwd=fake_project_root,
        )
        assert cfg.project_root == other.resolve()
