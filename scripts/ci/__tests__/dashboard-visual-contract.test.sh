#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tokens="$repo_root/packages/design-tokens/src/tokens.css"
dashboard_css="$repo_root/apps/dashboard/src/styles.css"
dashboard_index="$repo_root/apps/dashboard/index.html"
dashboard_reports_css="$repo_root/apps/dashboard/src/features/reports/reports.css"
dashboard_package="$repo_root/apps/dashboard/package.json"
mobile_colors="$repo_root/apps/mobile/lib/design-tokens/colors.ts"
deploy_workflows=(
  "$repo_root/.github/workflows/dashboard-preview.yml"
  "$repo_root/.github/workflows/dashboard-dev.yml"
  "$repo_root/.github/workflows/dashboard-prod.yml"
)

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

expect_file() {
  [[ -f "$1" ]] || fail "expected file $1"
}

expect_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq -- "$expected" "$file" || fail "expected '$expected' in $file"
}

expect_not_contains() {
  local file="$1"
  local unexpected="$2"
  if grep -Fq -- "$unexpected" "$file"; then
    fail "did not expect '$unexpected' in $file"
  fi
}

expect_file "$tokens"

# Mobile-authored colour, type, shape, and sizing values.
expect_contains "$tokens" '--background: #f8f6f1;'
expect_contains "$tokens" '--foreground: #2d3a5a;'
expect_contains "$tokens" '--card: #ffffff;'
expect_contains "$tokens" '--surface-muted: #f1eee6;'
expect_contains "$tokens" '--surface-emphasis: #fffdf8;'
expect_contains "$tokens" '--accent: #ea580c;'
expect_contains "$tokens" '--border: #b9b4a8;'
expect_contains "$tokens" '--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;'
expect_contains "$tokens" '--font-size-display: 2.125rem;'
expect_contains "$tokens" '--font-size-title: 1.625rem;'
expect_contains "$tokens" '--font-size-body: 1rem;'
expect_contains "$tokens" '--radius-control: 6px;'
expect_contains "$tokens" '--radius-card: 8px;'
expect_contains "$tokens" '--control-height: 44px;'
expect_contains "$tokens" '--control-height-lg: 52px;'
expect_contains "$tokens" '--page-gutter: 20px;'
expect_contains "$tokens" '--content-max: 72rem;'

# Guard the normative mobile values as well as the web mirror.
expect_contains "$mobile_colors" "background: '#f8f6f1'"
expect_contains "$mobile_colors" "foreground: '#2d3a5a'"
expect_contains "$mobile_colors" "DEFAULT: '#ea580c'"
expect_contains "$mobile_colors" "border: '#b9b4a8'"

# The dashboard consumes the mobile-authored CSS mirror.
expect_contains "$dashboard_package" '"@harpa/design-tokens"'
expect_contains "$dashboard_css" '@import "@harpa/design-tokens/tokens.css";'
expect_contains "$dashboard_index" 'name="theme-color" content="#ea580c"'

# Prevent dashboard-local design-system forks from returning.
expect_not_contains "$dashboard_css" '--paper:'
expect_not_contains "$dashboard_css" '--ink:'
expect_not_contains "$dashboard_reports_css" '--reports-paper:'
expect_not_contains "$dashboard_reports_css" '--reports-ink:'

# Token-only changes must rebuild every dashboard deployment target.
for workflow in "${deploy_workflows[@]}"; do
  expect_contains "$workflow" 'packages/design-tokens/**'
done

printf 'PASS: dashboard follows the mobile visual contract\n'
