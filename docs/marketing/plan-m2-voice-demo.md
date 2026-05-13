# M2 — Voice demo (static, hardcoded fixtures)

> **Scope deliberately limited.** The launch demo runs entirely in
> the browser against committed JSON fixtures. No API calls, no R2,
> no auth, no rate-limiting. Wiring to the real API is **deferred**
> to [`plan-m4-voice-demo-live.md`](plan-m4-voice-demo-live.md), to be
> tackled after launch.
>
> **Updated (M2 revision 1):** Demo now uses shared UI components from
> `packages/ui-voice` (cross-platform RNW + NativeWind) instead of
> bespoke semantic HTML. See [`docs/v4/arch-ui-voice.md`](../v4/arch-ui-voice.md).

Goal: an embedded "try it now" demo on the landing page. Visitor hits
record, speaks anything, and after a short scripted delay sees a
pre-recorded transcript and a pre-generated daily report side-by-side.
The audio is captured for UX realism but **discarded immediately** —
nothing leaves the browser.

The report panel renders using **shared voice components** from
`packages/ui-voice`, which are also used by the mobile app. This
guarantees visual parity and eliminates duplicate maintenance.

## Exit gate
- [ ] Browser recorder works on Chromium, Safari, Firefox (desktop +
      iOS Safari + Android Chrome). Mic permission flow is clean.
- [ ] Recording auto-stops at 30s; UI never sends audio anywhere.
- [ ] On stop, the component plays a scripted "transcribing…" →
      "generating…" sequence (~3–5s total) and reveals the canned
      transcript + canned report side-by-side.
- [ ] The fixture JSON used by the demo is committed at
      `packages/ui-voice/src/fixtures/` (shared with mobile) and is
      plausible / realistic enough to read as a genuine site update.
- [ ] The report panel renders via `<VoiceReportView>` from
      `@harpa/ui-voice` — same component mobile will use in P3.
- [ ] A small "This is a demo with a sample report — try it for real
      after you join the waitlist" disclaimer is visible alongside
      the result.
- [ ] Playwright E2E covering record → fake pipeline → result reveal +
      assertions on shared component rendering.
- [ ] Lighthouse stays ≥ 95 on pages WITHOUT the demo island; the
      page WITH the demo is allowed perf ≥ 90 (RNW + shared package
      add ~120 KB gzipped, acceptable for demo-only page).

## Tasks

### M2.0 Shared UI package scaffolding
- [ ] Create `packages/ui-voice/` structure:
      - `package.json` (peerDeps: react, react-native, nativewind)
      - `tsconfig.json` (extends repo base)
      - `vitest.config.ts` (jsdom + RNW alias)
      - `src/index.ts` (public exports)
      - `src/components/`, `src/types/`, `src/fixtures/`, `src/__tests__/`
- [ ] Add `@harpa/ui-voice` to workspace (already scanned by
      `pnpm-workspace.yaml`).
- [ ] Smoke test: create a minimal `<View><Text>Hello</Text></View>`
      component in `src/components/Smoke.tsx`, export from `src/index.ts`,
      verify it type-checks.
- [ ] Commit: `feat(ui-voice): scaffold shared package structure`.

### M2.1 Demo fixtures (moved to shared package)
- [ ] Create fixtures in `packages/ui-voice/src/fixtures/`:
      - `demo-transcript.json` — `{ text: string, language: 'en',
        durationSec: number }`. Plausible site-update prose, ~80–120
        words.
      - `demo-report.json` — the structured report payload (sections:
        summary, workCompleted, blockers, safety, nextSteps). Shape
        mirrors what the live API returns from `POST /reports/:id/generate`;
        copy the shape from `packages/api-contract` so a future M4 swap
        is mechanical.
      - `index.ts` — typed exports (`export const demoReport = ...`).
- [ ] Hand-write the content. Don't generate at build time. Reviewed
      against the canonical sample report in `../haru3-reports` if
      useful for tone.
- [ ] Commit: `feat(ui-voice): add demo fixtures`.

### M2.2 Wire react-native-web in marketing
- [ ] Install `react-native-web@^0.19.13` in `apps/marketing`.
- [ ] Update `apps/marketing/astro.config.mjs`:
      - Add `vite.resolve.alias: { "react-native": "react-native-web" }`
      - Add `vite.optimizeDeps.include: ["react-native-web", "@harpa/ui-voice"]`
      - Add `vite.ssr.noExternal: ["@harpa/ui-voice", "react-native-web", "nativewind"]`
