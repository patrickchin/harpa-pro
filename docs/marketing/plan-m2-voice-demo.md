# M2 — Voice demo

Goal: an embedded "try it now" demo on the landing page. Visitor hits
record, speaks a site update, gets back a transcript + a generated
daily report side-by-side, in under ~10 seconds (fixture mode) or ~20
seconds (live).

## Exit gate
- [ ] Browser recorder works on Chromium, Safari, Firefox (desktop +
      iOS Safari + Android Chrome).
- [ ] Anonymous demo-session flow: `POST /demo/session` → short-lived
      JWT (`scope=demo`, 15 min TTL) → presign R2 upload → `POST
      /files` → `POST /voice/transcribe` → `POST /reports/:id/generate`
      → result.
- [ ] Anonymous rate-limit budget: 3 sessions / IP / 24h, 1 report /
      session.
- [ ] `MARKETING_USE_FIXTURES=true` build returns canned fixtures
      with no API hops (for local dev / offline demo).
- [ ] Maximum recording length 60s (server-enforced).
- [ ] Playwright E2E covering the full flow against fixtures.
- [ ] Lighthouse stays ≥ 95 on pages WITHOUT the demo island; the
      page WITH the demo is allowed perf ≥ 85 (audio worklet cost).

## Tasks

### M2.1 Demo session token
- [ ] New Hono route `POST /demo/session` issues a short-lived JWT
      (15 min TTL, `scope=demo`, `sessionId=<uuid>`, `reportId=<uuid>`).
- [ ] Middleware `withDemoScope(c, next)` validates `scope=demo` and
      enforces:
      - `POST /files/presign` only for `key_prefix=demo/<sessionId>/`.
      - `POST /files` only for keys under that prefix.
      - `POST /voice/transcribe` only for files under that prefix.
      - `POST /reports/:id/generate` only where `:id == reportId` from
        the token.
- [ ] No `user_id` in the token; no access to real user tables.
- [ ] Per-request-scope test: a `demo` token can NOT touch real user
      projects/reports; a real user token can NOT use demo endpoints.
- [ ] Rate-limit `POST /demo/session`: 3 / IP / 24h.
- [ ] Commit: `feat(api): demo session token + scope middleware + tests`.

### M2.2 R2 demo bucket prefix + lifecycle
- [ ] Demo uploads land under `demo/<sessionId>/` prefix in the
      existing R2 bucket (or separate `harpa-demo` bucket if we want
      isolation).
- [ ] Cloudflare R2 lifecycle rule: delete objects under `demo/`
      prefix after 24h.
- [ ] Document in `docs/marketing/arch-voice-demo.md`.
- [ ] Commit: `chore(infra): r2 demo prefix lifecycle`.

### M2.3 Browser recorder (React island)
- [ ] Install `@types/dom-mediacapture-record` in `apps/marketing`.
- [ ] Create `apps/marketing/src/components/VoiceDemo.tsx` — React
      island, `client:visible`.
- [ ] `navigator.mediaDevices.getUserMedia({ audio: true })` →
      `MediaRecorder` API.
- [ ] Codec: `audio/webm;codecs=opus` (Chromium/Firefox) or
      `audio/mp4` (iOS Safari fallback).
- [ ] Detect mic permission state; clear UX for denied (browser
      prompt, manual re-enable instructions).
- [ ] Live waveform: small `<canvas>`, `AnalyserNode.getByteFrequencyData()`
      → draw bars.
- [ ] Max 60s with on-screen countdown timer; auto-stop + disable
      record button at 60s.
- [ ] UI states: idle / requesting-permission / recording / uploading
      / transcribing / generating / done / error.
- [ ] Commit: `feat(marketing): browser voice recorder island`.

### M2.4 Upload + pipeline
- [ ] On stop: `const blob = await recorder.stop()`.
- [ ] Fetch `POST /demo/session` → `{ token, sessionId, reportId }`.
- [ ] Fetch `POST /files/presign` with `Authorization: Bearer
      <token>`, `key_prefix=demo/<sessionId>/`, `content_type=audio/webm`.
- [ ] `PUT` blob directly to R2 signed URL.
- [ ] `POST /files` to register the uploaded file.
- [ ] `POST /voice/transcribe` with the file ID.
- [ ] Display transcript in left panel.
- [ ] `POST /reports/:reportId/generate` with the transcript text as
      a single note.
