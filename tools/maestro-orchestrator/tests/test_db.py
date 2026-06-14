"""Tests for `db.truncate_sql()`.

The orchestrator is the single source of truth for the DB-reset SQL
used between Maestro runs. Historically, this SQL lived in
`scripts/maestro/reset-db.sh`. We detect drift between the embedded
SQL and the legacy script via a content-snapshot test so we don't
silently fall out of sync.

Per the design doc, the modern journey signs Alice / Bob up via the
UI, so the *default* `truncate_sql()` omits the legacy seed inserts.
The seed payload is exposed separately and is currently NOT wired in
(Q5 in the design doc).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from maestro_orchestrator import db


def test_truncate_sql_mentions_all_expected_tables() -> None:
    sql = db.truncate_sql()
    expected = [
        "app.notes",
        "app.files",
        "app.reports",
        "app.project_members",
        "app.projects",
        "app.user_settings",
        "app.waitlist_signups",
        'public."session"',
        'public."account"',
        'public."verification"',
        'public."user"',
    ]
    for table in expected:
        assert table in sql, f"truncate_sql() missing table {table!r}"
    assert "auth." not in sql


def test_truncate_sql_is_a_single_truncate_statement() -> None:
    sql = db.truncate_sql().strip()
    assert sql.upper().startswith("TRUNCATE"), sql[:40]
    assert "RESTART IDENTITY CASCADE" in sql.upper()
    # No INSERTs in the default — those belong to the legacy seed.
    assert "INSERT" not in sql.upper()


def test_truncate_sql_matches_legacy_reset_db_sh(
    project_root_for_drift: Path,
) -> None:
    """If `scripts/maestro/reset-db.sh` adds or removes a table from
    its TRUNCATE list, this test fails so we update `db.py` to match.
    """
    script = project_root_for_drift / "scripts" / "maestro" / "reset-db.sh"
    if not script.exists():
        pytest.skip("legacy reset-db.sh not present (running outside monorepo)")
    text = script.read_text(encoding="utf-8")
    # Pull every table token referenced by the TRUNCATE statement in
    # the legacy script.
    import re

    truncate_block = re.search(
        r"TRUNCATE\s+(.+?)RESTART IDENTITY CASCADE",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    assert truncate_block is not None, "couldn't find TRUNCATE block in legacy script"
    table_pattern = r'(?:app\.\w+|public\."(?:session|account|verification|user)")'
    legacy_tables = set(re.findall(table_pattern, truncate_block.group(1)))
    assert legacy_tables, "no reset tables parsed from legacy script"

    sql = db.truncate_sql()
    sql_tables = set(__import__("re").findall(table_pattern, sql))
    missing = legacy_tables - sql_tables
    extra = sql_tables - legacy_tables
    assert not missing and not extra, (
        f"drift vs reset-db.sh: missing={sorted(missing)} extra={sorted(extra)}"
    )


def test_container_name_and_db_match_legacy_script(
    project_root_for_drift: Path,
) -> None:
    script = project_root_for_drift / "scripts" / "maestro" / "reset-db.sh"
    if not script.exists():
        pytest.skip("legacy reset-db.sh not present")
    text = script.read_text(encoding="utf-8")
    assert db.PG_CONTAINER in text, (
        f"db.PG_CONTAINER={db.PG_CONTAINER!r} not in reset-db.sh"
    )
    assert f"-d {db.PG_DATABASE}" in text, (
        f"db.PG_DATABASE={db.PG_DATABASE!r} not in reset-db.sh `-d` flag"
    )
    assert f"-U {db.PG_USER}" in text, (
        f"db.PG_USER={db.PG_USER!r} not in reset-db.sh `-U` flag"
    )


@pytest.fixture()
def project_root_for_drift() -> Path:
    """Resolve the real monorepo root (not the fake one used by other tests).

    Falls back to None-equivalent via skip in the test if not found.
    """
    # tools/maestro-orchestrator/tests/test_db.py → up 3 levels = monorepo
    return Path(__file__).resolve().parents[3]
