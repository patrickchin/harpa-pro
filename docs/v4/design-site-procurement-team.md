# Procurement team profiles

Status: implemented.

## Context

The procurement home page currently presents Haruna Bayoh as the only
procurement profile. Hashy is joining the public team presentation as a
procurement specialist with four years of experience in procurement and
logistics.

This change supersedes the single-profile constraints in
[`design-site-agents-page.md`](design-site-agents-page.md) while preserving the
rest of that page specification.

## Decision

Keep the existing `#agent` section and place two full-width profile cards in a
single vertical flow. Haruna remains **Procurement Lead** and keeps his
credentials, portrait treatment, and LinkedIn link. His responsibilities are
technical coordination, order control, and document records.

Add Hashy as **Procurement Specialist** using the supplied portrait. Show the
provided facts exactly:

- name: Hashy;
- discipline: Procurement & Logistics;
- education: Bachelor's degree;
- experience: 4 years.

Assign Hashy responsibility for factory coordination and shipping logistics.
Do not invent a surname, other biography details, additional capabilities,
contact details, or social links.

The profiles must not duplicate ownership. Haruna's biography and capability
list exclude factory coordination and shipping logistics; Hashy's profile
shows those two responsibilities.

Keep the profiles as individual role-led articles rather than a comparison or
selection interface. On narrow screens, each portrait stays above its profile
copy. From the medium breakpoint upward, each portrait sits to the left of its
copy. The procurement hero remains visually larger than either portrait.

The shared contact section remains immediately after the profile group. Its
published email address and WhatsApp details do not change.

## Images

Store the supplied Hashy portrait with the existing team assets and render it
through Astro's responsive image pipeline. Use her name as the image alternative
text. Crop with `object-fit: cover` while keeping her face visible at supported
breakpoints.

## Validation

Browser and source coverage must verify that:

- the profile group contains Haruna and Hashy once each;
- Haruna remains **Procurement Lead**;
- Hashy is titled **Procurement Specialist**;
- Hashy's discipline, bachelor's degree, and four years of experience are
  visible;
- Hashy owns factory coordination and shipping logistics;
- Haruna owns technical coordination, order control, and document records,
  without duplicating Hashy's responsibilities;
- no unsupported Hashy details are introduced;
- each profile stacks on phones and uses portrait-left layout from the medium
  breakpoint upward;
- the hero remains larger than either portrait;
- the page has no horizontal overflow at supported viewport widths;
- the contact section still follows the profile group.

Run the site unit tests, type check, lint, production build, and focused
Playwright coverage before delivery.
