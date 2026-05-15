# tmp-p3-smoke

Temporary Maestro smoke flow used to manually verify that every
screen ported up through P3.5 boots in the iOS simulator with the
mock fixtures bundle (`pnpm --filter @harpa/mobile ios:mock`).

**This is a throwaway flow.** It is NOT part of the P3 exit gate —
the canonical journey lives in `core-end-to-end` (P3.13). Delete
this whole folder once P3.13 lands.

## Run

```bash
# 1. Build + install the mock binary on a booted iOS sim:
pnpm --filter @harpa/mobile ios:mock

# 2. Run the flow:
maestro test .maestro/tmp-p3-smoke/p3-screens-smoke.yaml
```

Screenshots are written to the current directory as
`p3-<screen>.png`. Inspect each one to confirm the screen renders
without a red-box error and visually matches the canonical source.
