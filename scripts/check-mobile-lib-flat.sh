#!/usr/bin/env bash
# Fail if any .ts or .tsx file lives directly in apps/mobile/lib/
# (root level only). Subfolders are required — see
# docs/v4/arch-mobile.md "Folder rule".

set -euo pipefail

shopt -s nullglob
flat=(apps/mobile/lib/*.ts apps/mobile/lib/*.tsx)

if [ ${#flat[@]} -gt 0 ]; then
  echo "ERROR: flat files found in apps/mobile/lib/ (must live in a subfolder):"
  printf '  %s\n' "${flat[@]}"
  echo
  echo "Move them into an appropriate subfolder (config/, util/, reports/, …)."
  echo "See docs/v4/arch-mobile.md § 'Folder rule'."
  exit 1
fi

echo "apps/mobile/lib/ is subfolder-only ✓"
