# 2026-10-15 — WhatsApp contact link omitted the final digit

> See [README.md](README.md) for the index of all bug entries and patterns.

**Symptom.** The procurement page displayed `+86 193 7283 7269`, but its
WhatsApp button targeted `861937283726`, omitting the final `9`.

**Root cause.** The display number and URL were entered separately. Existing
tests asserted the same truncated URL rather than checking their agreement.

**Fix.** Align the URL with the complete displayed number. This local change
requires the normal deployment workflow before the live site is corrected.

**Test.** The contact browser test derives the expected WhatsApp URL from the
visible number. The source smoke assertion requires the complete href.

**Pattern.** Manually checked link mismatch despite existing green assertions;
no new cross-project pattern assigned.
