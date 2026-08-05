# 2026-05-15 — lucide icons silently fell back to brand placeholder; `react-native-svg` was never installed (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Every ported screen rendered, but every lucide icon
(MapPin, Calendar, FolderOpen, Pencil, Plus, …) showed as the
Harpa Pro "U" brand placeholder. Vitest unit snapshots passed
because they render the JSX tree and never resolve the SVG
primitives. Coverage was green. Only a manual `simctl io
screenshot` on the mock build caught it.

**Root cause.** `lucide-react-native` lists `react-native-svg` as a
peer dependency. We had been adding lucide imports across screens
through P2 + P3 without ever running `npx expo install
react-native-svg`. RNSVG was never linked into the iOS Pods, so
at runtime the bridge fell back to a default Image — which, with
no source, rendered the brand asset.

**Fix.** Commit `a777d47c` — `apps/mobile/package.json` adds
`react-native-svg@15.8.0`. Pod reinstall via `expo run:ios` picks
up `RNSVG` and the icons render.

**Test.** No unit test would have caught this — RNSVG only matters
on the device. The new tmp `.maestro/tmp-p3-smoke/` flow captures
screenshots of every ported screen in the mock build so a missing
native dep is visible immediately. P3.13's `core-end-to-end`
Maestro flow inherits this guarantee and replaces the tmp folder.

**Pattern.** R5 — the unit/integration suites injected stubs (the
JSX tree) instead of exercising the real wiring (the native SVG
runtime). The default wiring was silently broken; only an E2E
against the live binary surfaced it.
