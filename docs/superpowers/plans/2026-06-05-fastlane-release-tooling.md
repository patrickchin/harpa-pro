# Fastlane Release Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reproducible Fastlane tooling that manages App Store / Play Store
metadata and wraps the existing Expo/EAS build and submit profiles.

**Architecture:** Fastlane becomes the release command surface, while EAS stays
the authority for Expo native builds, signing, binary submission, and OTA
updates. Store metadata is checked in under `apps/mobile/fastlane/metadata/`,
and the first safe lane, `doctor`, validates config and prints release
commands without uploading metadata or starting remote builds.

**Tech Stack:** Ruby Bundler, Fastlane, Expo EAS CLI, pnpm, JSON config,
Markdown docs.

**Spec:**
[`docs/superpowers/specs/2026-06-05-fastlane-design.md`](../specs/2026-06-05-fastlane-design.md)

---

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `Gemfile` | create | Pin Fastlane through Bundler so every machine uses the same release tooling. |
| `Gemfile.lock` | create | Generated dependency lockfile from `bundle install`. |
| `apps/mobile/eas.json` | modify | Add named `preview` submit profile and make production submit intent explicit. |
| `apps/mobile/fastlane/Fastfile` | create | Define Fastlane lanes for doctor, metadata, EAS build, EAS submit, beta, and release. |
| `apps/mobile/fastlane/metadata/ios/en-US/*.txt` | create | App Store metadata source files managed by Fastlane `deliver`. |
| `apps/mobile/fastlane/metadata/android/en-US/*.txt` | create | Play Store metadata source files managed by Fastlane `supply`. |
| `docs/v4/arch-ops.md` | modify | Document Fastlane metadata ownership and EAS build/submit ownership. |
| `docs/v4/plan-p5-beta-ga.md` | modify | Record the completed Fastlane release-tooling setup under P5.1. |

---

## Task 1: Install Fastlane with Bundler

**Files:**
- Create: `Gemfile`
- Create: `Gemfile.lock`

- [ ] **Step 1: Write the Bundler manifest**

Create `Gemfile` at the repository root:

```ruby
# frozen_string_literal: true

source "https://rubygems.org"

# The macOS system Ruby in this workspace is 2.6.x. Fastlane 2.228.0 is the
# newest checked version that supports Ruby 2.6, keeping local setup
# reproducible without requiring a Ruby version manager.
ruby ">= 2.6.0"

gem "fastlane", "2.228.0"
```

- [ ] **Step 2: Install with Bundler**

Run:

```bash
bundle install
```

Expected: `Gemfile.lock` is created and ends with a `BUNDLED WITH` section.
If the bundled `bundle` executable refuses to resolve the file because it is
too old, run:

```bash
gem install bundler -v 2.4.22
bundle _2.4.22_ install
```

Expected: `bundle _2.4.22_ install` succeeds and `Gemfile.lock` is created.

- [ ] **Step 3: Confirm Fastlane is available through Bundler**

Run:

```bash
bundle exec fastlane --version
```

Expected: output includes `fastlane 2.228.0`.

- [ ] **Step 4: Commit**

```bash
git add Gemfile Gemfile.lock
git commit -m "chore(mobile): add bundled Fastlane

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Add EAS submit profiles

**Files:**
- Modify: `apps/mobile/eas.json`

- [ ] **Step 1: Replace the submit section**

Edit `apps/mobile/eas.json` and replace:

```json
  "submit": {
    "production": {}
  }
```

with:

```json
  "submit": {
    "preview": {
      "ios": {},
      "android": {
        "track": "internal"
      }
    },
    "production": {
      "ios": {},
      "android": {
        "track": "production"
      }
    }
  }
