#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tokens="$repo_root/packages/design-tokens/src/tokens.css"
dashboard_css="$repo_root/apps/dashboard/src/globals.css"
dashboard_index="$repo_root/apps/dashboard/index.html"
dashboard_package="$repo_root/apps/dashboard/package.json"
dashboard_vite="$repo_root/apps/dashboard/vite.config.ts"
dashboard_main="$repo_root/apps/dashboard/src/main.tsx"
dashboard_brand="$repo_root/apps/dashboard/src/assets/brand-icon.svg"
mobile_brand="$repo_root/apps/mobile/assets/icon.svg"
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

expect_absent_file() {
  [[ ! -e "$1" ]] || fail "did not expect legacy visual stylesheet $1"
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
expect_file "$dashboard_css"
expect_file "$dashboard_brand"
expect_absent_file "$repo_root/apps/dashboard/src/styles.css"
expect_absent_file "$repo_root/apps/dashboard/src/features/reports/reports.css"

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
expect_contains "$dashboard_package" '"@headlessui/react"'
expect_contains "$dashboard_package" '"clsx"'
expect_contains "$dashboard_package" '"lucide-react"'
expect_contains "$dashboard_package" '"tailwind-merge"'
expect_contains "$dashboard_package" '"@tailwindcss/vite"'
expect_contains "$dashboard_package" '"tailwindcss"'
expect_contains "$dashboard_css" '@import "@harpa/design-tokens/tokens.css";'
expect_contains "$dashboard_css" '@import "tailwindcss";'
expect_contains "$dashboard_css" '@theme inline'
expect_contains "$dashboard_css" '--text-title-sm--font-weight: 700;'
expect_contains "$dashboard_css" '--text-label--letter-spacing: var(--letter-spacing-label);'
expect_contains "$dashboard_css" '--text-label--font-weight: 700;'
expect_contains "$dashboard_vite" "import tailwindcss from '@tailwindcss/vite';"
expect_contains "$dashboard_vite" 'plugins: [react(), tailwindcss()]'
expect_contains "$dashboard_main" "import '@/globals.css';"
expect_contains "$dashboard_index" 'name="theme-color" content="#ea580c"'

cmp -s "$mobile_brand" "$dashboard_brand" || fail 'dashboard brand icon must match mobile icon.svg'

if rg -n --glob '*.tsx' '>\s*HP\s*<' "$repo_root/apps/dashboard/src" >/dev/null; then
  fail 'textual HP placeholder remains in dashboard UI'
fi

if rg -n --glob '*.tsx' \
  'button-(primary|secondary|quiet|danger)|reports-(button|field|badge)' \
  "$repo_root/apps/dashboard/src" >/dev/null; then
  fail 'legacy dashboard visual classes remain in React components'
fi

if rg -n --glob '*.tsx' --glob '!**/*.test.tsx' 'font-extrabold' \
  "$repo_root/apps/dashboard/src" >/dev/null; then
  fail 'dashboard production UI must not exceed the mobile 700 weight ceiling'
fi

# Prevent dashboard-local design-system forks from returning.
expect_not_contains "$dashboard_css" '--paper:'
expect_not_contains "$dashboard_css" '--ink:'
expect_not_contains "$dashboard_css" '.skip-link'

dashboard_css_files="$(find "$repo_root/apps/dashboard/src" -type f -name '*.css' -print)"
[[ "$dashboard_css_files" == "$dashboard_css" ]] ||
  fail 'globals.css must be the only authored dashboard CSS file'

if rg -n --glob '*.tsx' '<style|style\s*=' "$repo_root/apps/dashboard/src" >/dev/null; then
  fail 'dashboard React components must use Tailwind utilities instead of authored CSS'
fi

# Token-only changes must rebuild every dashboard deployment target.
for workflow in "${deploy_workflows[@]}"; do
  expect_contains "$workflow" 'packages/design-tokens/**'
done

printf 'PASS: dashboard follows the mobile visual contract\n'
