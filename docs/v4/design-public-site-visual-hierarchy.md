# Public site visual hierarchy refinement

Status: implemented.

## Context

The procurement homepage uses the established warm paper, navy ink, and
orange accent system. Its major sections are intended to alternate between
the base paper and a secondary paper tone, but `paper-2` is currently a
hand-written background utility. Tailwind opacity modifiers such as
`bg-paper-2/60` and `bg-paper-2/95` therefore produce no background color.

This leaves the section boundaries dependent on hairline rules and makes the
sticky navigation transparent over photographs. The hero also keeps a narrow
content width and a minimum height that makes the editorial image feel small
beside unused space on wide screens.

## Decision

Register `paper-2` as a semantic Tailwind color backed by the existing
secondary paper token. Keep the established palette and Inter typography; this
is a hierarchy correction, not a new visual system.

Preserve the two intentional orange roles. The logo and decorative brand fill
use the vivid `accent` token (`#e55d22`). Small text, icons, and compact buttons
use the darker `accent-ink` token because cream text on the vivid orange does
not meet normal-text contrast. The darker orange is therefore a legibility
variant, not a replacement brand color.

Use a fully opaque secondary-paper surface for the sticky header. Give its
three primary choices small Lucide icons: package search for procurement, a
clipboard list for site reporting, and a message bubble for contact. Keep the
text labels so the icons remain supporting cues rather than the only source of
meaning. Repeat the category cues in the mobile navigation.

Give every destination inside the procurement and site-reporting menus its own
small Lucide icon as well. Use the same icon-to-destination mapping in desktop
mega-menus and the mobile menu. The visible link text remains the accessible
name; these icons are decorative scanning cues, not replacement labels.

Alternate the homepage's major sections between the base and secondary paper
surfaces. Borders remain quiet secondary edges; the background change carries
the section hierarchy.

Make the hero's interior photograph the page's editorial signature. Use one
wide image composition with the title and supporting copy layered over it,
rather than dividing the hero into separate text and image columns. A navy
scrim provides a stable high-contrast text surface without hiding the room.
The scrim rises from the bottom on narrow screens and shifts to the left edge
on wider screens so it follows the copy placement.

Keep the title on one line at desktop widths. At narrower widths, let it wrap
naturally without authored line breaks, using a smaller mobile size that aims
for two balanced lines on a typical phone. The photograph fills the hero at
every breakpoint so there is no adjacent unused space.

At phone widths, let the hero run edge to edge and give it enough height to
remain the page's dominant image. Restore the inset card treatment from the
small breakpoint upward. Bound the procurement-lead portrait when it stacks,
then place it to the left of the biography from the medium breakpoint onward.
This keeps the portrait useful without letting it compete with the hero at
tablet and compact-laptop widths.

Keep every consideration control on the same grid track height. The selected
detail card also reserves one consistent footprint at each breakpoint, so
changing tabs never pushes the following content up or down.

Remove the generic “Project evidence” wrapper. Promote Selected factory
partners, What each quote includes, Product examples, Factory documents, and
Technical reviews into adjacent page sections with alternating paper tones and
second-level headings. Retain `#evidence` on the first evidence section for old
links, and retain `#factory-partners` as the navigation target inside it.

## Validation

Browser coverage must verify that:

- the sticky header has a non-transparent background after scrolling;
- the three primary navigation choices expose distinct decorative icons;
- every desktop and mobile menu destination exposes a matching decorative icon;
- adjacent homepage sections use different computed background colors;
- the hero copy overlaps the image and sits above a visible scrim;
- the hero image fills its visual frame;
- the desktop hero title renders on one line;
- the phone hero is full-bleed and remains visually larger than the bounded
  procurement-lead portrait;
- the procurement-lead portrait sits left of the biography from the medium
  breakpoint upward and stacks only below it;
- all consideration controls and all selected detail states keep equal heights
  at the supported viewport widths;
- the generic Project evidence heading is absent and every evidence group is a
  direct, alternately toned page section;
- the existing mega-menu, mobile-menu, keyboard, and fragment behavior stays
  unchanged;
- the homepage has no horizontal overflow at mobile width.

Run the site unit tests, type check, lint, production build, and focused
Playwright coverage. Inspect and capture the homepage at 1440, 1280, 1024,
768, and 390 CSS-pixel widths before delivery.
