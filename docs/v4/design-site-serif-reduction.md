# Public site serif reduction

Status: implemented.

## Intent

The user requests less serif typography on the website. Keep Cormorant
Garamond as the homepage hero's single display accent. Use the existing
self-hosted Inter family for the rest of the procurement site. This makes
the repeated service and evidence headings easier to scan while retaining
the homepage's interiors character.

This document supersedes the broad serif heading assignments in the
[luxury experiment](design-site-luxury-experiment.md) and the serif guide
title and step headings in the
[buying guide design](design-site-how-to-buy-from-china.md). The
[homepage hero treatment](design-site-hero-navigation.md) still applies.

## Typography roles

| Role | Family and treatment |
| --- | --- |
| Homepage hero H1 | Existing Cormorant Garamond 500 and responsive scale |
| Homepage section H2s | Inter 500, tighter tracking, responsive 2–3rem scale |
| Closing contact H2 | Inter 500, responsive 2.5–4.5rem scale |
| Consideration panel H3s | Inter 500, about 1.75–2rem |
| Factory and product H3s | Inter 500, about 1.25–1.5rem |
| Team names | Inter 500, about 1.75rem |
| Buying guide H1 | Inter 500, responsive 2.5–4rem scale |
| Buying guide H2s | Inter 500, responsive 1.75–2.25rem scale |
| Procurement guide index H1 | Inter 500, responsive 2.5–4rem scale |
| Body, navigation, controls, wordmark | Existing Inter treatment |

Use the existing `--font-sans` token. Adjust size and line height together:
Inter has a larger apparent size than Cormorant, so directly replacing the
family at every old serif size would make the page too heavy. Use about
1.1–1.2 line height for headings, and check actual wrapping before settling
the final responsive values. Preserve semantic heading levels and content.

## Scope

Change the existing procurement CSS rules and shared `ProcurementGuide.astro`
styles so all procurement articles use the same sans-serif heading roles.
Retain the current layout, imagery, material controls, content, navigation,
palette, and reporting-site typography. No new dependency or font is needed.
Update browser assertions that currently require Cormorant for guide
headings; the homepage hero assertion continues to require Cormorant.

## Verification

Inspect homepage and buying guide at desktop, tablet, and phone widths.
Confirm the hero remains serif, repeated headings use Inter, headings have
comfortable wraps, and neither route overflows horizontally. Check contact,
factory, product, consideration, and team typography in the homepage body.
Run the relevant existing browser typography/layout checks, site typecheck,
lint, and static build. Record any check the local environment prevents.

Verified the production build at 1440, 768, and 390 pixels. Site lint,
typecheck, static build, and all 13 Chromium homepage/SEO checks passed.
The broader design inspector still flags existing decoration and text-size
issues; this typography change does not address those findings.
