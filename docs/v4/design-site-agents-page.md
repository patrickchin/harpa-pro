# Procurement-first public site

Status: revised design.

## Context

Harpa Pro presents interior procurement as its main public service. The
site-reporting app remains available as a secondary product.

Haruna Bayoh is the only procurement agent. The site must not ask visitors to
choose or compare agents. It must also remain static. Forms, booking, live
availability, accounts, checkout, and other server-backed features are outside
this revision.

The user supplied an internal nine-page interior procurement PDF. It is a
design and content source for the website. It is not a public document and must
not be available for download from the website. Individual images can be
extracted from it and displayed as evidence while the original Revit files,
certificates, and factory submissions are being collected.

The site must not claim fees, turnaround times, testimonials, guaranteed
outcomes, or live service state. Factory documents are records supplied for
review, not independent validation by Harpa Pro.

## Decision

The home page introduces interior procurement first. Its main action opens
`/agents`. A short app section follows the procurement introduction and links
to the existing App Store page.

The shared navigation uses **Procurement** instead of **Agents**. Its main
action opens the evidence section. The app uses a plain navigation link. The
footer uses the same product order.

The `/agents` page uses formal service labels. It contains one profile for
Haruna and no selection or comparison language.

## Procurement considerations

The page presents five review areas as considerations, not as numbered steps
or a long sequence:

- design and specification;
- factory and product fit;
- materials and compliance;
- production quality;
- packing and delivery.

On large screens, the consideration names form a compact list on the left. The
selected consideration shows a short explanation and one directly relevant
image on the right. On small screens, the list appears above the detail panel.

The control uses an accessible tab pattern and a small local script. It makes
no network request and stores no user data. The first consideration remains
visible if the script does not run. The interface does not show numbers,
"stage", or "step" labels.

Each image must show the selected subject:

- a Revit coordination sheet for design and specification;
- the current AIS factory for factory and product fit;
- a supplied test report for materials and compliance;
- an AIS factory quality-review photograph for production quality;
- an AIS factory loading photograph for packing and delivery.

Source evidence is preferred to generated imagery. Generate a replacement only
when no appropriate source image exists.

## Visible project evidence

The website shows the source material itself instead of reducing it to status
labels or hiding it in a downloadable PDF.

### Technical reviews

Show the two extracted Revit review sheets from the supplied PDF:

- A104, 3D coordination views;
- A103, chair shop drawing and dimensions.

Also show factory product submissions where useful, including the Langyao ZYLO
panel-light and STAPE bulkhead specification sheets. These extracted images are
temporary. The original documents will replace them when available.

### Factory partners and product scope

Show the four current factory partners with an image, their relevant product
scope, and a link to an official or public manufacturer page:

- AIS: custom kitchens, wardrobes, bathroom vanities, interior doors, and
  joinery;
- Ningbo Langyao Lighting: LED panel, ceiling, bulkhead, and solar lights;
- Haining Mingyuan: SPC and PVC flooring and matching profiles;
- Foshan Zhenglian / JLA: patterned and project ceramic tiles.

The content should integrate products and capabilities published by each
manufacturer. It must not imply that a public listing is an endorsement.

### Supplied records

Show certificate and test-report scans in a visible image gallery grouped by
factory or material package. Use captions that identify the document shown.
Do not state that a certificate is current, complete, or independently
verified unless the original document supports that statement.

One scan placed under JLA in the supplied PDF names Wanhua Ecoboard and a
particle-board factory-production certificate. Do not label that scan as a JLA
certificate. Omit it from the JLA group until the original files establish the
correct attribution.

## Images

Use the supplied PDF assets and current factory-source images. The page should
show ordinary Chinese manufacturing and inspection conditions. Do not use
boutique workshops or idealized woodworking studios.

Large evidence images should remain legible, use descriptive alternative text,
and allow the browser to open the source-size image in a new tab. Thumbnail
layouts must not crop certificate or drawing content.

## Writing

Use short sentences, active voice, and one name for each part of the service.
Use formal labels instead of conversational headings or prompts. Remove
marketing filler and unsupported claims. Keep each consideration description
to one or two sentences.

## Validation

Browser coverage verifies:

- interior procurement is the main home-page subject;
- the app appears as a secondary section;
- all five considerations have a short description and a matching image;
- mouse and keyboard input change the selected consideration;
- the interface contains no numbered stage or step language;
- the page contains one Haruna profile and no agent-choice language;
- Revit sheets and factory product submissions are visible;
- factory partners include their product scope and source links;
- certificate and test-report scans are visible rather than represented only by
  badges;
- the internal procurement PDF is not published or linked;
- the page contains no forms, booking controls, or API links;
- the shared navigation works without horizontal overflow at 390 px.

Run the site unit tests, type check, lint, production build, and Playwright suite
before the pull request is ready for review.
