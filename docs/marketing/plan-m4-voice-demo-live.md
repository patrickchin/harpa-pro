# M4 — Voice demo (live API wiring)

> **Deferred — do not start until after M3 launch.** At launch the
> demo runs entirely off committed fixtures (see
> [`plan-m2-voice-demo.md`](plan-m2-voice-demo.md)). This phase
> swaps the fake pipeline for real calls into the existing Hono API.

Goal: replace the scripted `setTimeout` reveal in `VoiceDemo.tsx`
with a real anonymous demo session that uploads the recording, calls
`/voice/transcribe`, and calls `/reports/:id/generate` — bound by a
short-lived scoped JWT and rate-limited at the API edge.

## Exit gate
- [ ] Anonymous demo-session flow live: `POST /demo/session` →
      short-lived JWT (`scope=demo`, 15 min TTL) → presign R2 upload
      → `POST /files` → `POST /voice/transcribe` → `POST
      /reports/:id/generate` → result.
- [ ] Anonymous rate-limit budget: 3 sessions / IP / 24h, 1 report /
      session.
- [ ] Maximum recording length 60s (server-enforced).
- [ ] R2 demo objects auto-delete after 24h.
- [ ] CORS configured for `/demo/*`, `/files/*`, `/voice/*`,
      `/reports/*/generate` from `harpapro.com` and the dev origin.
- [ ] Per-request scope tests prove a `demo` token cannot touch real
      user data and vice-versa.
- [ ] `MARKETING_USE_FIXTURES=true` build still works (used for E2E
      and offline dev) — keeps M2's fixtures as a fallback.
- [ ] Playwright E2E expanded to cover the real pipeline against a
      Testcontainers-backed API (or against fixtures mode in CI; live
      pipeline only smoke-tested manually).
- [ ] Lighthouse on the demo page: perf ≥ 85.

## Tasks

### M4.1 Demo session token
- [ ] New Hono route `POST /demo/session` issues a short-lived JWT
      (15 min TTL, `scope=demo`, `sessionId=<uuid>`,
      `reportId=<uuid>`).
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

### M4.2 R2 demo bucket prefix + lifecycle
- [ ] Demo uploads land under `demo/<sessionId>/` prefix in the
      existing R2 bucket (or separate `harpa-demo` bucket if we want
      isolation).
- [ ] Cloudflare R2 lifecycle rule: delete objects under `demo/`
      prefix after 24h.
- [ ] Document in `docs/marketing/arch-voice-demo.md`.
- [ ] Commit: `chore(infra): r2 demo prefix lifecycle`.

### M4.3 Replace fake pipeline in VoiceDemo
- [ ] Keep the M2 component shape (`VoiceDemo.tsx`); replace the
      scripted `setTimeout` block with a real pipeline driven by a
      `useDemoPipeline()` hook.
- [ ] Pipeline:
      1. `POST /demo/session` → `{ token, sessionId, reportId }`.
      2. `POST /files/presign` with `Authorization: Bearer <token>`,
         `key_prefix=demo/<sessionId>/`, `content_type=audio/webm`.
      3. `PUT` blob directly to R2 signed URL.
      4. `POST /files` to register the uploaded file.
      5. `POST /voice/transcribe` with the file ID; render transcript.
      6. `POST /reports/:reportId/generate` with the transcript text
         as a single note; render report.
- [ ] Preserve the M2 fallback: if `MARKETING_USE_FIXTURES=true`,
      skip the API entirely and reuse the M2 fixtures. Keeps E2E /
      offline dev intact.
- [ ] Reuse the existing UI states from M2; add `uploading` and
      `error.<step>` variants.
- [ ] Commit: `feat(marketing): wire voice demo to live api`.

### M4.4 Anti-abuse
- [ ] Rate-limit `POST /demo/session`: 3 / IP / 24h (existing
      `RateLimiter` interface).
- [ ] Turnstile invisible challenge for `POST /demo/session` when
      Cloudflare bot score < 30 (optional; defer if rate-limit alone
      proves enough).
- [ ] Reject recordings > 60s server-side: after R2 register, check
      `Content-Length`; if > 10 MB, reject and delete the R2 key.
- [ ] Reject non-audio MIME types in `POST /files/presign` and
      `POST /files`.
- [ ] Tests covering each rejection scenario.
- [ ] Commit: `feat(api): demo anti-abuse limits`.

### M4.5 CORS for demo routes
- [ ] Add CORS middleware for `/demo/*`, `/files/*`, `/voice/*`,
      `/reports/*/generate`:
      ```ts
      app.use('/demo/*', cors({ origin: ['https://harpapro.com', 'http://localhost:3002'], allowMethods: ['POST'], credentials: false }));
      app.use('/files/*', cors({ origin: ['https://harpapro.com', 'http://localhost:3002'], allowMethods: ['POST'], credentials: false }));
      app.use('/voice/*', cors({ origin: ['https://harpapro.com', 'http://localhost:3002'], allowMethods: ['POST'], credentials: false }));
      app.use('/reports/*/generate', cors({ origin: ['https://harpapro.com', 'http://localhost:3002'], allowMethods: ['POST'], credentials: false }));
      ```
- [ ] Commit: `feat(api): cors for demo routes`.

### M4.6 Documentation
- [ ] Expand `docs/marketing/arch-voice-demo.md`:
      - Sequence diagram: browser → `/demo/session` → presign → R2
        PUT → `/files` → `/voice/transcribe` → `/reports/:id/generate`.
      - Error modes: mic denied, upload failed, rate-limit hit,
        transcription failed, generation failed.
      - Rate-limit table: 3 sessions / IP / 24h, 1 report / session.
      - TTLs: token 15 min, R2 objects 24h.
      - Fixtures-fallback path retained from M2.
- [ ] Update the privacy page (originally written in M3.2) to
      reflect that demo audio is now uploaded, transcribed, and
      retained for 24h before deletion.
- [ ] Commit: `docs(marketing): voice demo (live) architecture`.

### M4.7 M4 exit
- [ ] Demo works end-to-end on production with the real API.
- [ ] Demo still works in `:mock` build (fixtures fallback intact).
- [ ] Playwright E2E green in CI.
- [ ] Lighthouse ≥ 85 on demo page.
- [ ] Tag `v0.5.0-marketing`.

## Out of scope for M4
- Anonymous → signed-up conversion ("save this report" CTA after the
  demo) — separate decision.
- Voice-to-PDF export from the demo — defer.
- Multi-language transcription — defer.
- Real-time streaming transcription — defer.
