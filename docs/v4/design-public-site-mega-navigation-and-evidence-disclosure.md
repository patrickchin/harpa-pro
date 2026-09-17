# Public site mega navigation and evidence disclosure

Status: accepted for implementation.

## Context

The public site presents two separate offers: procurement in China and the
Harpa Pro site-reporting app. Procurement remains the main offer, but the
shared navigation must make both offers clear. The current narrow disclosure
does not close when a visitor clicks elsewhere, and it hides the fact that
site reporting is an app.

The procurement page also gives the same visual weight to every factory and
every supplied document. This makes example material look like a directory and
creates a long page. Full factory documents are currently available as public
downloads even though the website only needs selected preview images.

## Navigation

Use two full-width desktop disclosures: **Procurement** and **Site reporting**.
Each disclosure spans the header and groups related destinations in a compact
panel. The Site reporting panel names the **Harpa Pro app** explicitly.

The desktop disclosures use native `details` and `summary` elements so their
links remain available without JavaScript. A small enhancement must:

- open a disclosure on fine-pointer hover or click;
- keep only one disclosure open;
- close it after a click outside the header or on a destination link;
- close it on Escape and return focus to its summary;
- preserve normal link navigation and keyboard behavior.

Do not use application-menu roles. These are groups of website links. The
mobile header keeps a compact grouped disclosure and names the first
site-reporting destination **Harpa Pro app**.

## Site reporting page

The root route `/` owns the complete procurement presentation: introduction,
Haruna's profile, procurement considerations, project evidence, factory
examples, document previews, and contact details. Do not place a site-reporting
promotion or app overview in the homepage body. Site reporting remains visible
in the shared navigation and lives under `/app`.

Treat `/` as the canonical procurement URL. All procurement navigation links
and fragments start at `/`, `/procurement` redirects to `/`, and the sitemap
lists only the canonical route. Legacy document redirects point to
`/#evidence`.

Keep the app presentation under `/app`, including the local voice-note
demonstration, reporting workflow, feature summary, team information,
questions, and links to guides and the roadmap. Use a dedicated site-reporting
hero so it stays separate from procurement.

The restored page must remain static. Do not restore the waitlist, Turnstile,
form submission, account controls, or any other server-backed action. Review
the restored text for current facts, direct language, and a simple heading
hierarchy.

## Factory examples

Call the partner section **Selected factory partners** and state that it shows
examples rather than a complete directory. Keep AIS as a short, full-width
feature. Show the other four partners as compact cards with one image, the
factory name, location, and product scope. Remove numbered labels and repeated
blocks about source files and internal use.

## Factory document previews

Show three visually different document previews before the disclosure:

1. Marine HDF formaldehyde test;
2. Hot-melt adhesive RoHS test;
3. J2S sofa E1 certificate.

Place the other seven previews under **Show 7 more documents**. Keep all ten
records and their source-package labels on the page. The expanded control must
also offer **Show fewer documents**.

The evidence dialog shows only the selected preview image and its caption.
Remove links and data attributes for original documents. Remove the original
files from the public site. Redirect old `/documents/factories/*` requests to
`/#evidence`; do not return a document body.

A visitor can still save an image that the browser displays. This design stops
the site from publishing the full source files; it does not claim to prevent
capture of the preview images or remove files from old immutable deployments.

## Validation

Browser coverage must verify:

- the complete procurement presentation is on `/` with no site-reporting
  promotion in the page body;
- procurement navigation uses root-relative fragments, `/procurement`
  redirects to `/`, and the sitemap has no duplicate procurement route;
- both desktop mega panels and the explicit **Harpa Pro app** destination;
- hover switching, outside-click close, Escape close with focus restoration,
  keyboard activation, and one open panel at a time;
- no horizontal overflow at a 390-pixel viewport;
- the restored `/app` sections, local demonstration, and resource links;
- no waitlist, form, Turnstile, or API action on `/app`;
- compact example-factory presentation and its non-exhaustive wording;
- three visible document previews before expansion and all ten afterward;
- image-only evidence dialogs with no original-document link;
- old factory-document URLs redirect away from the removed files.

Run the site unit tests, type check, lint, production build, and Playwright
suite. Inspect the desktop and mobile pages before opening the pull request.
