# Mobile (Expo + NativeWind v4)

The production mobile app uses Expo SDK 55, Expo Router, React 19,
NativeWind v4, and TanStack Query. The app supports email one-time-code
sign-in, project and report workflows, photo and voice notes, PDF export,
usage limits, and store builds through EAS.

```sh
pnpm --filter @harpa/mobile ios          # local dev client
pnpm --filter @harpa/mobile android      # local dev client
pnpm --filter @harpa/mobile start        # Metro for an installed dev client
pnpm --filter @harpa/mobile ios:mock     # deterministic native input fixtures
pnpm --filter @harpa/mobile test
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile lint
```

`ios:mock` sets `EXPO_PUBLIC_USE_FIXTURES=true`. This selects local
input fixtures such as the canned voice recording. It does not select
the API server's AI mode. The API uses its own `AI_LIVE` setting.

EAS profiles and API targets are in `eas.json`. Production uses
`com.harpa.pro`; development and preview use `com.harpa.pro.dev`.

## Rules (enforced)

- Read `EXPO_PUBLIC_*` through `lib/config/env.ts` only. Native adapter
  test seams are the documented exception.
- Generate UUIDs via `lib/uuid.ts` (`expo-crypto`). Never roll a custom fallback.
- In-app dialogs go through `lib/dialogs/useAppDialogSheet.ts`. Don't import `Alert` from `react-native`.
- No hex colours in components — extend `tailwind.config.js`.
- No `react-native-unistyles` — we are on NativeWind.

See `docs/v4/arch-mobile.md` for the current architecture and
`docs/v4/pitfalls.md` for the project rules.
