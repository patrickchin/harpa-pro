# Local IFC viewer

Replace the unpublished RVT experiment with a standalone IFC viewer. Visitors
choose an `.ifc` file and view its geometry without uploading the model. Revit
files must first be exported to IFC outside this application.

## Scope and appearance

`packages/ifc-viewer` owns a static page, a module worker and a Three.js canvas.
Keep the existing file picker, orbit/pan/zoom, fit, top view, cancel, clear,
loading states and narrow layout. Use the marketing site's colour tokens,
installed Inter font and brand icon. The standalone header links to Harpa Pro.
No marketing analytics or other website scripts run in the viewer.

Accept non-empty, uncompressed IFC files up to 150 MB. Reject RVT/RFA, IFCZIP
and invalid files with a useful message. Do not imply that this release
converts RVT or reproduces Revit sheets or exports a PDF.

## Parser and rendering contract

Use published, pinned `web-ifc` 0.0.78. Initialize its single-threaded WASM
engine in a worker before reporting readiness. Pass the selected file as a
transferred ArrayBuffer. Read IFC placements, colours, vertices, normals and
indices through the public API. Preserve its Y-up coordinate conversion and
placement transforms; do not apply the RVT prototype's extra axis rotation.
Copy geometry out of WASM memory before closing the model. Transfer owned
buffers to the canvas and release parser/model/GPU resources on clear,
replacement, cancellation and failure. Cancelling terminates the worker so a
large synchronous parse does not block the UI.

The worker returns geometry, placements, schema, element/triangle counts and
warnings. Worker startup and conversion failures must allow the next file to
be opened. Render only IFC contents; linked RVTs and external resources are
not fetched.

## Privacy and licensing

Bundle all runtime assets locally, including WASM, font and licences. CSP
allows scripts/workers/styles/fonts/images from this origin and permits WASM
compilation. `connect-src 'self'` is necessary for the engine download; no
external origins, upload API, telemetry, account or storage integration exist.
The local preview server accepts GET/HEAD only. Tests must inspect methods and
request bodies as well as prove conversion with network access disabled after
engine initialization. Same-origin CSP alone is not proof of no uploads.

No Reviter source, clone/setup script or parser dependency is distributed.
Keep web-ifc's MPL-2.0 notice, identify its corresponding source, and preserve
Three.js and font notices. Harpa Pro's own code retains its existing licence.

## Build and deployment

Keep a dedicated `build:viewer` script, outside the normal Turbo `build` graph.
The marketing site, mobile and API do not import the viewer. Changing the
shared lockfile can still trigger existing shared CI/install work.

Target an independent Git-connected Cloudflare Pages project,
`harpa-pro-viewer`, with `packages/ifc-viewer/dist` as output. Use the shared
Pages build helper and write its exact commit/branch deployment marker. Dev
and mirrored `pr-N` branches are the review environments. Keep automatic
production deployment disabled until a separately authorized promotion to
`main`; the intended production hostname is `viewer.harpapro.com`.

Match current Pages watch-path and verification conventions without changing
other projects' watch policies. Provider setup requires an authenticated
Cloudflare session. A built local artifact is not a deployed dev version.

## Verification and alternatives

Use real IFC2X3 and IFC4 samples for local browser checks. CI also parses a
small deterministic IFC fixture through the real engine. Verify geometry and
placements, controls, offline conversion, zero upload bodies, invalid input,
replacement after failure, cancellation, clear, and mobile overflow. Verify
the normal marketing build contains no viewer/WASM assets. These checks
address Pitfalls 3, 10 and 13: shared style, complete tests/docs and real
default parser wiring.

Keeping Reviter would preserve direct RVT input but leave publishing rights
unresolved. A commercial RVT SDK or an independently researched RVT decoder
is outside this IFC release. Cloud conversion does not meet the local-file
requirement. IFC is chosen because it provides a documented browser parser
and an explicit licence with no model upload requirement.
