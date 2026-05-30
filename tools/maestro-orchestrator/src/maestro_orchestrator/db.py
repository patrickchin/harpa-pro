"""DB reset SQL — single source of truth.

The TRUNCATE block here mirrors the one in
`scripts/maestro/reset-db.sh`. We deliberately keep the SQL embedded
as a Python constant (not read at runtime from the shell script) so
`mo` has no implicit file dependency on the monorepo. A drift test
in `tests/test_db.py` reads the shell script and asserts the table
list matches; if you change one, you must change the other.

Per the design doc §4.2, the modern Maestro regression journey signs
Alice / Bob up via the UI, so the *default* reset SQL omits the
legacy seed inserts. The legacy seed payload remains an open design
question (Q5) and is currently not implemented — `commands/reset.py`
emits a clean FAIL when `--seed legacy` is passed.
"""

from __future__ import annotations

# docker container name (NOT the compose service name) — the legacy
# `reset-db.sh` shells out to `docker exec -i harpa-pro-pg`, which
# addresses the container by its `container_name:` directly. `mo`
# uses the same path so it works without `docker compose` cwd magic.
PG_CONTAINER = "harpa-pro-pg"
PG_USER = "postgres"
PG_DATABASE = "harpa"


_TRUNCATE_SQL = (
    "TRUNCATE app.notes, app.files, app.reports, app.project_members,\n"
    "         app.projects, app.user_settings, app.waitlist_signups,\n"
    "         auth.sessions, auth.verifications, auth.users\n"
    "  RESTART IDENTITY CASCADE;\n"
)


def truncate_sql() -> str:
    """Return the canonical TRUNCATE statement for between-runs reset.

    Excludes the legacy Alice / Bob seed inserts (see module docstring).
    """
    return _TRUNCATE_SQL


def docker_exec_argv(sql: str) -> list[str]:
    """Build the argv for `docker exec -i <container> psql ...`.

    The SQL is streamed on stdin; callers feed `sql` to
    `subprocess.run(..., input=sql)` rather than embedding it via `-c`
    so we don't have to worry about shell quoting (which doesn't apply
    here since `shell=False`, but `-c` also chokes on multi-statement
    payloads on some psql versions).
    """
    return [
        "docker",
        "exec",
        "-i",
        PG_CONTAINER,
        "psql",
        "-U",
        PG_USER,
        "-d",
        PG_DATABASE,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        "-",
    ]
