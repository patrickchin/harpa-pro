#!/usr/bin/env bash
# scripts/check-maestro-testids.sh
#
# Grep gate: verify that every testID referenced in the NEW Maestro regression
# YAML files actually exists in the mobile source code.
#
# Only checks .maestro/modules/, .maestro/helpers/, selected root
# regression/smoke flows, and feature flows that are meant to stay runnable.
#
# Known false-negatives (dynamically-generated testIDs whose PREFIX exists
# but exact value does not appear literally in source):
#   picker-member-role-editor  →  testID={`picker-member-role-${r}`}
#   picker-member-role-viewer  →  testID={`picker-member-role-${r}`}
#   btn-camera-thumb-N         →  testID={`btn-camera-thumb-${idx}`}
#   batch-grid-tile-N*         →  testID={`${tileTestIDPrefix}-${idx}`} plus
#                                  PhotoTile suffixes (`-img`, `-ring`, `-cancel`)
#   attachment-picker-thumbnail-N-image
#                              →  testID={`attachment-picker-thumbnail-${index}-image`}
#   usage-limit-KIND / usage-limit-bar-KIND
#                              →  testID={`usage-limit-${b.kind}`} and
#                                  `usage-limit-bar-${b.kind}`
#   project-row-SLUG           →  testID={`project-row-${item.slug}`} in
#                                  seeded flows
#   report-row-N               →  testID={`report-row-${item.number}`} in seeded flows
#   note-row-N                 →  testID={`note-row-${sourceIndex}`} in
#                                  long-list stress flows
#   input-note|report-row-N    →  create-report race guard; both sides are
#                                  checked by existing literal/template rules
#   report-row-draft-0         →  legacy seeded fixture id
#   input-phone                →  rendered by auth/login flow outside static source match
#   id-a|id-b                  →  Maestro regex alternation, literals checked
#                                  elsewhere by this same script
#
# Usage:  bash scripts/check-maestro-testids.sh
# Exits with code 1 if any unknown testID is not found.

set -euo pipefail

MOBILE_SRC="apps/mobile"
MISSING=0

# Collect testIDs only from new regression files
TESTIDS=$(grep -rhE "^[[:space:]]*id:[[:space:]]*['\"]" \
    .maestro/modules/ \
    .maestro/helpers/ \
    .maestro/regression-journey.yaml \
    .maestro/release-stress-journey.yaml \
    .maestro/native-input-smoke.yaml \
    .maestro/place-photo-on-issue.flow.yml \
    .maestro/store-screenshots.yaml \
  | sed -E "s/.*id:[[:space:]]*['\"]([^'\"]*)['\"].*/\1/" \
  | sort -u)

# Known false-negatives: exact literal not in source but rendered at runtime.
# Format: space-separated list of testID values to skip.
KNOWN_TEMPLATE_IDS="picker-member-role-editor picker-member-role-viewer btn-camera-thumb-0 btn-camera-thumb-1 batch-grid-tile-0 batch-grid-tile-1 batch-grid-tile-0-ring batch-grid-tile-0-cancel batch-grid-tile-0-img batch-grid-tile-1-ring batch-grid-tile-1-cancel batch-grid-tile-1-img report-row-draft-0 input-phone btn-project-edit|btn-new-project screen-onboarding|btn-new-project screen-onboarding|btn-new-project|e2e-password-login-error"

is_known() {
  local id="$1"
  [[ "$id" =~ ^attachment-picker-thumbnail-[0-9]+-image$ ]] && return 0
  [[ "$id" =~ ^usage-limit(-bar)?-(report_generate|voice_transcribe|voice_summarize|ai_input_tokens|ai_output_tokens)$ ]] && return 0
  [[ "$id" =~ ^project-row-.+$ ]] && return 0
  [[ "$id" =~ ^report-row-[0-9]+$ ]] && return 0
  [[ "$id" =~ ^note-row-[0-9]+$ ]] && return 0
  [[ "$id" =~ ^input-note\|report-row-[0-9]+$ ]] && return 0
  for known in $KNOWN_TEMPLATE_IDS; do
    [[ "$id" == "$known" ]] && return 0
  done
  return 1
}

echo "Checking Maestro testIDs against mobile source…"

# Search for a string appearing anywhere in the mobile source
grep_src() {
  local pattern="$1"
  if command -v rg >/dev/null 2>&1; then
    rg -q --fixed-strings --glob "*.tsx" --glob "*.ts" "${pattern}" "$MOBILE_SRC"
  elif command -v rg.exe >/dev/null 2>&1; then
    rg.exe -q --fixed-strings --glob "*.tsx" --glob "*.ts" "${pattern}" "$MOBILE_SRC"
  else
    grep -qr --include="*.tsx" --include="*.ts" --exclude-dir=node_modules \
      "${pattern}" "$MOBILE_SRC" 2>/dev/null
  fi
}

while IFS= read -r id; do
  # Regex wildcard — extract prefix before '.*'
  if [[ "$id" == *".*"* ]]; then
    prefix="${id%%.*}"
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