```

- [ ] **Step 2: Validate JSON syntax**

Run:

```bash
ruby -rjson -e 'JSON.parse(File.read("apps/mobile/eas.json")); puts "eas.json ok"'
```

Expected: `eas.json ok`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/eas.json
git commit -m "chore(mobile): add EAS submit profiles

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Add checked-in store metadata

**Files:**
- Create: `apps/mobile/fastlane/metadata/ios/en-US/name.txt`
- Create: `apps/mobile/fastlane/metadata/ios/en-US/subtitle.txt`
- Create: `apps/mobile/fastlane/metadata/ios/en-US/description.txt`
- Create: `apps/mobile/fastlane/metadata/ios/en-US/keywords.txt`
- Create: `apps/mobile/fastlane/metadata/ios/en-US/promotional_text.txt`
- Create: `apps/mobile/fastlane/metadata/ios/en-US/support_url.txt`
- Create: `apps/mobile/fastlane/metadata/ios/en-US/marketing_url.txt`
- Create: `apps/mobile/fastlane/metadata/ios/en-US/privacy_url.txt`
- Create: `apps/mobile/fastlane/metadata/android/en-US/title.txt`
- Create: `apps/mobile/fastlane/metadata/android/en-US/short_description.txt`
- Create: `apps/mobile/fastlane/metadata/android/en-US/full_description.txt`
- Create: `apps/mobile/fastlane/metadata/android/en-US/changelogs/default.txt`

- [ ] **Step 1: Create iOS metadata files**

Create the iOS metadata directory:

```bash
mkdir -p apps/mobile/fastlane/metadata/ios/en-US
```

Create these files with the exact contents below.

`apps/mobile/fastlane/metadata/ios/en-US/name.txt`:

```text
Harpa Pro
```

`apps/mobile/fastlane/metadata/ios/en-US/subtitle.txt`:

```text
Site reports by voice
```

`apps/mobile/fastlane/metadata/ios/en-US/promotional_text.txt`:

```text
Create construction site reports from voice notes, photos, and field updates. Review the draft, then share a clean PDF before leaving the jobsite.
```

`apps/mobile/fastlane/metadata/ios/en-US/keywords.txt`:

```text
construction,reports,jobsite,voice,photos,PDF,foreman,supervisor,daily report
```

`apps/mobile/fastlane/metadata/ios/en-US/support_url.txt`:

```text
https://harpapro.com
```

`apps/mobile/fastlane/metadata/ios/en-US/marketing_url.txt`:

```text
https://harpapro.com
```

`apps/mobile/fastlane/metadata/ios/en-US/privacy_url.txt`:

```text
https://harpapro.com/privacy
```

`apps/mobile/fastlane/metadata/ios/en-US/description.txt`:

```text
Harpa Pro helps construction foremen and site supervisors turn jobsite captures into clean daily reports.

Capture the day
- Add voice notes while walking the site.
- Attach photos and field updates to the right project.
- Keep context organized under each job.

Generate and review
- Turn notes, photos, and voice updates into a structured daily site report.
- Review the draft before anything is shared.
- Export a clean PDF for your office, client, or team.

Built for construction pace
- Designed for hands-busy field updates.
- Project-based history keeps reports easy to find.
- Focused on US residential and light-commercial construction teams during early access.
```

- [ ] **Step 2: Create Android metadata files**

Create the Android metadata directories:

```bash
mkdir -p apps/mobile/fastlane/metadata/android/en-US/changelogs
```

Create these files with the exact contents below.

`apps/mobile/fastlane/metadata/android/en-US/title.txt`:

```text
Harpa Pro
```

`apps/mobile/fastlane/metadata/android/en-US/short_description.txt`:

```text
Create construction site reports from voice notes, photos, and field updates.
```

`apps/mobile/fastlane/metadata/android/en-US/full_description.txt`:

```text
Harpa Pro helps construction foremen and site supervisors turn jobsite captures into clean daily reports.

Capture the day
- Add voice notes while walking the site.
- Attach photos and field updates to the right project.
- Keep context organized under each job.

Generate and review
- Turn notes, photos, and voice updates into a structured daily site report.
- Review the draft before anything is shared.
- Export a clean PDF for your office, client, or team.

Built for construction pace
- Designed for hands-busy field updates.
- Project-based history keeps reports easy to find.
- Focused on US residential and light-commercial construction teams during early access.
```

`apps/mobile/fastlane/metadata/android/en-US/changelogs/default.txt`:

```text
Initial Fastlane-managed metadata seed for Harpa Pro internal testing.
```

- [ ] **Step 3: Validate metadata length limits**

Run:

```bash
ruby -e '
checks = {
  "apps/mobile/fastlane/metadata/ios/en-US/name.txt" => 30,
  "apps/mobile/fastlane/metadata/ios/en-US/subtitle.txt" => 30,
  "apps/mobile/fastlane/metadata/ios/en-US/keywords.txt" => 100,
  "apps/mobile/fastlane/metadata/ios/en-US/promotional_text.txt" => 170,
  "apps/mobile/fastlane/metadata/android/en-US/title.txt" => 30,
  "apps/mobile/fastlane/metadata/android/en-US/short_description.txt" => 80
}
checks.each do |path, limit|
  value = File.read(path).strip
  abort "#{path} is #{value.length}, over #{limit}" if value.length > limit
end
puts "metadata lengths ok"
'
```

Expected: `metadata lengths ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/fastlane/metadata
git commit -m "chore(mobile): seed store metadata

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Add Fastlane lanes

**Files:**
- Create: `apps/mobile/fastlane/Fastfile`

- [ ] **Step 1: Create the Fastfile**

Create `apps/mobile/fastlane/Fastfile`:

