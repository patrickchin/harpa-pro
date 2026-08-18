# 2026-08-07 — Firefox screenshot dialog uses intrinsic image width

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The documentation screenshot dialog wrapped its portrait image in
Chromium but remained almost full-width in Firefox, leaving hundreds of pixels
of empty space beside the image.

**Root cause.** The first repair used `width: fit-content` on a grid panel.
Chromium based that intrinsic width on the image after its viewport-height
constraint, while Firefox contributed the image's much wider intrinsic width
before applying the height fit. The Playwright project ran Chromium only, so
the browser difference escaped the regression.

**Fix.** Size the shared 1290 × 2796 portrait layout entirely in CSS from its
aspect ratio and viewport-bound height. Add Firefox to the site Playwright
projects and CI browser installation; reject script-driven panel geometry with
a source guard.

**Test.** At 1366 × 768 and 1920 × 1080, the shared dialog journey now runs in
Chromium and Firefox and requires the panel to be no more than 32 pixels wider
than the rendered screenshot. A unit test enforces both the CSS-only boundary
and the shared screenshot dimensions that support it.

**Pattern.** No existing numbered pattern; keep browser-dependent intrinsic
sizing under multi-browser E2E coverage.
