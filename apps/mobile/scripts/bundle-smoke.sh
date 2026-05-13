#!/usr/bin/env bash
#
# Mobile JS bundle smoke-test.
#
# Drives `expo export` for iOS in a temporary output directory and
# fails on:
#   - any Metro "Unable to resolve" error
#   - any reference to test files leaking into the bundle (`vitest`,
#     `*.test.ts` etc.)
#   - non-zero exit from the bundler
#
# This catches:
#   - Pattern R2 — `.js` extensions in relative TS imports
#   - Pattern R4 — test files leaking into the app bundle via expo-
#     router's `require.context` glob
#   - missing native-module shims, missing assets, broken Metro
#     resolver config, etc.
#
# Designed to run in well under a minute (~25s on M-series, mostly
# Hermes byte-code compile). Run after every commit per
# docs/v4/overnight-protocol.md §5.
#
# Usage:
#   pnpm --filter @harpa/mobile bundle:smoke
#   # or from the repo root:
#   bash apps/mobile/scripts/bundle-smoke.sh

set -euo pipefail

cd "$(dirname "$0")/.."

OUTPUT_DIR="$(mktemp -d -t harpa-bundle-smoke-XXXXXX)"
trap 'rm -rf "$OUTPUT_DIR"' EXIT

LOG="$(mktemp -t harpa-bundle-smoke-log-XXXXXX)"
trap 'rm -f "$LOG"' EXIT

echo "→ Bundling mobile JS for iOS to $OUTPUT_DIR"
if ! pnpm exec expo export --platform ios --output-dir "$OUTPUT_DIR" > "$LOG" 2>&1; then
  echo "✗ expo export failed:" >&2
  tail -50 "$LOG" >&2
  exit 1
fi

# Grep the log for resolver errors. Metro logs these as warnings AND
# in some cases continues bundling, so we have to fail explicitly.
if grep -E "Unable to resolve|Cannot find module" "$LOG" >&2; then
  echo "✗ Metro could not resolve one or more modules — see above." >&2
  echo "  Common causes: '.js' suffix on a relative TS import (Pattern R2)," >&2
  echo "  a test file inside app/** dragging in vitest (Pattern R4)," >&2
  echo "  or a missing native-module shim." >&2
  exit 1
fi

# Belt-and-braces: ensure no test runtime leaked into the bundle.
# The bundle is Hermes byte-code; grep the metadata.json which lists
# every module that was included.
if grep -E "vitest|@vitest|/__tests__/|\\.test\\.(ts|tsx|js|jsx)" "$OUTPUT_DIR"/metadata.json 2>/dev/null; then
  echo "✗ Test/vitest module(s) leaked into the mobile bundle (Pattern R4)." >&2
  exit 1
fi

echo "✓ Bundle smoke-test passed."
