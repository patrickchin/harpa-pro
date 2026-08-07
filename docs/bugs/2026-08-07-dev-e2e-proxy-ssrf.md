# 2026-08-07 — dev E2E proxies trusted device-controlled URLs

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** CodeQL reported two critical request-forgery flows in the local
Maestro API/R2 bridge, two high-severity incomplete hostname checks, and four
high-severity polynomial regular expressions in AI-fixture utilities. A caller
reaching an `adb reverse` port could send an absolute-form API target or an
arbitrary R2 `url` and make the developer host open the request.

**Root cause.** The loopback-only helpers treated the Android device as trusted.
The API proxy let `new URL(requestTarget, base)` replace the configured origin,
the R2 proxy accepted any scheme and host, and the JSON rewriter used substring
hostname checks. Separately, three end-anchored trailing-slash regexes and one
edge-trimming alternation retried across long attacker-influenced strings.

**Fix.** Pin API requests to the operator-configured HTTPS origin and accept
only relative paths. Forward R2 requests only when they use `GET`, `HEAD`, or
`PUT` with a SigV4 query on an exact Cloudflare R2 hostname suffix, without
credentials, fragments, or custom ports. Keep the outbound transport fixed to
HTTPS and do not follow redirects. Replace the four polynomial regex paths with
single-pass character scans.

**Test.** `dev-e2e-proxy-security.test.cjs` starts both real proxy factories,
proves absolute and loopback targets fail before an outbound request, and pins
signed-R2/lookalike behavior. AI-fixture tests feed 20,000-character adversarial
runs through every affected path and enforce a generous bounded-runtime guard.

**Pattern.** No new R pattern. This is a local-network variant of
[Pitfall 20](../v4/pitfalls.md#pitfall-20--dev-only-routes-need-defence-in-depth-not-a-node_env-gate):
dev-only surfaces still require per-request allowlists and fail-closed tests.
