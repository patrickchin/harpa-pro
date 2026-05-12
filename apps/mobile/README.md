# Mobile (Expo + NativeWind v4)

P0.6 scaffold. Boots a blank screen.

```
pnpm --filter @harpa/mobile ios          # real API
pnpm --filter @harpa/mobile ios:mock     # EXPO_PUBLIC_USE_FIXTURES=true
pnpm --filter @harpa/mobile test
pnpm --filter @harpa/mobile typecheck
```

## Rules (enforced)

- Read `EXPO_PUBLIC_*` via `lib/env.ts` only — never `process.env.EXPO_PUBLIC_*!`.
- Generate UUIDs via `lib/uuid.ts` (`expo-crypto`). Never roll a custom fallback.
- In-app dialogs go through `lib/dialogs/useAppDialogSheet.ts`. Don't import `Alert` from `react-native`.
- No hex colours in components — extend `tailwind.config.js`.
- No `react-native-unistyles` — we are on NativeWind.

See `docs/v4/pitfalls.md` for the why.
