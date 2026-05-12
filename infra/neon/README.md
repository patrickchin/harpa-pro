# Neon branching

PR previews live on isolated Neon branches. See
`docs/v4/arch-ops.md` for the lifecycle.

```
NEON_API_KEY=... NEON_PROJECT_ID=... pnpm db:branch:create 123
NEON_API_KEY=... NEON_PROJECT_ID=... pnpm db:branch:delete 123
```

`create` prints the new connection URI on stdout — CI captures it and
sets `DATABASE_URL` for the migrate + integration-test steps.
