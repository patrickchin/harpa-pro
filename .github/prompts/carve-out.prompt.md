---
description: "Capture a carve-out (deferred scope) in the right plan doc so it doesn't get silently lost. Required by overnight-protocol §3."
mode: edit
---

I'm carving scope out of the current task. Record it properly:

1. Identify the active phase from `docs/v4/plan-p*.md` (most recent
   in-progress checkbox).
2. Append a carve-out entry under the task's "Carve-outs" subsection
   with:
   - **What** — one-line description of what is NOT being done.
   - **Why** — reason for deferral (out-of-scope / dependency /
     ambiguity).
   - **Where it lands** — link to the future plan task or a new
     follow-up checkbox.
3. If the carve-out introduces a known pitfall risk, cross-link
   `docs/v4/pitfalls.md`.
4. Update the commit body so the carve-out shows up there too
   (AGENTS.md hard rule #3 — docs in same PR).

Carve-out: ${input:description}
