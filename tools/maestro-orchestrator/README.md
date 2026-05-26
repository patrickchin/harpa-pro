# maestro-orchestrator (`mo`)

Standalone CLI that orchestrates Maestro E2E runs of
`.maestro/regression-journey.yaml` (and siblings) across
Windows + Android device and macOS + iOS Simulator.

> **Spec / source of truth:**
> [`docs/v4/design-maestro-orchestrator.md`](../../docs/v4/design-maestro-orchestrator.md)

This package lives outside the pnpm workspace on purpose — it is
not imported by any app/package and ships as its own `uv`-managed
Python tool.

## Install

From the repo root:

```bash
uv tool install ./tools/maestro-orchestrator
```

This exposes `mo` on `PATH`.

For development inside the package directory:

```bash
cd tools/maestro-orchestrator
uv sync --dev
uv run mo --help
```

## Run the tests

```bash
cd tools/maestro-orchestrator
uv run pytest -v
```

## Status

**Phase 4.0 — scaffold only.** All subcommands are stubs that
exit non-zero with `"not implemented"`. Real behaviour lands in
later phases per the design doc.

Subcommands:

| Command | Purpose (see design doc) |
|---|---|
| `mo doctor` | Preflight checklist; gates a journey. |
| `mo reset` | Single source of truth for between-runs DB + device reset. |
| `mo run` | Spawn `maestro test` detached with PID + log tracking. |
| `mo journey` | Composite: `doctor --fix && reset && run regression-journey`. |
| `mo kill` | Terminate live runner + orphaned Maestro/driver processes. |
| `mo logs` | Tail the latest run log without remembering the timestamp. |
