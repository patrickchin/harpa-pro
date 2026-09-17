# Public site product navigation

Status: implemented.

## Context

The public site contains two separate Harpa Pro offers:

- interior procurement in China;
- the Harpa Pro construction reporting app.

Procurement is the primary offer. The app is secondary, but its guides and
roadmap currently appear beside procurement without enough context. The home
page also links to a missing procurement fragment, and some factory source
links no longer resolve safely.

The procurement evidence gallery opens full images as raw asset pages. This
takes the visitor away from the evidence and makes it harder to compare a
drawing or certificate with its caption.

## Decision

Use `/procurement` as the procurement URL. The former `/agents` route is not
preserved because the site has no established traffic or external links. Add
`/app` as a compact app overview. Do not restore the old waitlist or other
server-backed controls.

The shared header uses explicit links instead of a dropdown:

- **Procurement** opens `/procurement`;
- **App** opens `/app`;
- **App guides** opens `/docs`;
- **App roadmap** opens `/roadmap`;
- **View evidence** opens `/procurement#evidence`.

The mobile menu and footer make the relationship clearer with separate
**Procurement** and **Harpa Pro app** groups. The footer also includes a small
**Company** group for privacy and contact links.

The home page remains procurement-first. Its app section is a short secondary
summary that links to `/app` and the App Store. The app page contains only the
current Capture, Draft, and Review workflow plus links to the app guides and
app roadmap.

`/docs` is labelled **Harpa Pro app guides** in its page heading, sidebar, and
breadcrumbs. `/roadmap` is labelled **Harpa Pro app roadmap**. Their URLs stay
unchanged to preserve existing links.

## Evidence image dialog

Technical-review images and supplied-record scans open in one shared native
`<dialog>`. The dialog:

- keeps the visitor on the procurement page;
- shows the source-size image without cropping;
- uses the image title as its accessible name;
- closes from its button, Escape, or a backdrop click;
- returns focus to the image trigger;
- clears the full-size image after closing.

The triggers are buttons, not raw-asset links. The dialog is a local static
enhancement and makes no network request other than loading the selected image.
Its layout is viewport-bounded and supports both landscape drawings and
portrait certificates.

## Link integrity

The home procurement link targets `/procurement#considerations`. Factory
source links use current HTTPS pages that resolve without a certificate error.

Browser coverage reads the sitemap, visits every listed page, checks every
same-origin link and asset for a response below 400, and verifies that each
same-origin fragment names an element on its destination page. External links
are checked manually because third-party DNS and bot controls are not stable
enough for CI.

## Validation

Run the site unit tests, type check, lint, production build, and Playwright
suite. Browser coverage verifies the product grouping at desktop and mobile
widths, the `/app` overview, mixed-aspect evidence dialogs, focus restoration,
and all sitemap-discovered internal links and fragments.
