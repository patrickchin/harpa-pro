# IFC viewer deployment

The standalone `packages/ifc-viewer` application is intended for a separate
Git-connected Pages project, `harpa-pro-viewer`. No model upload endpoint or
API credentials are required.

## Current status

Code and local browser verification are prepared. Project creation, Git
connection and public dev deployment require restored Cloudflare access and
have not yet been verified. `VIEWER_PREVIEWS_ENABLED` is deliberately unset
until that setup is complete. This switch controls GitHub verification; it
does not disable publishing in Cloudflare.

## Provider configuration

1. Create a Git-connected Pages project named `harpa-pro-viewer` for
   `patrickchin/harpa-pro`. Use the repository root as the build root.
2. Set production branch `main`, and disable automatic production deployments.
   Allow only `dev` and mirrored `pr-*` branches as custom preview branches.
3. Set `SKIP_DEPENDENCY_INSTALL=1` and `NODE_VERSION=24.19.0` in preview and
   production build environments. No secrets or analytics keys are needed.
4. Build command:
   `pnpm install --frozen-lockfile && bash scripts/ci/build-cloudflare-pages.sh viewer`.
   Output directory: `packages/ifc-viewer/dist`.
5. Apply the `harpa-pro-viewer` include list in
   [`cloudflare-pages-watch-paths.json`](../../scripts/ci/cloudflare-pages-watch-paths.json),
   with no excludes. Leave other projects' watch settings unchanged.
6. Enable the GitHub repository variable `VIEWER_PREVIEWS_ENABLED=true` after
   the Git integration and preview configuration are verified.

The existing preview-ref workflow mirrors exact PR heads to `pr-N`. Cloudflare
Git builds those commits; the viewer workflows verify the deployment marker.
Do not add Cloudflare credentials or direct publication to GitHub Actions.

## Dev acceptance

The PR origin is `https://pr-N.harpa-pro-viewer.pages.dev`; the stable dev origin
is `https://dev.harpa-pro-viewer.pages.dev`. Verify the exact full commit and
branch in `/_cf-pages-deployment.json`, page title, document and worker CSP,
WASM response MIME type, licence notices and missing-asset 404s. Load a real
IFC through the file picker and repeat with network access disabled after the
engine is ready. Confirm that only static asset GETs occur and no request
carries model bytes. The independent build does not add IFC assets or parser
imports to the marketing, API or mobile outputs.

## Production

The intended hostname is `viewer.harpapro.com`. Keep it inactive until the
dev review and a separately authorized promotion to `main`. Then attach the
custom domain through Pages, configure its DNS record and enable production
Git builds. Verify the production commit marker, CSP, WASM, licences and local
file flow before linking it from the marketing site.

See the [design](design-local-ifc-viewer.md) and the
[package instructions](../../packages/ifc-viewer/README.md).
