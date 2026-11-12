# 2026-11-12 — Thumbnail checks reject fractional browser measurements

> See [`README.md`](README.md) for the recurring-bug index.

**Symptom.** The site-preview browser check for PR #516 failed in Firefox
on all three attempts, although the thumbnail remained visually square.
Chromium checks passed.

**Root cause.** The test compared floating-point DOM dimensions with exact
equality. Firefox returned a height of `159.9998779296875` for an image whose
width was `160`, a difference below one thousandth of a CSS pixel.

**Fix.** Compare both the target width and square aspect ratio with
`toBeCloseTo(..., 2)`. Keep the original dimensions, side-by-side layout,
overflow, and asset-delivery assertions. No page styling changes are needed.

**Test.** Run the existing procurement browser test in Chromium and Firefox
through the site-preview workflow. The same dimension checks retain
two-decimal precision instead of relying on identical floating-point values.

**Pattern.** Cross-browser layout verification must account for subpixel
measurement differences. See the earlier
[Firefox layout regression](2026-08-07-firefox-screenshot-dialog-intrinsic-width.md).