- [ ] Stream or poll for the generated report HTML, display in right
      panel.
- [ ] Commit: `feat(marketing): voice demo pipeline`.

### M2.5 Fixtures mode
- [ ] `MARKETING_USE_FIXTURES=true` env var in
      `apps/marketing/.env.local`.
- [ ] When true, `VoiceDemo` component short-circuits API calls and
      returns canned transcript + canned report HTML (imported from
      `packages/ai-fixtures/fixtures/demo-*.json`).
- [ ] Fake recorder: setTimeout → instant "transcript" after 2s.
- [ ] Script `pnpm --filter @harpa/marketing dev:mock` sets
      `MARKETING_USE_FIXTURES=true`.
- [ ] Commit: `feat(marketing): fixtures mode for voice demo`.

### M2.6 Anti-abuse
- [ ] Rate-limit `POST /demo/session`: 3 / IP / 24h (existing
      `RateLimiter` interface).
- [ ] Turnstile invisible challenge for `POST /demo/session` when
      Cloudflare bot score < 30 (optional; can defer if we rely on
      rate-limiting alone).
- [ ] Reject recordings > 60s server-side: after R2 register, check
      `Content-Length`; if > 10 MB (proxy for > 60s at typical
      bitrates), reject and delete the R2 key.
- [ ] Reject non-audio MIME types in `POST /files/presign` and `POST
      /files` (check `content_type` starts with `audio/`).
- [ ] Tests covering each rejection scenario.
- [ ] Commit: `feat(api): demo anti-abuse limits`.

### M2.7 Playwright E2E
- [ ] Create `apps/marketing/e2e/voice-demo.spec.ts`.
- [ ] Use Playwright's `--use-fake-ui-for-media-stream` +
      `--use-fake-device-for-media-stream` flags + a fixture WAV
      file to simulate mic input.
- [ ] Test flow: click record → wait 3s → click stop → assert
      transcript text appears → assert report HTML appears.
- [ ] Run in CI against `:mock` build (fixtures mode).
- [ ] Commit: `test(marketing): voice demo E2E`.

### M2.8 Documentation
- [ ] Create `docs/marketing/arch-voice-demo.md`:
      - Sequence diagram: browser → `/demo/session` → presign → R2
        PUT → `/files` → `/voice/transcribe` → `/reports/:id/generate`.
      - Error modes: mic denied, upload failed, rate-limit hit,
        transcription failed.
      - Rate-limit table: 3 sessions / IP / 24h, 1 report / session.
      - TTLs: token 15 min, R2 objects 24h.
- [ ] Commit: `docs(marketing): voice demo architecture`.

### M2.9 CORS for demo routes
- [ ] Add CORS middleware for `/demo/*`, `/files/*`, `/voice/*`,
      `/reports/*/generate`:
      ```ts
      app.use('/demo/*', cors({ origin: ['https://harpapro.com', 'http://localhost:3002'], allowMethods: ['POST'], credentials: false }));
      app.use('/files/*', cors({ origin: ['https://harpapro.com', 'http://localhost:3002'], allowMethods: ['POST'], credentials: false }));
      app.use('/voice/*', cors({ origin: ['https://harpapro.com', 'http://localhost:3002'], allowMethods: ['POST'], credentials: false }));
      app.use('/reports/*/generate', cors({ origin: ['https://harpapro.com', 'http://localhost:3002'], allowMethods: ['POST'], credentials: false }));
      ```
- [ ] Commit: `feat(api): cors for demo routes`.

### M2.10 M2 exit
- [ ] Demo works end-to-end on preview deploy with real API.
- [ ] Demo works in `:mock` build with fixtures.
- [ ] Playwright E2E green in CI.
- [ ] Lighthouse still ≥ 95 on non-demo pages, ≥ 85 on demo page.
- [ ] Tag `v0.3.0-marketing`.

## Out of scope for M2
- Anonymous → signed-up conversion ("save this report" CTA after the
  demo) — designed for M3 if we want it before launch.
- Voice-to-PDF export from the demo (defer; demo shows HTML only).
- Multi-language transcription (single language at launch).
- Real-time streaming transcription (batch only at launch).
