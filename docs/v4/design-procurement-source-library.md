# Factory source library and single-agent profile

Status: accepted for implementation.

## Context

Harpa Pro helps overseas buyers purchase products from factories in China.
Harpa Pro acts as the buyer's procurement representative. The public site must
show the quality of the information that a buyer receives.

The source package is the `Furniture Factories` folder supplied on 17 September
2026. It contains material from five factory groups:

- AIS Smarti, for custom cabinetry and project joinery;
- J2S, for hospitality furniture;
- Kenuo, for wood office furniture and seating;
- Masyounger, for metal office furniture and storage;
- Rong Shuo, for bathroom cabinets and shower enclosures.

The package contains 30 PDF files. Four files are exact duplicates. It also
contains factory images and four image copies of certificate pages.

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
4. Which original documents support the stated material or product claims?

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

## Haruna profile

Haruna Bayoh is the only procurement lead. The profile must not look like one
remaining card from an agent directory.

Use one wide editorial profile. Show a large portrait, a concise role summary,
credentials, and four areas of responsibility. Do not add selection controls,
availability, ratings, or other marketplace patterns.

The profile uses this role name: `China-based procurement lead`.

## Factory profiles

Show five factory profiles from the source package. Each profile includes:

- the factory name;
- the main product scope;
- a representative source image or catalogue spread;
- the supplied material types;
- a short note about how Harpa Pro uses the material.

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

## Original documents

Publish the original certificate and test-report files that are in the source
package. Show a rendered first page in the website. Open that image in the
existing evidence dialog. Provide an explicit link to the original file from
the dialog.

Do not publish duplicate page images when the original PDF exists. The four
image files named `E0 report`, `RoHS`, and `VOC` duplicate pages from supplied
PDF reports. Use the PDF files as the source. The Wanhua Ecoboard production
control certificate is a separate image and can remain visible.

Group documents by the factory package that supplied them. The group does not
prove that the named factory owns or issued every document. State the named
applicant, manufacturer, supplier, or issuer where the document provides it.

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
- ten unique factory credential records;
- original document links for each PDF record;
- an expired label on the J2S European representative appointment;
- evidence dialogs that keep the user on the procurement page;
- no full factory catalogue download;
- no form, booking, checkout, stock, or live-price feature.

Run the site unit tests, type check, lint, production build, and Playwright
suite. Inspect the desktop and mobile page before the pull request is ready.
