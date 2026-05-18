#!/usr/bin/env bash
# CLI.12 — help / command-tree drift gate.
#
# Runs the CLI's help.test.ts in non-update mode. If a command was
# added, removed, or its arg signature changed without updating the
# snapshot (`apps/cli/src/__tests__/__snapshots__/help.test.ts.snap`),
# this script exits non-zero — preventing silent drift between the
# implementation and `docs/v4/arch-cli.md`.
#
# Also runs the TUI's help snapshot (TUI.5) so the `harpa tui` surface
# stays in lockstep with `docs/v4/arch-tui.md`.
#
# Regenerate after intentional changes:
#   pnpm --filter @harpa/cli test -- -u help.test
#   pnpm --filter @harpa/cli test -- -u tui/help.snapshot
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm --filter @harpa/cli test -- --run help.test
pnpm --filter @harpa/cli test -- --run tui/help.snapshot
