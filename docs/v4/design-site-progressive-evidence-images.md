# Progressive evidence images

Status: implemented.

## Context

The procurement evidence cards already use Astro's responsive WebP output and
lazy loading. Their full-view dialog does not: it starts with an empty image
and fetches the source-size asset only after the visitor selects a card. On a
slower connection, the dialog therefore appears before its image.

## Decision

Open the dialog with the selected card's already-loaded responsive image. Keep
that preview slightly blurred while a separate image element fetches and
decodes the full source. Replace the preview only after decoding completes so
the dialog never flashes blank.

The preview comes from the clicked image's `currentSrc`; do not generate or
ship a second placeholder asset. Keep the preview if the full image fails to
load. Closing the dialog invalidates the pending replacement so a late request
cannot update a later dialog view.

Give the above-the-fold hero image high fetch priority through Astro's image
component. Keep consideration and evidence images lazy because they are below
the fold; the selected consideration still loads when its section approaches
the viewport.

## Validation

Browser coverage delays the full source request and verifies that the dialog
shows the card image first, marks the image region busy, and switches to the
full source only after that request completes.