```ruby
# frozen_string_literal: true

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
MOBILE_DIR = File.expand_path("..", __dir__)
EAS_JSON_PATH = File.join(MOBILE_DIR, "eas.json")

IOS_BUNDLE_IDS = {
  preview: "com.harpa.pro.dev",
  production: "com.harpa.pro"
}.freeze

ANDROID_PACKAGE_NAMES = {
  preview: "com.harpa.pro.dev",
  production: "com.harpa.pro"
}.freeze

IOS_METADATA_PATH = File.join(MOBILE_DIR, "fastlane", "metadata", "ios")
ANDROID_METADATA_PATH = File.join(MOBILE_DIR, "fastlane", "metadata", "android")

def eas_config
  JSON.parse(File.read(EAS_JSON_PATH))
end

def ensure_command!(command)
  return if system("command -v #{command} >/dev/null 2>&1")

  UI.user_error!("Missing required command: #{command}")
end

def ensure_eas_profile!(section, profile)
  profiles = eas_config.fetch(section.to_s, {})
  return if profiles.key?(profile.to_s)

  UI.user_error!("Missing apps/mobile/eas.json #{section}.#{profile}")
end

def ensure_file!(path)
  return if File.file?(path)

  UI.user_error!("Missing required file: #{path.sub("#{REPO_ROOT}/", "")}")
end

def run_in_mobile!(command)
  Dir.chdir(MOBILE_DIR) do
    sh(command)
  end
end

def eas_build_command(profile)
  "pnpm exec eas build --platform all --profile #{profile} --non-interactive"
end

def eas_submit_command(profile)
  "pnpm exec eas submit --platform all --profile #{profile} --latest --non-interactive"
end

def print_eas_command(label, command)
  UI.message("#{label}: cd apps/mobile && #{command}")
end

def ensure_metadata_tree!
  [
    "ios/en-US/name.txt",
    "ios/en-US/subtitle.txt",
    "ios/en-US/description.txt",
    "ios/en-US/keywords.txt",
    "ios/en-US/promotional_text.txt",
    "ios/en-US/support_url.txt",
    "ios/en-US/marketing_url.txt",
    "ios/en-US/privacy_url.txt",
    "android/en-US/title.txt",
    "android/en-US/short_description.txt",
    "android/en-US/full_description.txt",
    "android/en-US/changelogs/default.txt"
  ].each do |relative_path|
    ensure_file!(File.join(MOBILE_DIR, "fastlane", "metadata", relative_path))
  end
end

def upload_ios_metadata!(track)
  deliver(
    app_identifier: IOS_BUNDLE_IDS.fetch(track),
    metadata_path: IOS_METADATA_PATH,
    skip_binary_upload: true,
    skip_screenshots: true,
    submit_for_review: false,
    force: true,
    run_precheck_before_submit: false
  )
end

def upload_android_metadata!(track)
  supply(
    package_name: ANDROID_PACKAGE_NAMES.fetch(track),
    track: track == :preview ? "internal" : "production",
    metadata_path: ANDROID_METADATA_PATH,
    skip_upload_apk: true,
    skip_upload_aab: true,
    skip_upload_images: true,
    skip_upload_screenshots: true
  )
end

  desc "Validate Fastlane/EAS release setup without uploading or building"
  lane :doctor do
    ensure_command!("pnpm")
    ensure_file!(EAS_JSON_PATH)
    ensure_metadata_tree!

    %i[preview production].each do |profile|
      ensure_eas_profile!(:build, profile)
      ensure_eas_profile!(:submit, profile)
    end

    run_in_mobile!("pnpm exec eas --version")

    UI.header("Safe Fastlane doctor complete")
    UI.message("No metadata was uploaded.")
    UI.message("No EAS build was started.")
    UI.message("No EAS submit was started.")
    print_eas_command("Preview build", eas_build_command(:preview))
    print_eas_command("Preview submit", eas_submit_command(:preview))
    print_eas_command("Production build", eas_build_command(:production))
    print_eas_command("Production submit", eas_submit_command(:production))
  end

  desc "Upload preview/internal App Store and Play Store metadata"
  lane :metadata_preview do
    ensure_metadata_tree!
    upload_ios_metadata!(:preview)
    upload_android_metadata!(:preview)
  end

  desc "Upload production App Store and Play Store metadata"
  lane :metadata_production do
    ensure_metadata_tree!
    upload_ios_metadata!(:production)
    upload_android_metadata!(:production)
  end

  desc "Run EAS preview build for iOS and Android"
  lane :build_preview do
    ensure_eas_profile!(:build, :preview)
    run_in_mobile!(eas_build_command(:preview))
  end

  desc "Submit latest EAS preview build to TestFlight and Play internal"
  lane :submit_preview do
    ensure_eas_profile!(:submit, :preview)
    run_in_mobile!(eas_submit_command(:preview))
  end

  desc "Upload preview metadata, build, and submit preview binaries"
  lane :beta do
    metadata_preview
    build_preview
    submit_preview
  end

  desc "Run EAS production build for iOS and Android"
  lane :build_production do
    ensure_eas_profile!(:build, :production)
    run_in_mobile!(eas_build_command(:production))
  end

  desc "Submit latest EAS production build to App Store and Play production"
  lane :submit_production do
    ensure_eas_profile!(:submit, :production)
    run_in_mobile!(eas_submit_command(:production))
  end

  desc "Upload production metadata, build, and submit production binaries"
  lane :release do
    metadata_production
    build_production
    submit_production
  end
```

