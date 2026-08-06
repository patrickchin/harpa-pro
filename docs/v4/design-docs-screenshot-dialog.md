# Design — documentation screenshot dialog

Status: approved on 2026-08-05.

## Context

Guide screenshots are displayed as focused landscape crops. The original
full-screenshot action followed a direct image link, which removed the guide
context and made returning to the same step depend on browser navigation.

## Decision

Keep each crop as a normal link to the complete image so the fallback works
without JavaScript. When JavaScript and the native browser dialog API are
available, intercept that link and open one shared modal dialog on the guide
page instead.

The dialog must:

- show the complete uncropped screenshot without navigating away;
- preserve native link behavior for modified and non-primary clicks, including
  opening the raw image in a new tab;
- expose a contextual accessible name and preserve the image alt text;
- provide a visible close button;
- close with the `Escape` key or a backdrop click;
- return focus to the screenshot link that opened it; and
- scale the complete screenshot into the available image area without internal
  scrolling on a 1440 × 900 desktop viewport, while preserving its aspect
  ratio and keeping the dialog viewport-bound at smaller sizes.

The image URL is assigned only when the dialog opens. This avoids loading each
full-resolution screenshot during the initial guide render.

## Validation

Playwright opens a guide screenshot, verifies that the guide URL does not
change, checks the dialog image and accessible name, closes it through the
button, and repeats the flow with `Escape`. Existing tests continue to assert
that every trigger retains a valid full-image `href` for the no-JavaScript
fallback. A modified-click test verifies that the browser can still open the
raw image in a new tab without opening the dialog. The desktop regression also
checks that the image area does not overflow, that all four image bounds stay
inside it, and that the rendered image keeps its intrinsic aspect ratio.
