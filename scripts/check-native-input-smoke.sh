#!/usr/bin/env bash
# Ensures native input coverage exists outside fixture mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAESTRO_DIR="${MAESTRO_DIR:-$ROOT/.maestro}"
FLOW="$MAESTRO_DIR/native-input-smoke.yaml"
README="$MAESTRO_DIR/README.md"

if [ ! -d "$MAESTRO_DIR" ]; then
  echo "skip: .maestro not present"
  exit 0
fi

fail() {
  echo "❌ native input smoke guard failed: $*" >&2
  exit 1
}

require_file() {
  local file="$1" label="$2"
  [ -f "$file" ] || fail "missing $label ($file)"
}

require_pattern() {
  local file="$1" pattern="$2" label="$3"
  grep -Eq -- "$pattern" "$file" || fail "$file is missing $label"
}

reject_pattern() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq -- "$pattern" "$file"; then
    fail "$file must not include $label"
  fi
}

require_file "$FLOW" ".maestro/native-input-smoke.yaml"
require_file "$README" ".maestro/README.md"

require_pattern "$FLOW" 'EXPO_PUBLIC_USE_FIXTURES=false' 'the non-fixture precondition'
require_pattern "$FLOW" 'modules/01-auth\.yaml' 'real auth setup'
require_pattern "$FLOW" 'modules/02-projects-crud\.yaml' 'real project setup'
require_pattern "$FLOW" 'btn-record-start' 'the record-start tap'
require_pattern "$FLOW" 'voice-record-strip' 'the native recorder-start assertion'
require_pattern "$FLOW" 'voice-record-duration' 'the recording status assertion'
require_pattern "$FLOW" 'btn-record-cancel' 'the cancel path'
require_pattern "$FLOW" 'btn-attachment-camera' 'the camera entrypoint'
require_pattern "$FLOW" 'camera-capture-root' 'the native camera screen assertion'
require_pattern "$FLOW" 'btn-camera-shutter' 'the real camera shutter tap'
require_pattern "$FLOW" 'btn-camera-thumb-0' 'the captured-photo assertion'
require_pattern "$FLOW" 'btn-camera-confirm-discard' 'the camera discard path'

reject_pattern "$FLOW" 'EXPO_PUBLIC_USE_FIXTURES=true' 'fixture mode'
reject_pattern "$FLOW" 'fixtureRecorder|fixture recorder|fixture recording' 'fixture-recorder coverage'
reject_pattern "$FLOW" 'btn-record-send' 'upload/transcription send path'
reject_pattern "$FLOW" 'voice-title-|voice-summary-' 'fixture transcript/summary assertions'

require_pattern "$README" 'native-input-smoke\.yaml' 'native input smoke run instructions'
require_pattern "$README" 'EXPO_PUBLIC_USE_FIXTURES=false' 'non-fixture build instructions'

echo "✅ native input smoke covers non-fixture recorder and camera paths"
