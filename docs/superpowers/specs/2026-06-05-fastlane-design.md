# Fastlane release tooling design

## Context

Harpa Pro is an Expo/EAS mobile app. The current release architecture already
uses EAS Build, EAS Submit, EAS Update channels, and EAS environments from
`apps/mobile/eas.json`. That remains the standard path for native builds,
signing, and binary submission.

Fastlane will be added as the release command surface for app-store metadata
and repeatable release orchestration. It will not replace EAS for building or
signing the Expo app.

## Decisions

1. Add Fastlane through Bundler at the repo root with `Gemfile` and
   `Gemfile.lock`. Developers run lanes with `bundle exec fastlane`.
2. Place mobile lanes in `apps/mobile/fastlane/Fastfile`, with commands run
   from `apps/mobile` so they use the existing EAS config.
3. Manage App Store and Play Store listing text as checked-in metadata under
   `apps/mobile/fastlane/metadata/`.
4. Seed the first metadata files from existing Harpa Pro product copy:
   hands-free construction site reports from voice, photos, and notes;
   AI-generated daily reports; project history; PDF export; and review before
   sharing.
5. Keep credentials out of git. Apple, Google, Expo, and store credentials are
   read from authenticated local tooling or environment variables.
6. Add a safe `doctor` lane and run only that lane during setup. It validates
   local tooling/config and prints release commands without uploading metadata,
   starting EAS builds, or submitting binaries.

## Lanes

Fastlane will expose these top-level lanes:

| Lane | Purpose |
| --- | --- |
| `doctor` | Validate Bundler/Fastlane, pnpm, EAS CLI, and EAS profiles. Print release commands only. |
| `metadata_preview` | Push checked-in iOS and Android metadata for the preview/internal app-store targets. |
| `metadata_production` | Push checked-in iOS and Android metadata for production app-store targets. |
| `build_preview` | Run `eas build --platform all --profile preview --non-interactive`. |
| `submit_preview` | Run `eas submit --platform all --profile preview --latest --non-interactive`. |
| `beta` | Push preview metadata, then run `eas build --platform all --profile preview --auto-submit-with-profile preview --non-interactive`. |
| `build_production` | Run `eas build --platform all --profile production --non-interactive`. |
| `submit_production` | Run `eas submit --platform all --profile production --latest --non-interactive`. |
| `release` | Push production metadata, then run `eas build --platform all --profile production --auto-submit-with-profile production --non-interactive`. |

The implementation may split metadata lanes by platform internally, but the
public lane names above stay stable.

## Metadata layout

iOS metadata will follow Fastlane `deliver` conventions:

```text
apps/mobile/fastlane/metadata/ios/en-US/
  name.txt
  subtitle.txt
  description.txt
  keywords.txt
  promotional_text.txt
  support_url.txt
  marketing_url.txt
  privacy_url.txt
```

Android metadata will follow Fastlane `supply` conventions:

```text
apps/mobile/fastlane/metadata/android/en-US/
  title.txt
  short_description.txt
  full_description.txt
  changelogs/default.txt
```

The first copy will avoid unsupported claims, unverified pricing language, and
promises about future roadmap items. Roadmap items stay out of store metadata
until they are shipped.

## EAS config

`apps/mobile/eas.json` already has build profiles for `development`,
`preview`, and `production`. The implementation will keep the existing
`production` submit profile and add a `preview` submit profile so Fastlane can
call named EAS submit profiles for both release tracks. Preview and production
build profiles use store distribution; development builds remain internal.
Android preview submission targets the internal track. iOS submission uses the
App Store Connect app configured for the selected bundle identifier.

## Documentation

Docs under `docs/v4/` will describe the release division of responsibility:

- Fastlane owns store metadata files and release lanes.
- EAS owns Expo native builds, signing, binary submission, and OTA updates.
- `doctor` is safe to run during setup.
- Build/submit lanes require valid Expo, Apple, and Google Play access before
  they can run.

## Validation

The setup is considered complete when:

1. `bundle exec fastlane doctor` succeeds from the repo root.
2. The doctor output shows the exact preview and production EAS commands for
   standalone build/submit lanes and the beta/release auto-submit lanes.
3. No lane run during setup uploads metadata, starts an EAS build, or submits a
   binary.
4. Docs record the new Fastlane + EAS release workflow.