- [ ] Smoke test: create a tiny Astro page with a `client:only="react"`
      island that imports `import { View, Text } from 'react-native'`
      and renders `<View><Text>Hello RNW</Text></View>`. Verify it
      builds and runs in browser dev mode.
- [ ] Commit: `feat(marketing): wire react-native-web alias for shared UI`.

### M2.3 Browser recorder (UX-only)
- [ ] Install `@types/dom-mediacapture-record` in `apps/marketing`.
- [ ] Create `apps/marketing/src/components/VoiceDemo.tsx` — React
      island, `client:only="react"` (skip SSR to avoid RNW server issues).
- [ ] `navigator.mediaDevices.getUserMedia({ audio: true })` →
      `MediaRecorder` API, codec `audio/webm;codecs=opus` (Chromium/
      Firefox) or `audio/mp4` (iOS Safari).
- [ ] **Discard the recorded blob.** It exists only to drive the
      waveform visual and the auto-stop timer. Do not persist, do not
      upload, do not even keep it in component state past `onstop`.
- [ ] Live waveform: `<canvas>`, `AnalyserNode.getByteFrequencyData()`
      → animated bars. (Web-only, not shared.)
- [ ] Max 30s with on-screen countdown timer; auto-stop.
- [ ] UI states: idle / requesting-permission / permission-denied /
      recording / processing-fake / done / try-again.
- [ ] Permission-denied state shows browser-specific re-enable
      instructions and a "Skip the recording, just show me the
      output" button that jumps straight to M2.4's reveal.
- [ ] Commit: `feat(marketing): browser voice recorder ui`.

### M2.4 Scripted result reveal
- [ ] On `MediaRecorder.onstop` (or "skip" click), kick off a
      scripted state machine:
      - `processing-fake.transcribing` (~1.5s) — show animated
        "transcribing…" placeholder in the left panel.
      - `processing-fake.generating` (~2.0s) — show a typewriter /
        skeleton in the right panel; left panel reveals the canned
        transcript line-by-line.
      - `done` — both panels fully populated.
- [ ] Use `setTimeout` + `requestAnimationFrame` for the typewriter;
      no extra deps.
- [ ] Below the result: disclaimer + a CTA button "Join the waitlist
      to generate your own" → scrolls/focuses the M1 waitlist form.
- [ ] Commit: `feat(marketing): scripted demo result reveal`.

### M2.5 Implement VoiceReportView (shared component)
- [ ] Create `packages/ui-voice/src/components/VoiceReportView.tsx`:
      - Props: `report: VoiceReport`, `loading?: boolean`,
        `watermark?: string`, `className?: string`.
      - Renders report sections (summary, work completed, blockers,
        safety, next steps) with RN primitives (`View`, `Text`,
        `ScrollView`) + NativeWind classes.
      - If `watermark` is set, overlays a subtle badge in top-right.
      - If `loading`, shows `VoiceReportSkeleton` (simple grey pulse).
- [ ] Create supporting components:
      - `VoiceReportSection.tsx` (section heading + bulleted items)
      - `VoiceReportSkeleton.tsx` (animated skeleton)
      - `VoiceReportEmptyState.tsx` (empty message, reuses pattern
        from mobile `EmptyState` primitive)
- [ ] Type `VoiceReport` from `@harpa/api-contract` schemas.
- [ ] Export from `packages/ui-voice/src/index.ts`.
- [ ] Commit: `feat(ui-voice): implement VoiceReportView`.

### M2.6 Use shared VoiceReportView in marketing demo
- [ ] Update `apps/marketing/src/components/VoiceDemo.tsx` to import:
      ```tsx
      import { VoiceReportView } from '@harpa/ui-voice';
      import { demoReport } from '@harpa/ui-voice/fixtures';
      ```
- [ ] In the "done" state, replace any semantic HTML report rendering
      with:
      ```tsx
      <VoiceReportView report={demoReport} watermark="Demo report" />
      ```
- [ ] Two-column layout (transcript left, report right) on desktop;
      stacked on mobile. The `VoiceReportView` occupies the right panel.
- [ ] Print-friendly: `VoiceReportView` renders as semantic HTML via
      RNW, so `Cmd+P` works.
- [ ] Verify in `pnpm dev` (marketing) that the report renders correctly.
- [ ] Commit: `feat(marketing): use shared VoiceReportView in demo`.

### M2.7 Wire mobile Tailwind content glob
- [ ] Update `apps/mobile/tailwind.config.js`:
      ```js
      content: [
        './app/**/*.{js,jsx,ts,tsx}',
        './components/**/*.{js,jsx,ts,tsx}',
        './screens/**/*.{js,jsx,ts,tsx}',
        './lib/**/*.{js,jsx,ts,tsx}',
        '../../packages/ui-voice/src/**/*.{ts,tsx}',  // ← ADD
      ],
      ```
