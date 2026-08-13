from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence

from rich.console import Console
from rich.table import Table

_GLYPHS_RICH = {
    "ok": "[green]OK[/green]",
    "fail": "[red]FAIL[/red]",
    "warn": "[yellow]WARN[/yellow]",
    "skip": "[dim]SKIP[/dim]",
}
_GLYPHS_PLAIN = {
    "ok": "[OK]",
    "fail": "[FAIL]",
    "warn": "[WARN]",
    "skip": "[SKIP]",
}


def _step_field(step: object, key: str) -> str:
    if isinstance(step, Mapping):
        value = step[key]
    else:
        value = getattr(step, key)
    return str(value)


def emit_step_report(
    *,
    console: Console,
    title: str,
    steps: Sequence[object],
    success_message: str,
    failure_message: str | Callable[[int, Sequence[object]], str],
    exit_code: int = 0,
    failure_to_stderr_plain: bool = False,
) -> int:
    use_color = console.is_terminal and not console.no_color
    table = Table(title=title)
    table.add_column("status", no_wrap=True)
    table.add_column("step", no_wrap=True)
    table.add_column("detail", overflow="fold")
    glyphs = _GLYPHS_RICH if use_color else _GLYPHS_PLAIN
    for step in steps:
        status = _step_field(step, "status")
        table.add_row(
            glyphs.get(status, status),
            _step_field(step, "name"),
            _step_field(step, "detail"),
        )
    console.print(table)
    if exit_code == 0:
        console.print(
            f"[green]{success_message}[/green]" if use_color else success_message
        )
        return exit_code
    message = (
        failure_message(exit_code, steps)
        if callable(failure_message)
        else failure_message
    )
    if use_color:
        console.print(f"[red]{message}[/red]")
    elif failure_to_stderr_plain:
        Console(stderr=True, no_color=True).print(message)
    else:
        console.print(message)
    return exit_code
