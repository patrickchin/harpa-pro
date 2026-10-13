# Two-page public navigation

## Decision

The user requests only two destinations in the public navigation: Home (`/`)
and How to Buy from China (`/how-to-buy-from-china`). Apply this to the shared
header and footer, including their use on existing direct routes. This
supersedes the shared mega-menu and grouped-footer requirements in
[product navigation](design-public-site-product-navigation.md),
[the luxury experiment](design-site-luxury-experiment.md), and
[the buying guide](design-site-how-to-buy-from-china.md).

Keep both native page links visible at every viewport width. Preserve the
4rem sticky masthead and approved Inter wordmark. On narrow phones, let the
guide label wrap to two balanced lines while keeping each target at least
44px tall. Remove dropdowns, the mobile menu button, menu icons, and menu
JavaScript. Mark the current destination with `aria-current="page"` and a
quiet underline. Normalize trailing slashes when deriving the active page;
other existing routes have no active item.

Use porcelain text and a bronze active underline in the luxury masthead.
Existing light headers retain their own readable colors. Simplify the footer
to the brand, short service description, copyright, and the same two links.
Remove the old section, contact, reporting, app-store, and company groups.

Page content, contact actions, article contents links, documentation sidebars,
sitemap entries, and direct routes keep their existing behavior. Navigation
works without JavaScript and retains visible keyboard focus. Add no dependency
or shared navigation abstraction for two fixed destinations.

## Validation

Update existing navigation coverage for the two-link contract. Verify both
destinations through pointer and keyboard, correct current-page semantics,
unchanged sticky-header height, and no horizontal overflow at 320, 390, 768,
and 1440 CSS pixels. Check both links without JavaScript and verify the guide's
six contents links remain available. Run site unit tests, lint, typecheck,
build, browser coverage, and the existing sitemap/direct-route checks.
