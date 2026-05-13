# M2 — Voice demo (static, hardcoded fixtures)

> **Scope deliberately limited.** The launch demo runs entirely in
> the browser against committed JSON fixtures. No API calls, no R2,
> no auth, no rate-limiting. Wiring to the real API is **deferred**
> to [`plan-m4-voice-demo-live.md`](plan-m4-voice-demo-live.md), to be
> tackled after launch.

Goal: an embedded "try it now" demo on the landing page. Visitor hits
record, speaks anything, and after a short scripted delay sees a
pre-recorded transcript and a pre-generated daily report side-by-side.
The audio is captured for UX realism but **discarded immediately** —
nothing leaves the browser.

## Exit gate
- [ ] Browser recorder works on Chromium, Safari, Firefox (desktop +
      iOS Safari + Android Chrome). Mic permission flow is clean.
- [ ] Recording auto-stops at 30s; UI never sends audio anywhere.
- [ ] On stop, the component plays a scripted "transcribing…" →
      "generating…" sequence (~3–5s total) and reveals the canned
      transcript + canned report side-by-side.
- [ ] The fixture JSON used by the demo is committed at
      `apps/marketing/src/fixtures/demo/` and is plausible /
      realistic enough to read as a genuine site update.
- [ ] A small "This is a demo with a sample report — try it for real
      after you join the waitlist" disclaimer is visible alongside
      the result.
- [ ] Playwright E2E covering record → fake pipeline → result reveal.
- [ ] Lighthouse stays ≥ 95 on pages WITHOUT the demo island; the
      page WITH the demo is allowed perf ≥ 90 (lower JS budget than
      the live version since there's no upload code).

## Tasks

### M2.1 Demo fixtures
- [ ] Create `apps/marketing/src/fixtures/demo/` with three files:
      - `transcript.json` — `{ text: string, language: 'en',
        durationSec: number }`. Plausible site-update prose, ~80–120
        words.
      - `report.json` — the structured report payload (sections:
        summary, work completed, blockers, safety, photos placeholder,
        next steps). Shape mirrors what the live API returns from
        `POST /reports/:id/generate`; copy the shape from
        `packages/api-contract` so a future M4 swap is mechanical.
      - `report.html` (optional) — pre-rendered HTML for instant
        display, if rendering the JSON in the browser proves heavy.
- [ ] Hand-write the content. Don't generate at build time. Reviewed
      against the canonical sample report in
      `../haru3-reports` if useful for tone.
- [ ] Commit: `feat(marketing): hardcoded voice demo fixtures`.

### M2.2 Browser recorder (UX-only)
- [ ] Install `@types/dom-mediacapture-record` in `apps/marketing`.
- [ ] Create `apps/marketing/src/components/VoiceDemo.tsx` — React
      island, `client:visible`.
- [ ] `navigator.mediaDevices.getUserMedia({ audio: true })` →
      `MediaRecorder` API, codec `audio/webm;codecs=opus` (Chromium/
      Firefox) or `audio/mp4` (iOS Safari).
- [ ] **Discard the recorded blob.** It exists only to drive the
      waveform visual and the auto-stop timer. Do not persist, do not
      upload, do not even keep it in component state past `onstop`.
- [ ] Live waveform: `<canvas>`, `AnalyserNode.getByteFrequencyData()`
      → animated bars.
- [ ] Max 30s with on-screen countdown timer; auto-stop.
- [ ] UI states: idle / requesting-permission / permission-denied /
      recording / processing-fake / done / try-again.
- [ ] Permission-denied state shows browser-specific re-enable
      instructions and a "Skip the recording, just show me the
      output" button that jumps straight to M2.3's reveal.
- [ ] Commit: `feat(marketing): browser voice recorder ui`.

### M2.3 Scripted result reveal
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

### M2.4 Visual polish
- [ ] Two-column layout (transcript left, report right) on desktop;
      stacked on mobile.
- [ ] Report panel renders the JSON with simple semantic HTML —
      headings, lists, callouts. No heavy markdown lib.
- [ ] Subtle "demo" watermark on the report panel.
- [ ] Print-friendly enough that a curious visitor can `Cmd+P` and
      see something sensible.
- [ ] Commit: `feat(marketing): demo result panel polish`.

### M2.5 Playwright E2E
- [ ] Create `apps/marketing/e2e/voice-demo.spec.ts`.
- [ ] Use Playwright's `--use-fake-ui-for-media-stream` +
      `--use-fake-device-for-media-stream` flags + a small fixture
      WAV to satisfy the recorder; mic content is irrelevant since
      we never read it.
- [ ] Assert: click record → wait 2s → click stop → wait for
      `done` state → transcript text matches `transcript.json` →
      report headings match `report.json`.
- [ ] Also test the "skip the recording" path → same final state.
- [ ] Run in CI on Chromium + WebKit.
- [ ] Commit: `test(marketing): voice demo E2E`.

### M2.6 Documentation
- [ ] Add a short "Demo: how it works today" note inside
      `docs/marketing/README.md` (or a new `docs/marketing/arch-voice-demo.md`
      if it grows beyond ~20 lines) covering: fixtures location, the
      "no audio leaves the browser" guarantee, and the path to the
      M4 plan for the live wiring.
- [ ] Update the privacy page draft (M3.2) to reflect that the demo
      does not transmit audio at launch.
- [ ] Commit: `docs(marketing): voice demo (static) architecture`.

### M2.7 M2 exit
- [ ] Demo works end-to-end on preview deploy with no API hops.
- [ ] Playwright E2E green in CI.
- [ ] Lighthouse still ≥ 95 on non-demo pages, ≥ 90 on demo page.
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
