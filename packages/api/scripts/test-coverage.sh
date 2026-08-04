#!/usr/bin/env bash
# Collect unit and Testcontainers coverage in separate bounded processes, then
# merge the blobs and enforce the repository's 90% API line threshold.
#
# Keeping the DB suite in two sequential shards avoids retaining every V8
# coverage map alongside dozens of short-lived Postgres containers in one
# process. The final merge is the only place thresholds are evaluated.
set -euo pipefail

REPORT_DIR="$(mktemp -d -t harpa-api-coverage-XXXXXX)"
trap 'rm -rf "$REPORT_DIR"' EXIT

vitest run \
  --coverage \
  --silent=passed-only \
  --config vitest.config.ts \
  --reporter=default \
  --reporter=blob \
  --outputFile.blob="$REPORT_DIR/unit.json"

for shard in 1 2; do
  vitest run \
    --coverage \
    --silent=passed-only \
    --config vitest.integration.config.ts \
    --shard="$shard/2" \
    --reporter=default \
    --reporter=blob \
    --outputFile.blob="$REPORT_DIR/integration-$shard.json"
done

vitest run \
  --coverage \
  --silent=passed-only \
  --config vitest.coverage.config.ts \
  --merge-reports="$REPORT_DIR"
