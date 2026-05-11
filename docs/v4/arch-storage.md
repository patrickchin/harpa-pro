# Storage (Cloudflare R2)

> Replaces Supabase Storage.
> Companion: [arch-api-design.md](arch-api-design.md) §Files.

## Why R2

- S3-compatible (works with `@aws-sdk/client-s3` + presigners).
- Zero egress.
- Free tier covers dev.
- Our deploy lives on Fly.io; R2 is geographically close to all
  edge regions.

## Buckets

| Bucket | Purpose | Access |
|---|---|---|
| `harpa-voice` | Original voice recordings (m4a) | Private. Signed URLs only. |
| `harpa-images` | Photo notes (jpeg) | Private. Signed URLs. |
| `harpa-documents` | User-uploaded documents (pdf, docx, …) | Private. Signed URLs. |
| `harpa-reports` | Rendered report PDFs | Private. Signed URLs. |
| `harpa-fixtures` | Replay assets used in `:mock` (small audio + jpeg) | Public. CDN. |

Bucket setup lives in `infra/r2/bootstrap.ts` (idempotent).

## Upload flow

```mermaid
sequenceDiagram
  autonumber
  participant App as Mobile
  participant API as Hono
  participant R2 as R2

  App->>API: POST /files/presign { kind, contentType, sizeBytes }
  API-->>App: { uploadUrl, fileKey, expiresAt }
  App->>R2: PUT uploadUrl (Uint8Array body)
  R2-->>App: 200
  App->>API: POST /files { kind, fileKey, sizeBytes }
  API-->>App: { fileId }
  App->>API: POST /reports/:id/notes { kind:'image', fileId }
  API-->>App: { noteId }
```

Pitfall 8 rule: **always** create the timeline note in the same
flow — even for documents. The mobile upload queue calls
`createNote` after `createFile` unconditionally.

## Download flow

`GET /files/:id/url` returns `{ url, expiresAt }`. Signed URLs have
a 5-minute TTL and are scoped to GET. Mobile caches signed URLs in
React Query with `staleTime: 4 minutes`.

## Security

- Presign URLs are scoped to PUT, content-type, content-length, and
  prefix-keyed by `users/<userId>/`. Server constructs the key —
  client cannot specify it.
- Bucket policies deny all public access to non-fixture buckets.
- File metadata (kind, owner, project, report) lives in
  `app.files`, scoped per request like every other table.
- Lifecycle: `harpa-voice` and `harpa-images` files referenced from
  no live note are GC'd after 7 days by an R2 lifecycle rule.

## Fixture mode

When `EXPO_PUBLIC_USE_FIXTURES=true` (mobile) or `R2_FIXTURE_MODE=replay`
(API):

- `POST /files/presign` returns a fake URL pointing at the local
  fixture server (or a public URL in `harpa-fixtures`).
- The mobile upload queue PUTs to it; in tests we intercept with MSW.
- `POST /files` accepts a synthetic `fileKey` and stores a row
  pointing at a public fixture asset.
- Tests that exercise transcription wire `voice.fixture.m4a` from
  `harpa-fixtures` so the OpenAI fixture replay matches.

This means **no R2 calls in CI**.
