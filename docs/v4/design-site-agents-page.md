# Static procurement agents page

Status: implemented.

## Context

The supplied procurement website concept establishes a useful hierarchy for
the Agents page: explain the procurement journey first, then introduce the
people who can guide it. Its forms, live availability, scheduling controls,
newsletter, pricing, and service-booking content are not part of this revision.

The page must not claim supplier relationships, factory coverage, fees,
turnaround times, testimonials, guaranteed outcomes, or live service state.

## Decision

Keep the existing `/agents` route and **Agents** links in the public header,
mobile menu, footer, and sitemap. Replace the single-agent lead-generation page
with a static overview that presents the procurement journey and two agent
profiles without a page-specific call to action.

The page contains only authored HTML and checked-in assets. It does not add
selection state, live availability, meeting controls, forms, authentication,
checkout, API calls, or a content-management dependency.

## Content

The page presents:

- a short hero explaining what a procurement agent coordinates, paired with an
  original editorial interior image;
- eight ordered stages from choosing an agent through sign-off;
- original material-review and production images that clarify the physical
  procurement work;
- profile cards for Haruna Bayoh and Hashy, showing focus, education, and
  experience;
- Haruna's existing checked-in portrait and a neutral monogram for Hashy,
  because the reference does not provide a second portrait.

Profile facts and process labels come from the supplied concept. The page does
not invent missing names, photos, contact details, or availability.

## Visual direction

Reuse the site's warm-paper, navy, and orange tokens, Inter typography, spacing,
cards, header, and footer. Add three checked-in, original editorial photographs
that echo the supplied concept's warm, architectural mood without reproducing
its source photography: a contemporary interior, hands reviewing material
samples, and a clean furniture workshop. The images contain no embedded text,
logos, availability claims, or controls.

The layout is one column on small screens and expands into compact grids on
larger screens. Ordered cards make the process readable without connector
lines, JavaScript, or animation.

## Discovery and validation

`/agents` remains in the sitemap. Browser coverage verifies one clear page
heading, eight ordered steps, three optimized editorial images with meaningful
alternative text, two agent profiles, shared desktop/mobile navigation, the
absence of forms and booking controls, and no horizontal overflow at a 390 px
viewport.

Run the public site's tests, type check, lint, production build, and Playwright
suite before merging to `dev`.
