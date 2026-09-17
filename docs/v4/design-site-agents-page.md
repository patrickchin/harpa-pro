# Procurement-first public site

Status: implemented.

## Context

Harpa Pro now presents two products on the public site. The procurement service
is the primary product. The site-reporting app is a secondary product.

Haruna Bayoh is the only procurement agent. The site must not ask visitors to
choose or compare agents. It must also remain a static site. Forms, booking,
live availability, accounts, checkout, and other server-backed features are not
part of this revision.

The user supplied an internal nine-page interior procurement PDF. It contains
service information, workflow steps, sample Revit sheets, four factory
profiles, and scans of factory certificates and test reports.

The site must not claim fees, turnaround times, testimonials, guaranteed
outcomes, or live service state. It must describe factory documents as supplied
records, not as independent validation by Harpa Pro.

## Decision

The home page will introduce interior procurement first. Its main action will
open `/agents`. A short app section will follow the procurement introduction
and link to the existing App Store page.

The shared navigation will use **Procurement** instead of **Agents**. The main
header action will open the document section. The app will use a plain
navigation link. The footer will use the same product order.

The `/agents` page will use formal service labels. It will contain one profile
for Haruna and no selection or comparison language.

## Procurement journey

The page will describe eight stages:

1. Design brief.
2. Factory vetting.
3. Specification control.
4. Compliance review.
5. Production inspection.
6. Documentation.
7. Logistics and shipping.
8. Client approval.

On large screens, the stage names will form a vertical list on the left. The
selected stage will show a short description and an image on the right. On
small screens, the list will appear above the detail panel.

The control will use an accessible tab pattern and a small local script. It
will not make a network request or store user data. The first stage will remain
visible if the script does not run.

## Documents and factories

The procurement page will contain a static document section with three parts:

- **Technical package:** Revit sheets, 3D views, shop drawings, and specification
  schedules. Project-specific Revit links will not appear until the source PDFs
  are added.
- **Factory document register:** four factory cards with the product category
  and document names supplied in the internal PDF.
- **Procurement download:** a renamed copy of the supplied nine-page PDF.

The factory register will include:

- AIS Factory Furniture: CE, E1, REACH, and VOC documents;
- Langyao Factory LED Lighting: CE, LVD, and RoHS documents;
- Mingyuan Factory Floor Panels: CE, E1, fire test, and VOC documents;
- JLA Factory Ceramic Tiles: CE, performance, and test documents.

The web page will not extract certificate numbers, dates, or pass results from
the low-resolution PDF scans. Original source documents can replace the register
entries when they are added to the repository.

## Images

Reuse the checked-in Haruna portrait, interior image, production-floor image,
and quality-control image. A stage can reuse an image when it represents the
same part of the work. This keeps the page small and avoids decorative images
that do not add information.

The factory images must continue to show ordinary furniture production in
China. They must not look like boutique workshops or idealized showrooms.

## Writing

Use short sentences, active voice, and one name for each part of the service.
Use formal labels instead of conversational headings or second-person prompts.
Remove marketing filler and unsupported claims. Keep each stage description to
one or two sentences.

## Validation

Browser coverage will verify:

- interior procurement is the main home-page subject;
- the app appears as a secondary section;
- all eight journey stages have a short description and an image;
- mouse and keyboard input change the selected stage;
- the page contains one Haruna profile and no agent-choice language;
- the four factory cards contain the document names supplied in the PDF;
- the current procurement PDF downloads as a static file;
- the Revit area does not publish broken or placeholder links;
- the page contains no forms, booking controls, or API links;
- the shared navigation works without horizontal overflow at 390 px.

Run the site unit tests, type check, lint, production build, and Playwright suite
before the pull request is ready for review.
