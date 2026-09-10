# Public site sourcing agent page

Status: draft for development review.

## Context

Harpa Pro's public site currently describes the reporting product and the two
people behind it. It does not explain that Haruna Bayoh can also help buyers
outside China source goods through a local, person-to-person service.

The first revision must be useful without inventing details that have not yet
been supplied by Haruna. In particular, it must not claim specific supplier
relationships, factory coverage, fees, turnaround times, testimonials, or
guaranteed outcomes.

## Decision

Add a dedicated `/agents` route and link it as **Agents** in the public header
and footer. Keep the name even though it may overlap with AI terminology; the
page immediately clarifies that this is a human sourcing service.

The audience is a buyer outside China who has a product in mind but needs a
trusted person in China to help find suppliers, gather evidence, and coordinate
the next step. The page has one job: invite that buyer to send a sourcing brief.

## Content

The page presents:

- a direct hero introducing Haruna as a human sourcing contact in China;
- a four-stage service outline: share the brief, search and compare, check and
  document, and coordinate logistics;
- Haruna's existing public biography and portrait;
- a short expectation note that scope, location, timing, and fees are agreed
  before work begins;
- an email call to action using the site's existing public contact address.

Copy uses "can help" and "where practical" for work that depends on the
product, supplier location, and agreed scope. It does not present draft service
details as unconditional guarantees.

## Visual direction

Reuse the site's warm-paper, navy, and orange tokens and its Inter typography.
The page should feel like a concise buyer's field brief: a large plain-language
thesis, Haruna's portrait as the primary evidence, and the sourcing stages set
as a connected route rather than generic feature cards. Monospaced route labels
provide a second utility voice without adding a font dependency.

The memorable element is the route from the buyer's brief to documented local
checks. Decoration stays restrained so the person and the process remain the
focus. The page is responsive, keyboard accessible, usable without JavaScript,
and respects the site's existing focus treatment.

## Discovery and validation

Add `/agents` to the sitemap. Browser coverage verifies the route's title,
human-service clarification, sourcing sequence, contact link, desktop and
mobile navigation, and absence of horizontal overflow at a phone viewport.

Run the public site's tests, type check, lint, production build, and Playwright
suite before merging to `dev`.
