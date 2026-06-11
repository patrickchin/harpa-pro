# 2026-06-11 — Android resolver intercepted dev-client deep link

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The local Android regression journey failed in module 01
at `Assert that id: input-email is visible`. The screenshot showed the
Expo dev launcher dimmed behind Android's "Open with" resolver sheet,
with both `Harpa Pro` and `Harpa Pro Dev` available. `dumpsys window`
reported `android/com.android.internal.app.ResolverActivity` as the
focused window.

**Root cause.** The physical test device had both prod and dev app
variants installed. The `exp+harpa-pro-v4://expo-development-client`
URL is an implicit intent, so Android asked which matching app should
handle it. The regression flow only dismissed Expo/iOS open prompts and
then waited for the auth screen behind the resolver.

**Fix.** Extend `.maestro/helpers/dismiss-open-dialog.yaml` so the
shared post-`openLink` helper handles Android's resolver sheet too: if
`Open with` is visible, tap `Harpa Pro Dev`, then `Always`. The existing
iOS `Open` confirm handling remains in the same helper. The helper also
re-checks Expo's `Continue` / `Close` first-run sheet after the system
UI branches because the dev menu can appear late once the resolver is
gone.

**Test.** Verified the resolver hierarchy exposes `Open with`,
`Harpa Pro Dev`, and `Always`, then reran the Maestro journey from the
same physical device.

**Pattern.** E2E infra state drift — installed app variants are part of
the device fixture. Flows that use implicit deep links must either
pre-clear Android defaults or handle the resolver UI explicitly.
