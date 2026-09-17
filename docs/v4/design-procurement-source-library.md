# Factory source library and single-agent profile

Status: implemented.

## Context

Harpa Pro helps overseas buyers purchase products from factories in China.
Harpa Pro acts as the buyer's procurement representative. The public site must
show the quality of the information that a buyer receives.

The source package is the `Furniture Factories` folder supplied on 17 September 2026. It contains material from five factory groups:

- AIS Smarti, for custom cabinetry and project joinery;
- J2S, for hospitality furniture;
- Kenuo, for wood office furniture and seating;
- Masyounger, for metal office furniture and storage;
- Rong Shuo, for bathroom cabinets and shower enclosures.

The package contains 30 PDF files, including exact duplicates. It also contains
factory images and four image copies of certificate pages.

The current site uses images extracted from an earlier internal presentation.
It also lists factories that are not in the new source package. The new package
now becomes the source of truth for factory content.

## Site purpose

The site is not a product catalogue. It shows representative products and the
standard of information that Harpa Pro supplies for a quoted item.

The site must answer four buyer questions:

1. Who manages the order in China?
2. Which product categories can the factories supply?
3. What information will a buyer receive for each quoted item?
4. Which supplied document previews support the stated material or product
   claims?

The site remains static. It does not add accounts, live stock, prices, booking,
checkout, or other server features.

## Visual direction

Use the factory catalogues as the structural reference. Keep the Harpa Pro
paper, navy, and orange design tokens.

Use these catalogue patterns:

- large editorial images;
- clear section numbers and source labels;
- short product descriptions;
- compact specification tables;
- source notes beside the relevant product;
- wide page-like compositions with generous space.

Do not copy a factory's logo system or brand colors as the Harpa Pro design.
Do not make a dense product grid. Each product image must support a clear
example or a factual factory profile.

## Heading and copy hierarchy

Use one `h1` for the page title. Use `h2` for each main section. Use `h3`
only when a section contains a distinct content group. Product, factory, and
document names can use lower heading levels when they identify an item.

Each section introduction contains its heading and, when needed, one short
sentence. Do not place an eyebrow, tagline, subtitle, and body paragraph above
the same content. Do not repeat a tab label inside its labelled panel.

Use direct, factual copy based on Simplified Technical English. Prefer active
voice, common words, and one subject per sentence. Do not use promotional
claims, decorative labels, or punctuation at the end of headings.

## Haruna profile

Haruna Bayoh is the only procurement lead. The profile must not look like one
remaining card from an agent directory.

Use one wide editorial profile. Show a large portrait, a concise role summary,
credentials, four areas of responsibility, and a link to Haruna's public
LinkedIn profile. Do not add selection controls, availability, ratings, or
other marketplace patterns.

The profile describes Haruna as Harpa Pro's `procurement lead in China`.

The page ends with the static contact section defined in
`design-public-site-product-navigation.md`. It provides copy-first email and
WhatsApp actions without adding a form or scheduling flow.

## Factory profiles

Show five factory examples from the source package. State that these are
selected examples, not a complete directory. Each example includes:

- the factory name;
- the main product scope;
- a representative source image or catalogue spread;
- the factory location;
- one concise product-scope description.

Keep AIS as a short full-width feature. Show the other examples as compact
cards. Remove numbering and repeated source-file and internal-use blocks.

Remove the Langyao, Mingyuan, and JLA profiles from this page. Their earlier
presentation extracts are not part of the new furniture source package.

Do not publish each full catalogue. Several files exceed the static host file
limit, and a full catalogue would change the purpose of the site. Use selected
pages as representative examples.

## Product information standard

State that each quoted item can include these fields:

- product or model reference;
- intended use and configuration;
- dimensions and permitted variation;
- materials and construction;
- finish, color, and hardware;
- test reports or certificates that apply to the item;
- quantity and packing method;
- quotation basis, lead time, and items that need confirmation.

Show three representative briefs. Use source pages for custom joinery,
hospitality furniture, and a shower enclosure. Mark the section as examples,
not a live catalogue.

## Factory document previews

Publish selected first-page images, not the original certificate and
test-report files. Open a preview in the existing evidence dialog. Do not add a
link to the full PDF, image source, or other original document.

Show three visually different previews first: the marine HDF formaldehyde
test, the hot-melt adhesive RoHS test, and the J2S sofa E1 certificate. Put the
other seven previews under **Show 7 more documents**. Identify the source
package on each card instead of adding separate factory-package sections.

The source package does not prove that the named factory owns or issued every
document. State the named applicant, manufacturer, supplier, or issuer where
the document provides it.

Show the report number and issue date where available. Do not state that a
document is current unless the document proves it. Mark the J2S European
representative appointment as expired on 15 July 2026.

Keep this notice beside the records: `Factory-supplied document. Harpa Pro has
not independently verified its current status or scope.`

## Technical reviews

Keep the two Revit review sheets. They show how Harpa Pro reviews drawings and
factory information. Remove the old lighting product sheets from this section.
The user will replace the extracted Revit images with original files later.

## Validation

Browser tests must verify:

- one editorial Haruna profile with no agent-selection language;
- five factory profiles from the new source package;
- no Langyao, Mingyuan, or JLA profile;
- three representative product briefs and the eight buyer-information fields;
- two Revit review sheets;
- three initially visible and ten total factory credential previews;
- no original factory-document links or public files;
- an expired label on the J2S European representative appointment;
- evidence dialogs that keep the user on the procurement page;
- a contact section with copy-email, email-client, and WhatsApp actions;
- no full factory catalogue download;
- no form, booking, checkout, stock, or live-price feature.

Run the site unit tests, type check, lint, production build, and Playwright
suite. Inspect the desktop and mobile page before the pull request is ready.
