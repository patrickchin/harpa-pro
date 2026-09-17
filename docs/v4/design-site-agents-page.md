# Procurement-first public site

Status: implemented.

## Context

Harpa Pro now presents two products on the public site. The procurement service
is the primary product. The site-reporting app is a secondary product.

Haruna Bayoh is the only procurement agent. The site must not ask visitors to
choose or compare agents. It must also remain a static site. Forms, booking,
live availability, accounts, checkout, and other server-backed features are not
part of this revision.

The site must not claim supplier relationships, factory coverage, fees,
turnaround times, testimonials, guaranteed outcomes, or live service state.

## Decision

The home page will introduce Haruna and the procurement service first. Its main
action will open `/agents`. A short app section will follow the procurement
introduction and link to the existing App Store page.

The shared header will use **Meet Haruna** as its main action. The app will use a
plain navigation link. The footer will use the same product order.

The `/agents` page will introduce Haruna as the visitor's agent. It will contain
one profile and no selection or comparison language.

## Procurement journey

The page will describe eight stages:

1. Meet Haruna.
2. Match the right factory.
3. Place the order.
4. Track production.
5. Check quality.
6. Prepare shipment.
7. Follow delivery.
8. Complete the handover.

On large screens, the stage names will form a vertical list on the left. The
selected stage will show a short description and an image on the right. On
small screens, the list will appear above the detail panel.

The control will use an accessible tab pattern and a small local script. It
will not make a network request or store user data. The first stage will remain
visible if the script does not run.

## Images

Reuse the checked-in Haruna portrait, interior image, production-floor image,
and quality-control image. A stage can reuse an image when it represents the
same part of the work. This keeps the page small and avoids decorative images
that do not add information.

The factory images must continue to show ordinary furniture production in
China. They must not look like boutique workshops or idealized showrooms.

## Writing

Use short sentences, active voice, and one name for each part of the service.
Remove marketing filler and unsupported claims. Keep each stage description to
one or two sentences.

## Validation

Browser coverage will verify:

- procurement and Haruna are the main home-page subject;
- the app appears as a secondary section;
- all eight journey stages have a short description and an image;
- mouse and keyboard input change the selected stage;
- the page contains one Haruna profile and no agent-choice language;
- the page contains no forms, booking controls, or API links;
- the shared navigation works without horizontal overflow at 390 px.

Run the site unit tests, type check, lint, production build, and Playwright suite
before the pull request is ready for review.
