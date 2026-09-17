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

Use `/` as the canonical procurement URL. Redirect `/procurement` to `/`; the
former `/agents` route is not preserved because the site has no established
traffic or external links. Use `/app` for the full static site-reporting
presentation. Do not restore the old waitlist or other server-backed controls.

The shared header names each offer by its purpose:

- **Procurement** opens a full-width panel with the procurement overview,
  consideration, example, evidence, and contact links;
- **Site reporting** opens a full-width panel with **Harpa Pro app**,
  **Guides**, **Roadmap**, and App Store links;
- **Contact Haruna** opens `/#contact`.

Do not show **App**, **App guides**, and **App roadmap** as three peer links.
They describe one product and compete with the primary procurement offer.

The desktop panels close when the visitor follows a link, clicks outside the
header, or presses Escape. Only one panel opens at a time. The mobile menu uses
separate **Procurement** and **Site reporting** groups. The first site-reporting
link is **Harpa Pro app** so the product type remains clear.

The home page contains the complete procurement presentation and no
site-reporting promotion in its body. Site reporting remains in the shared
navigation. The app page restores the static voice demonstration, reporting
workflow, features, team information, questions, and resource links from the
former home page. It does not restore the waitlist, Turnstile, or any
API-backed control.

`/docs` is labelled **Site reporting guides** in its page title and sidebar.
Its breadcrumbs use **Site reporting** and **Guides**. `/roadmap` is labelled
**Site reporting roadmap**. The URLs stay unchanged to preserve existing
links.

## Contact section

Add a static contact section at `/#contact`. The section identifies
Haruna as the procurement contact and gives three actions:

1. **Copy email** copies `haru@harpapro.com` and confirms the action on the
   page.
2. **Open email app** uses `mailto:haru@harpapro.com` as a secondary action.
3. **Message on WhatsApp** opens `https://wa.me/861937283726` in a new tab and
   displays `+86 193 7283 7269` beside the action.

The copy action comes first because it does not open another application. The
section does not use a form, account, scheduler, or API.

## Evidence image dialog

Technical-review images and supplied-record previews open in one shared native
`<dialog>`. The dialog:

- keeps the visitor on the procurement page;
- shows the source-size image without cropping;
- uses the image title as its accessible name;
- closes from its button, Escape, or a backdrop click;
- returns focus to the image trigger;
- clears the full-size image after closing.

The dialog does not link to a full certificate, test report, or other original
factory file. The public site contains selected preview images only.

The triggers are buttons, not raw-asset links. The dialog is a local static
enhancement and makes no network request other than loading the selected image.
Its layout is viewport-bounded and supports both landscape drawings and
portrait certificates.

## Link integrity

The home procurement link targets `/#considerations`. Factory
source links use current HTTPS pages that resolve without a certificate error.

Browser coverage reads the sitemap, visits every listed page, checks every
same-origin link and asset for a response below 400, and verifies that each
same-origin fragment names an element on its destination page. External links
are checked manually because third-party DNS and bot controls are not stable
enough for CI.

## Validation

Run the site unit tests, type check, lint, production build, and Playwright
suite. Browser coverage verifies the product grouping at desktop and mobile
widths, both mega panels, the static contact actions, the full static `/app`
page, mixed-aspect evidence dialogs, focus restoration, and all
sitemap-discovered internal links and fragments.
