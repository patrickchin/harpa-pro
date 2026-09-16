# Static procurement agents page

## Goal

Add a public `/agents` page that borrows the procurement concept's
information hierarchy without copying its visual design. The page should lead
with the procurement journey, then introduce the people who can guide it. It
must remain recognisably Harpa Pro through the existing warm-paper palette,
Inter type, spacing, cards, header, and footer.

## Page structure

1. A short hero explains the audience and the role of a procurement agent.
2. An eight-step ordered overview runs from choosing an agent through sign-off.
3. Two informational profile cards show each agent's focus, education, and
   experience.

The layout is one column on small screens and expands into compact grids on
larger screens. The ordered steps remain readable without relying on connector
lines or animation.

## Content source

The profile facts and process labels come from the supplied procurement
website concept PDF. Haruna uses the existing checked-in team portrait. Hashy
uses a neutral monogram because the reference does not provide a portrait.

## Static scope

The page contains only authored HTML and checked-in assets. It does not add:

- agent selection state or live availability;
- meeting or scheduling buttons;
- sign-up, contact, newsletter, or enquiry forms;
- pricing, checkout, authentication, or API calls;
- service-booking flows or a content-management dependency.

The shared site navigation links to the page. Existing outbound links elsewhere
on the site are unchanged.

## Acceptance checks

- `/agents` exposes one clear page heading, eight ordered steps, and two agent
  profiles.
- The profile facts match the supplied concept.
- No form, booking control, availability state, or backend-dependent action is
  present.
- The page has no horizontal overflow at a 390 px viewport.
- The site header and footer expose a normal link to `/agents`.
