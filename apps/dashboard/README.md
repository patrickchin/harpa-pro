# Harpa Pro office dashboard

`@harpa/dashboard` is the React + Vite office companion to the mobile app. It
uses the same API, project roles, report body, and draft/finalized lifecycle.
The dashboard focuses on project and member management, source-note review,
keyboard-first report editing, finalization, review comments, and PDF download.
Voice, camera, gallery, and document capture remain mobile-first.

## Local development

```bash
cp apps/dashboard/.env.example apps/dashboard/.env
pnpm --filter @harpa/dashboard dev
```

`VITE_API_BASE_URL` is required and must be an absolute URL. The optional
`VITE_PASSWORD_ACCOUNT_EMAILS` list exposes the configured test/demo password
sign-in choice; the password remains server-side. Sentry variables are
optional. The dashboard validates these variables in `src/lib/env.ts`.

## Verification

```bash
pnpm --filter @harpa/dashboard lint
pnpm --filter @harpa/dashboard typecheck
pnpm --filter @harpa/dashboard test
pnpm --filter @harpa/dashboard test:e2e
```

The deployed live journey runs separately because it needs an isolated Fly and
Neon preview plus operator-managed credentials.

## Source-of-truth docs

- [Office dashboard design](../../docs/v4/design-office-dashboard.md)
- [Visual system](../../docs/v4/design-dashboard-visual-system.md)
- [Authentication and browser sessions](../../docs/v4/arch-auth-and-rls.md)
- [Cloudflare Pages runbook](../../docs/v4/ops-dashboard-cloudflare-pages.md)
- [Testing strategy](../../docs/v4/arch-testing.md)
