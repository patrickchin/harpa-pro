# Expanded Store Screenshot Plan

> **Status: shipped.** The seed script, nine-source iOS capture flow,
> eight-image Play Store set, and checked-in Fastlane screenshots now
> implement this plan. Use `.maestro/README.md` for the current capture
> procedure. The steps below remain as the delivery record.

## Goal

Update the app-store screenshot flow so the generated images show a fuller, more credible HARPA workspace:

- 3-4 projects on the project list.
- A richer reports list with draft and finalized reports.
- A team management screen with 6 members.
- A live voice note recording state.
- A finalized report with placed construction photos near relevant issues and sections.
- A PDF preview of that finalized report.
- A usage screen with varied, interesting OpenAI/Groq usage.
- A finalized-report review discussion with comments from multiple members.
- About 6 construction photos total, using online CC0 sources and placing them by issue or section where appropriate.

## Fixture Strategy

Seed the local development database and local object storage before running Maestro. This keeps the screenshots deterministic and avoids long UI setup steps.

1. Add a store screenshot seed script under `scripts/maestro/`.
2. Seed one owner account plus five team members.
3. Seed four projects, with the main project containing four reports.
4. Seed the main project membership so the members management screen shows a six-person team.
5. Seed a finalized report body with:
   - several issues,
   - detailed sections,
   - workers,
   - materials,
   - next steps,
   - attachment references that place photo notes into the right issue or section.
6. Seed draft notes for the active report, including text, image, and voice-style notes.
7. Seed six construction photos in `app.files` and `app.note_files`, and upload matching objects to local MinIO.
8. Seed `app.llm_usage_events` with OpenAI report/chat rows and Groq transcription rows, plus a limit override so the usage screen has meaningful state.
9. Seed review comments from multiple project members on the main finalized report.

## Photo Set

Keep the two existing CC0 construction photos and add four more CC0 construction-site images from Wikimedia Commons:

- Overview construction site photo.
- Residential construction photo.
- Cement mixer or concrete delivery photo.
- Construction materials platform photo.
- Rebar or foundation work photo.
- Scaffolding or access photo.

Placement target:

- Foundation or rebar photo: issue about water intrusion or slab edge condition.
- Cement mixer photo: concrete pour or delivery issue.
- Scaffolding photo: access and safety section.
- Materials photo: materials or logistics section.
- Overview/residential photos: unplaced photos strip, so the report screenshot can show review work remaining.

## Maestro Flow

Replace the first-pass flow with a seeded capture flow that produces nine source screenshots. Keep all nine in the iOS inventory and curate the Play Store phone set to eight images:

1. `01_projects_list` - four seeded projects.
2. `02_reports_list` - fuller report list with finalized and draft reports.
3. `03_members_team` - member management with six team members.
4. `04_voice_recording` - active voice note recording UI.
5. `05_final_report_issues` - finalized report scrolled to issues with placed photos visible.
6. `06_final_report_sections_unplaced` - finalized report scrolled to detailed sections and unplaced photos.
7. `07_pdf_preview` - PDF preview for the finalized report.
8. `08_usage` - usage screen with populated metrics, OpenAI/Groq model mix, and recent events.
9. `09_report_review` - finalized report review tab with member feedback and the full wrapping title.

## Implemented steps

1. [x] Add the plan document.
2. [x] Add the CC0 fixture photos and source documentation.
3. [x] Keep the source photos in the seed-only fixture directory.
4. [x] Add `scripts/maestro/seed-store-screenshots.sh`.
5. [x] Capture the nine iOS source screenshots with Maestro.
6. [x] Document the seed and capture commands in `.maestro/README.md`.
7. [x] Check in the nine iOS and eight Android listing images.

## Verification

Run:

- `scripts/maestro/seed-store-screenshots.sh`
- `maestro test .maestro/store-screenshots.yaml`
- screenshot dimension validation for Android and iOS Fastlane folders
- `pnpm --filter @harpa/mobile test:nocoverage -- lib/config/env.test.ts lib/camera/pick-and-enqueue-gallery-images.test.ts`
- `pnpm --filter @harpa/mobile typecheck`
- `pnpm --filter @harpa/mobile lint`
- Maestro guards for app IDs, point taps, and test IDs
