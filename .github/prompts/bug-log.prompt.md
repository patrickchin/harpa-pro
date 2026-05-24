---
description: "Log a recurring bug in docs/bugs/README.md so the next session catches it on smell. Required by AGENTS.md."
mode: edit
---

Add a bugs-log entry for a bug we just fixed.

1. Open `docs/bugs/README.md` and follow the existing template/format.
2. Include:
   - **Symptom** — what the user / test saw.
   - **Root cause** — one paragraph, with the specific file:line.
   - **Fix** — commit SHA or PR link.
   - **Smell** — the keyword(s) that should make the next debugger
     check this entry first.
   - **Related pitfall** — if any from `docs/v4/pitfalls.md`.
3. If this is the second+ occurrence of the same root cause, also
   add or strengthen the rule in the relevant
   `.github/instructions/*.instructions.md` so the agent flags it
   next time.

Bug: ${input:description}