- [ ] **Step 2: List lanes**

Run:

```bash
bundle exec fastlane lanes
```

Expected: output lists `doctor`, `metadata_preview`, `metadata_production`,
`build_preview`, `submit_preview`, `beta`, `build_production`,
`submit_production`, and `release`.

- [ ] **Step 3: Run the safe lane**

Run:

```bash
bundle exec fastlane doctor
```

Expected:

- output includes `Safe Fastlane doctor complete`,
- output includes `No metadata was uploaded.`,
- output includes `No EAS build was started.`,
- output includes `No EAS submit was started.`,
- output prints the four EAS build/submit commands from the spec.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/fastlane/Fastfile
git commit -m "chore(mobile): add Fastlane release lanes

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Document the release workflow

**Files:**
- Modify: `docs/v4/arch-ops.md`
- Modify: `docs/v4/plan-p5-beta-ga.md`

- [ ] **Step 1: Update the mobile hosting section**

In `docs/v4/arch-ops.md`, replace the first mobile bullet that starts with
`- **Mobile**: EAS Build + EAS Update for OTA.` with:

```md
- **Mobile**: Fastlane + EAS. Fastlane owns checked-in App Store /
  Play Store metadata and local release lanes; EAS owns Expo native
  builds, signing, binary submission, and OTA updates. TestFlight +
  Play internal track remain the beta distribution targets. Three build
  profiles live in `apps/mobile/eas.json`:
```

- [ ] **Step 2: Add a release tooling subsection**

In `docs/v4/arch-ops.md`, after the mobile build-profile bullets and before
`- **Docs site**`, add:

````md
  Release operators run Fastlane from the repo root:

  ```sh
  bundle install --path vendor/bundle
  bundle exec fastlane doctor
  bundle exec fastlane beta
  bundle exec fastlane release
  ```

  `doctor` is safe: it validates Bundler/Fastlane, `pnpm`, EAS config,
  and metadata files, then prints the EAS commands without uploading
  metadata, starting a build, or submitting a binary. `beta` pushes
  preview/internal store metadata, then calls the `preview` EAS build
  and submit profiles. `release` does the same for production. Store,
  Expo, Apple, and Google credentials stay outside git and come from the
  authenticated local tools or environment variables.
````

- [ ] **Step 3: Update the deployment flow lines**

In `docs/v4/arch-ops.md`, replace:

```md
  ↳ EAS staging build (TestFlight internal — planned)
```

with:

```md
  ↳ Fastlane `beta` (manual): metadata -> EAS preview build -> submit
```

Replace:

```md
  ↳ EAS production build (manual approve — planned)
```

with:

```md
  ↳ Fastlane `release` (manual approve): metadata -> EAS production build -> submit
```

- [ ] **Step 4: Record the completed P5.1 setup item**

In `docs/v4/plan-p5-beta-ga.md`, under `### P5.1 TestFlight / Play internal`,
add this checked item before `App Store Connect + Play Console set up`:

```md
- [x] Fastlane metadata files + EAS release lanes added.
```

- [ ] **Step 5: Commit**

```bash
git add docs/v4/arch-ops.md docs/v4/plan-p5-beta-ga.md
git commit -m "docs(mobile): document Fastlane release workflow

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Final validation and review

**Files:**
- Validate only.

- [ ] **Step 1: Re-run the safe lane**

Run:

```bash
bundle exec fastlane doctor
```

Expected: same safe output as Task 4. No metadata upload, no EAS build, no EAS
submit.

- [ ] **Step 2: Validate changed JSON and docs references**

Run:

```bash
ruby -rjson -e 'JSON.parse(File.read("apps/mobile/eas.json")); puts "eas.json ok"'
grep -R "Fastlane" -n docs/v4/arch-ops.md docs/v4/plan-p5-beta-ga.md
```

Expected: JSON parse succeeds and grep prints the Fastlane release workflow
lines.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git --no-pager status --short
git --no-pager log --oneline -6
```

Expected: working tree is clean and recent commits include the Fastlane design,
Bundler install, EAS submit profiles, metadata, lanes, and docs commits.

- [ ] **Step 4: Request post-commit review**

Run the repo-required post-commit code review process for the latest commit.
Expected verdict: no P0 or P1 findings. If the reviewer reports a real P0/P1,
fix it in a new commit and re-run this validation task.
