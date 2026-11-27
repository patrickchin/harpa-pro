# Homepage hero and navigation

Status: implemented in PR #491. This is the complete scope of the PR.

Keep the current image-led homepage hero: a two-line serif “Interior
procurement” title, clear service copy, project brief and approach links, and
three labeled material concepts. Keep the existing image loading, error,
keyboard, no-JavaScript, and reduced-motion behavior. Use the existing walnut,
porcelain, and bronze palette, Cormorant Garamond display face, and Inter body
face. The material image is the signature; supporting text and controls stay
readable at phone, tablet, and desktop widths.

Keep the expanded procurement navigation and scrollable mobile menu. Point
Products and factories to `/#factory-partners` and Our process to
`/#considerations`, alongside the overview and existing buying guide.

Restore every section below the hero, its components, copy, layout, and
interactions to the PR base (`bbcb5bab`). Restore the original sitemap and
route set. Keep the buying guide unchanged. Isolate the retained hero styling
in a homepage-only stylesheet so it cannot redesign other content or pages.

Replace the earlier branch commits with one commit for this scope. Keep the
PR against dev, unmerged, for preview review.

Validation: site unit tests, lint, typecheck, build, and existing browser
coverage for navigation, materials, contact, procurement records, provenance,
keyboard controls, dialogs, reduced motion, and no JavaScript. Inspect the
hero at 1440, 768, and 390 pixels. Verify that below-hero homepage markup and
restored components match the base exactly, and verify the preview commit.

Validation completed locally: 31 unit tests and all 34 Chromium browser tests
passed, along with lint, typecheck, and the 18-page build. Hero screenshots at
1440, 768, and 390 pixels retain readable copy and material controls.
