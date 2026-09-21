# 2026-09-20 — Tailwind custom color opacity disappeared (Pattern R21)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The sticky public-site header showed photographs through its
surface, so navigation labels became hard to read while scrolling. Intended
secondary-paper section bands also rendered with the page background.

**Root cause.** `bg-paper-2` was a hand-written CSS utility rather than a
Tailwind theme color. Tailwind therefore could not generate opacity modifiers
such as `bg-paper-2/95` or `bg-paper-2/60`; those class names had no matching
CSS rule and the elements stayed transparent.

**Fix.** Register `paper-2` in `@theme inline`, use the solid semantic surface
for the sticky header and section bands, and remove the competing hand-written
utility.

**Test.** The public-site Playwright coverage asserts that the header's
computed background is non-transparent and that adjacent homepage sections
have different computed background colors.

**Pattern.** New pattern R21 — added to `README.md`.
