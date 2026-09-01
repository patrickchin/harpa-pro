from __future__ import annotations

from io import StringIO

from rich.console import Console

from maestro_orchestrator.report_renderer import emit_step_report


def test_emit_step_report_preserves_plain_step_table_and_success_summary() -> None:
    stream = StringIO()
    console = Console(file=stream, force_terminal=False, no_color=True, width=120)
    exit_code = emit_step_report(
        console=console,
        title="mo down",
        steps=[
            {"name": "metro", "status": "ok", "detail": "stopped"},
            {"name": "docker", "status": "skip", "detail": "kept running"},
        ],
        success_message="down: all steps completed",
        failure_message=lambda code, _steps: f"down: exit {code}",
    )
    assert exit_code == 0
    out = stream.getvalue()
    assert "mo down" in out
    assert "[OK]" in out
    assert "[SKIP]" in out
    assert "down: all steps completed" in out
