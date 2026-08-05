# 2026-08-05 — Cloudflare Pages queue exceeded verifier timeout

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Exact-SHA `dev` and pull-request Pages checks failed after about
15 minutes even though local builds, tests, and browser journeys were green.
The expected public, admin, and dashboard aliases appeared later with the
correct commit and branch markers.

**Root cause.** Cloudflare accepted the GitHub events immediately, but native
builds waited in provider queues for 18 to 47 minutes. Successful deployments
took up to 51 minutes from creation. The shared marker verifier allowed only
900 seconds, while its six `dev` and pull-request jobs had outer limits between
20 and 60 minutes. The checks therefore timed out before Cloudflare started or
finished valid builds.

**Fix.** Raise the shared marker wait to 4,500 seconds and set the public site,
admin site, and dashboard `dev` verification and pull-request deployment jobs
to 90 minutes. Keep the exact expected commit and branch as the success
boundary. Do not change provider branch filters, production activation, or any
production workflow. Production callers inherit the shared inner default, but
their unchanged 20-minute job limits remain the effective maximum.

**Test.** The Cloudflare Pages Git policy test requires the 4,500-second shared
default and the 90-minute limit inside each of the six affected jobs. Existing
script tests still cover exact marker matching, mismatch timeout, route checks,
and redirect boundaries. Shellcheck, actionlint, and the documentation link
check cover the edited shell, workflows, and references.

**Pattern.** A deployment poll must cover observed provider queue latency, not
only build duration. Its success condition must remain exact even when its wait
budget grows.
