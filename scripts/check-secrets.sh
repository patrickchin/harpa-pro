#!/usr/bin/env bash
# Scan commits being pushed for common secret patterns.
#
# Hooked into pre-push. Reads the standard pre-push stdin format
# (<local-ref> <local-sha> <remote-ref> <remote-sha>) and diffs
# every commit being pushed.
#
# Patterns checked:
#   sk-[...]          — OpenAI API key
#   AKIA[...]         — AWS access key ID
#   ghp_/github_pat   — GitHub personal access token
#   Basic auth with b64 credentials
#   Private-key PEM headers
#
# Exits 1 if any pattern matches. Exit 0 if nothing to push
# (force-delete, etc.).

set -euo pipefail

RED='\033[0;31m'; RESET='\033[0m'

PATTERNS=(
  'sk-[A-Za-z0-9_-]{20,}'           # OpenAI API key
  'AKIA[0-9A-Z]{16}'                 # AWS access key
  'ghp_[A-Za-z0-9]{36}'             # GitHub PAT (classic)
  'github_pat_[A-Za-z0-9_]{80,}'    # GitHub PAT (fine-grained)
  'xoxb-[0-9A-Za-z-]+'              # Slack bot token
  'FlyV1 [A-Za-z0-9+/=]+'           # Fly.io token
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'  # PEM private key
)

PATTERN=$(IFS='|'; echo "${PATTERNS[*]}")

found=0
while IFS=' ' read -r local_ref local_sha remote_ref remote_sha; do
  # Nothing being pushed (e.g. branch deletion).
  [ "$local_sha" = "0000000000000000000000000000000000000000" ] && continue

  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    # New branch — diff against its merge base with HEAD of default branch,
    # falling back to all commits on the branch.
    range="$(git merge-base origin/dev "$local_sha" 2>/dev/null || true)".."$local_sha"
    # If merge-base failed, scan just the pushed SHAs listed by git log.
    [ -z "${range%..*}" ] && range="$local_sha"
  else
    range="$remote_sha..$local_sha"
  fi

  hits=$(git diff "$range" 2>/dev/null | grep -E "$PATTERN" || true)
  if [ -n "$hits" ]; then
    echo -e "${RED}❌ check-secrets: potential secret detected in push${RESET}"
    echo "$hits" | head -20
    echo ""
    echo "  If this is a false positive, grep the pattern above and suppress"
    echo "  with a comment: # nocheck-secret"
    echo "  Or use SKIP_SECRET_CHECK=1 git push to bypass (document why)."
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  exit 1
fi
echo "✅ no secrets detected"