- [ ] Rebuild mobile (`pnpm ios`) to verify Metro + NativeWind pick up
      the new glob.
- [ ] Create `apps/mobile/app/(dev)/voice-report.tsx` in the dev-gallery:
      ```tsx
      import { VoiceReportView } from '@harpa/ui-voice';
      import { demoReport } from '@harpa/ui-voice/fixtures';

      export default function VoiceReportDevScreen() {
        return (
          <ScrollView className="flex-1 bg-background p-4">
            <VoiceReportView report={demoReport} watermark="Dev" />
          </ScrollView>
        );
      }
      ```
- [ ] Add entry to `apps/mobile/screens/dev-gallery.rows.ts`.
- [ ] Verify it renders correctly in iOS sim.
- [ ] Commit: `feat(mobile): add VoiceReportView to dev-gallery`.

### M2.8 Tests (shared package + integration)
- [ ] **Unit tests (Vitest + jsdom + RNW):**
      - `packages/ui-voice/src/__tests__/VoiceReportView.test.tsx`
        → renders sections, shows watermark, shows skeleton, snapshot.
      - Coverage ≥ 80% on `packages/ui-voice/src/components/`.
- [ ] **Mobile integration test:**
      - `apps/mobile/__tests__/VoiceReportView.integration.test.tsx`
        → wraps `VoiceReportView` in `react-test-renderer` + `act`,
        asserts `toJSON()` is truthy. No stubs.
- [ ] **Marketing E2E (Playwright):**
      - `apps/marketing/e2e/voice-demo-shared-ui.spec.ts`
        → visits demo page, waits for report, asserts section headings
        from `demo-report.json` are visible.
- [ ] Run `pnpm test` (all), `pnpm test:mobile`, `pnpm test:e2e:marketing`.
- [ ] Commit: `test(ui-voice): add VoiceReportView tests (unit + integration)`.

### M2.9 Playwright E2E (full voice demo flow)
- [ ] Create `apps/marketing/e2e/voice-demo.spec.ts` (original M2.5 scope).
- [ ] Use Playwright's `--use-fake-ui-for-media-stream` +
      `--use-fake-device-for-media-stream` flags + a small fixture
      WAV to satisfy the recorder; mic content is irrelevant since
      we never read it.
- [ ] Assert: click record → wait 2s → click stop → wait for
      `done` state → transcript text matches `demo-transcript.json` →
      report headings match `demo-report.json` (via shared component).
- [ ] Also test the "skip the recording" path → same final state.
- [ ] Run in CI on Chromium + WebKit.
- [ ] Commit: `test(marketing): voice demo E2E (recorder + shared UI)`.

### M2.10 Documentation
- [ ] Create `docs/v4/arch-ui-voice.md` — architecture doc for the
      shared package (already written in this design).
- [ ] Update `docs/v4/architecture.md` to add the new doc to the
      section index (row 8a).
- [ ] Update this file (`docs/marketing/plan-m2-voice-demo.md`) to
      reflect the shared package approach (this diff).
- [ ] Add a short note in `docs/marketing/README.md` or a new
      `docs/marketing/arch-voice-demo.md` covering: fixtures location,
      the "no audio leaves the browser" guarantee, and the path to the
      M4 plan for the live wiring.
- [ ] Update the privacy page draft (M3.2) to reflect that the demo
      does not transmit audio at launch.
- [ ] Commit: `docs(ui-voice): architecture + M2 plan revision`.

### M2.11 M2 exit
- [ ] Demo works end-to-end on preview deploy with no API hops.
- [ ] Playwright E2E green in CI (both `voice-demo.spec.ts` and
      `voice-demo-shared-ui.spec.ts`).
- [ ] Mobile dev-gallery entry for `VoiceReportView` renders correctly.
- [ ] Lighthouse still ≥ 95 on non-demo pages, ≥ 90 on demo page
      (RNW + shared package add ~120 KB gzipped, acceptable).
- [ ] Tag `v0.3.0-marketing`.

## Out of scope for M2 (deferred to M4 or beyond)
- Demo session JWT, demo-scoped middleware, R2 demo prefix,
  lifecycle rules — all M4.
- Real transcription / report generation — M4.
- CORS for `/demo/*`, `/voice/*`, `/reports/*/generate` — M4.
- Anonymous → signed-up conversion flow — defer.
- Voice-to-PDF export from the demo — defer.
- Multi-language transcription — defer.
- Real-time streaming transcription — defer.
