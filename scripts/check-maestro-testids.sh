#!/usr/bin/env bash
# scripts/check-maestro-testids.sh
#
# Grep gate: verify that every testID referenced in the NEW Maestro regression
# YAML files actually exists in the mobile source code.
#
# Only checks .maestro/modules/, .maestro/helpers/, and regression-journey.yaml.
#
# Known false-negatives (dynamically-generated testIDs whose PREFIX exists
# but exact value does not appear literally in source):
#   picker-member-role-editor  →  testID={`picker-member-role-${r}`}
#   picker-member-role-viewer  →  testID={`picker-member-role-${r}`}
#
# Usage:  bash scripts/check-maestro-testids.sh
# Exits with code 1 if any unknown testID is not found.

set -euo pipefail

MOBILE_SRC="apps/mobile"
MISSING=0

# Collect testIDs only from new regression files
TESTIDS=$(grep -rh '^[[:space:]]*id:[[:space:]]*"' \
    .maestro/modules/ \
    .maestro/helpers/ \
    .maestro/regression-journey.yaml \
  | sed 's/.*id:[[:space:]]*"\([^"]*\)".*/\1/' \
  | sort -u)

# Known false-negatives: exact literal not in source but rendered at runtime.
# Format: space-separated list of testID values to skip.
KNOWN_TEMPLATE_IDS="picker-member-role-editor picker-member-role-viewer"

is_known() {
  local id="$1"
  for known in $KNOWN_TEMPLATE_IDS; do
    [[ "$id" == "$known" ]] && return 0
  done
  return 1
}

echo "Checking Maestro testIDs against mobile source…"

# Search for a string appearing anywhere in the mobile source
grep_src() {
  local pattern="$1"
  grep -qr --include="*.tsx" --include="*.ts" --exclude-dir=node_modules \
    "${pattern}" "$MOBILE_SRC" 2>/dev/null
}

while IFS= read -r id; do
  # Regex wildcard — extract prefix before '.*'
  if [[ "$id" == *".*"* ]]; then
    prefix="${id%%\.\*}"
    [ -z "$prefix" ] && continue
    if ! grep_src "${prefix}"; then
      echo "  MISSING (prefix): $id"
      MISSING=$((MISSING + 1))
    fi
  # Template variable — extract prefix before '${'
  elif [[ "$id" == *'${'* ]]; then
    prefix="${id%%\$\{*}"
    [ -z "$prefix" ] && continue
    if ! grep_src "${prefix}"; then
      echo "  MISSING (template): $id"
      MISSING=$((MISSING + 1))
    fi
  # Known false-negatives: skip
  elif is_known "$id"; then
    echo "  OK (known template): $id"
  # Literal — search for exact string
  else
    if ! grep_src "${id}"; then
      echo "  MISSING: $id"
      MISSING=$((MISSING + 1))
    fi
  fi
done <<< "$TESTIDS"

if [ "$MISSING" -gt 0 ]; then
  echo ""
  echo "❌  $MISSING testID(s) not found in $MOBILE_SRC"
  exit 1
else
  echo "✅  All testIDs found in $MOBILE_SRC"
fi
