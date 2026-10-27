# Procurement menu with two page links

Current URL and source ownership is defined by
[product URL organization](design-site-product-url-organization.md). That
later decision supersedes the route and source paths below; the content and
interaction requirements still apply.


## Decision

The user clarifies that only the header's Procurement destinations should
shrink: the homepage (`/`, retaining the Procurement Overview label) and How
to Buy from China (`/how-to-buy-from-china`). Restore
the styled Procurement and Site Reporting dropdowns from commit `112a01b9`,
including their icons, descriptive panels, native disclosures, and existing
hover, click, outside-click, Escape, and destination-link behavior. Keep the
4rem sticky masthead, Inter wordmark, and separate Contact Us button.

The desktop Procurement panel has exactly those two page links. Keep its
existing introduction and use two destination columns when space permits.
Restore every previous desktop Site Reporting link: Harpa Pro App (`/app`),
Guides (`/docs`), Roadmap (`/roadmap`), and Get the App (the existing App Store
URL). Keep the same styling and destinations; do not flatten these into peer
page links.

Restore the grouped mobile menu and its toggle. The Procurement group contains
Procurement Overview and How to Buy from China only. Site Reporting retains its
three previous mobile destinations: Harpa Pro App, Guides, and Roadmap.
Preserve native disclosure access without JavaScript and destination-link
closing when the enhancement script runs.

Restore the entire footer from `112a01b9`: brand and service description,
Procurement links, Site Reporting links, Company links, and copyright. The
two-link limit applies to the header Procurement group, not the footer. Keep
the footer's Overview, considerations, factory examples, buying guide, contact,
app, guides, roadmap, account deletion, privacy, and company contact links.

This clarified scope replaces the earlier flat two-link header and footer
decision. It refines Procurement destinations in
[product navigation](design-public-site-product-navigation.md) while retaining
the dropdown interactions in
[mega navigation](design-public-site-mega-navigation-and-evidence-disclosure.md).
Keep the existing luxury masthead and porcelain footer on procurement routes,
and the existing light styling on other routes.

Page content, contact actions, article contents links, documentation sidebars,
sitemap entries, and direct routes keep their existing behavior. Navigation
works without JavaScript and retains visible keyboard focus. Add no dependency
or new navigation abstraction.

## Validation

Verify exactly two Procurement destinations in desktop and mobile navigation,
all previous Site Reporting destinations, the separate desktop Contact Us
button, and the restored footer groups. Exercise hover switching, click,
outside-click close, Escape with focus restoration, keyboard activation, and
mobile destination navigation. Check native disclosures without JavaScript,
the 4rem masthead, visible focus, and no overflow at 320, 390, 768, and 1440
CSS pixels. Preserve the guide's six contents links. Run site unit tests,
lint, typecheck, build, browser coverage, and sitemap/direct-route checks.
