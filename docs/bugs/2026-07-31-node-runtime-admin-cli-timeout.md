# 2026-07-31 — Node runtime drift hid an admin CLI network timeout

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** `admin:set-password` repeatedly failed after five seconds with
`Connection terminated due to connection timeout`, while `psql` and a
Homebrew Node 26 process could reach the same Neon database.

**Root cause.** The repository had no local Node selector, most CI and the Fly
image used Node 22, and three OTA workflows used Node 20. NVM therefore kept
Node 22 active while Homebrew installed Node 26 as a `neonctl` dependency.
On this network, Node 22 and 24's default network-family autoselection stalled
when Neon returned both IPv4 and IPv6 addresses but IPv6 was unreachable.
Direct IPv4 TLS connections worked; selecting IPv4 first and disabling
autoselection made five consecutive Node 24 queries pass.

**Fix.** Standardize local development, CI, Fly, EAS, and engines on Node
24.19.0. Make the provisioning CLI select IPv4 first and disable
network-family autoselection only for its short-lived process, leaving the
deployed API default unchanged.

**Test.** `scripts/ci/__tests__/node-version-policy.test.sh` prevents runtime
pin drift and must run in the required `lint-typecheck` context even for a
selector-only change. `admin-cli-network.test.ts` verifies the provisioning
process disables the failing connection strategy.

**Pattern.** Configuration drift plus a manual-only operational path; no
existing pattern number.
