# Local IFC viewer

A standalone Harpa Pro viewer for local, uncompressed `.ifc` files up to
150 MB. It uses web-ifc in a browser worker and Three.js for orbit, pan, zoom,
fit and top views. Files stay on the visitor's device. There is no upload API,
account, telemetry or cloud conversion.

This version does not open native `.rvt`/`.rfa` files or reproduce drawing
sheets/PDFs. Ask the model author for an IFC export. No Reviter code is used.

## Run locally

From the repository root, using the repository's pinned Node and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm --filter @harpa/ifc-viewer build:viewer
pnpm --filter @harpa/ifc-viewer preview:viewer
```

Open `http://127.0.0.1:4188`. The preview serves only `dist/` and accepts
GET/HEAD; it rejects POST requests. No sample or user model is copied into
`dist/`. Cloudflare Pages uses the generated `_headers` file for CSP.

The build copies the marketing site's colour tokens, brand icon and installed
Inter font. Rebuild after changing those shared inputs. Runtime assets are
local, including the WASM engine. CSP permits same-origin asset downloads and
WASM compilation, while blocking external origins and form submission.

The workspace deliberately has no generic `build` script: normal Turbo app
builds do not compile or bundle the viewer. Shared lockfile changes still
trigger the repository's existing shared CI/install jobs.

## Verify

```sh
pnpm --filter @harpa/ifc-viewer test
pnpm --filter @harpa/ifc-viewer exec playwright install chromium
pnpm --filter @harpa/ifc-viewer test:browser
```

The real-engine test uses a small IFC4 fixture with known dimensions,
placements and colours. Browser tests save screenshots and a network report
under ignored `artifacts/`. They cover online/offline conversion after engine
initialization, controls, RVT rejection, invalid IFC, replacement after failure,
cancellation, recovery, clear and mobile overflow. Offline reload or starting
a new worker without cached assets is not promised.

To use a real model or verify a deployed page:

```sh
pnpm --filter @harpa/ifc-viewer test:browser /absolute/path/model.ifc
pnpm --filter @harpa/ifc-viewer test:browser /absolute/path/model.ifc https://dev.harpa-pro-viewer.pages.dev
```

Set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome instead of the
Playwright Chromium download. Public upstream test models used for local
checks stay under ignored `samples/`; they are not shipped or fetched by users.

## Licences and deployment

web-ifc 0.0.78 is unmodified and licensed under MPL-2.0. The build includes its
licence, a corresponding-source link, and the Three.js and Inter notices in
`THIRD_PARTY_NOTICES.txt` and `assets/`. Harpa Pro's own code retains its
existing licence. The published package identifies source commit
`4310503d8618a0870c2166f101471078d528f4c1`.

The intended separate Pages project is `harpa-pro-viewer`, with a stable dev
preview before activation of `viewer.harpapro.com`. Provider setup is
documented in the [deployment runbook](../../docs/v4/ops-viewer-cloudflare-pages.md).
See the [feature design](../../docs/v4/design-local-ifc-viewer.md).
