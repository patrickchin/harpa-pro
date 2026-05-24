---
description: "Log a recurring bug under docs/bugs/ so the next session catches it on smell. Required by AGENTS.md."
mode: edit
---

Add a bugs-log entry for a bug we just fixed.

1. Create a new file `docs/bugs/YYYY-MM-DD-<short-slug>.md` following
   the structure documented in `docs/bugs/README.md` → "Detail-file
   structure". Include:
   - **Symptom** — what the user / test saw.
   - **Root cause** — one paragraph, with the specific file:line.
   - **Fix** — commit SHA or PR link.
   - **Test** — the new automated test that would have caught it.
   - **Pattern** — which Rn this maps to (or "new pattern Rn — added
     to README"). Include smell keywords inline so the next debugger
     can grep for them.
   - **Related pitfall** — if any from `docs/v4/pitfalls.md`.
2. Add a one-block summary entry (Symptom + Fix paragraphs) to the
   **Bugs** index in `docs/bugs/README.md`, linking to the new file.
   The summary alone should usually be enough — readers shouldn't
   need to open the detail file for the common case.
3. If this is the second+ occurrence of the same root cause, also
   add or strengthen the rule in the relevant
   `.github/instructions/*.instructions.md` so the agent flags it
   next time. If it warrants a new pattern, add an `Rn` section
   under **Patterns** in `docs/bugs/README.md`.

Bug: ${input:description}
