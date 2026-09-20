# Public site procurement polish

Status: implemented.

## Context

The procurement home page has the correct content, but several sections have
uneven visual weight. The Product Examples cards are much taller than the
Factory Documents and Technical Reviews cards. The featured AIS factory card
also dominates the other partner examples. The two procurement profiles and
their contact actions interrupt the service and evidence sequence near the top
of the page.

Heading capitalization is inconsistent between the hero, section headings,
navigation, and footer. The hero photograph is also darker than necessary, and
the compact profile portraits leave the horizontal card dividers out of
alignment at wide viewports.

## Decision

Keep the established paper, navy, orange, and Inter visual system. This is a
hierarchy and consistency correction, not a redesign.

Use title case for marketing page titles, section headings, and navigation
labels. Keep sentence case for body copy, instructions, questions, status
messages, and action labels. Preserve official product, company, and document
names as written. Examples include **Luxury Interior Procurement in China**,
**Selected Factory Partners**, and **Contact Us**.

Keep all three Product Examples and their specification details, but present
them as one responsive row of compact cards at wide viewports. Reduce their
image height, heading size, padding, and gaps so the section has similar visual
weight to Factory Documents and Technical Reviews. Stack the cards on narrow
viewports.

Keep AIS as the featured factory example, but constrain the card to roughly
half its previous visual area on wide screens. Keep the other four factory
cards and all existing source content unchanged.

Place the procurement considerations and all evidence sections directly after
the hero. Move both procurement profiles after Technical Reviews, followed by
Contact Us as the final page section. Keep existing fragment identifiers so
navigation and old links continue to work.

Increase both profile portraits by about 40 percent. Stack each portrait above
its profile copy on the narrowest screens, then place it beside the copy when
space permits. Show the two cards side by side only when the larger portraits
fit comfortably. At side-by-side widths, use the equal portrait row to align
the credential dividers horizontally.

Lighten the navy hero scrim slightly at every breakpoint while preserving
readable white text over the image. Let the title wrap naturally at compact
laptop widths, then keep it on one line from the wide desktop breakpoint.

## Validation

Browser coverage must verify that:

- marketing headings and matching navigation labels use title case;
- the page order is hero, considerations, evidence, profiles, then contact;
- Product Examples forms one compact row at wide viewports and remains stacked
  without horizontal overflow on mobile;
- the featured factory card occupies no more than about two thirds of the
  evidence content width at wide viewports;
- both profile portraits are square and approximately 40 percent larger than
  the previous thumbnails;
- profile credential divider lines align when the cards are side by side;
- Contact Us remains the last section before the footer;
- the hero photograph is more visible while its title remains readable; and
- existing navigation, evidence dialogs, contact actions, and fragment links
  continue to work.

Run the site unit tests, type check, lint, production build, and focused
Playwright coverage. Inspect the procurement page at 1440, 1280, 1024, 768,
and 390 CSS-pixel widths before delivery.
