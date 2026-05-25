"""Configuration for `mo`.

Three-tier resolution per the design doc (section 4 + 5):

    CLI flag  >  environment variable  >  mo.toml (optional)

`HARPA_PROJECT_ROOT` is special: if neither CLI nor env supplies
it, we walk up from the current working directory looking for the
monorepo root marker (`AGENTS.md` + `pnpm-workspace.yaml`).
"""

from __future__ import annotations

import os
import tomllib
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

PROJECT_ROOT_MARKERS: tuple[str, ...] = ("AGENTS.md", "pnpm-workspace.yaml")


def find_project_root(start: Path | None = None) -> Path | None:
    """Walk up from `start` (default: cwd) looking for the harpa-pro root.

    Returns the first directory containing all of PROJECT_ROOT_MARKERS,
    or None if we hit the filesystem root without finding one.
    """
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if all((candidate / marker).exists() for marker in PROJECT_ROOT_MARKERS):
            return candidate
    return None


class MoConfig(BaseModel):
    """Resolved runtime configuration for an `mo` invocation."""

    model_config = ConfigDict(frozen=True)

    project_root: Path = Field(
        ..., description="Absolute path to the harpa-pro monorepo root."
    )
    app_id: str | None = Field(
        default=None,
        description="MAESTRO_APP_ID — the bundle / package id under test.",
    )
    device: str | None = Field(
        default=None,
        description="MAESTRO_DEVICE — ADB serial or iOS Simulator UDID.",
    )


def _load_toml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("rb") as handle:
        return tomllib.load(handle)


def load_config(
    *,
    cli_overrides: dict[str, Any] | None = None,
    env: dict[str, str] | None = None,
    cwd: Path | None = None,
    config_file: Path | None = None,
) -> MoConfig:
    """Resolve config in three tiers: CLI > env > optional mo.toml.

    `env` defaults to `os.environ`. `cwd` defaults to `Path.cwd()`.
    `config_file` defaults to `<project_root>/mo.toml` if a project
    root is discoverable.
    """
    overrides = cli_overrides or {}
    environ = env if env is not None else dict(os.environ)
    base_cwd = cwd or Path.cwd()

    # Tier 1: CLI override for project_root.
    project_root: Path | None = None
    if "project_root" in overrides and overrides["project_root"]:
        project_root = Path(overrides["project_root"]).resolve()
    elif environ.get("HARPA_PROJECT_ROOT"):
        project_root = Path(environ["HARPA_PROJECT_ROOT"]).resolve()
    else:
        project_root = find_project_root(base_cwd)

    if project_root is None:
        raise RuntimeError(
            "Could not resolve HARPA_PROJECT_ROOT. Set the env var, "
            "pass --project-root, or run from inside the harpa-pro tree."
        )

    # Tier 3: mo.toml (lowest precedence). Only loaded if it exists.
    toml_path = config_file if config_file is not None else project_root / "mo.toml"
    toml_data = _load_toml(toml_path)

    def _resolve(key: str, env_key: str) -> Any:
        if key in overrides and overrides[key] is not None:
            return overrides[key]
        if environ.get(env_key):
            return environ[env_key]
        return toml_data.get(key)

    return MoConfig(
        project_root=project_root,
        app_id=_resolve("app_id", "MAESTRO_APP_ID"),
        device=_resolve("device", "MAESTRO_DEVICE"),
    )
