# Changelog

All notable user-facing changes to Harpa Pro are recorded here. Add changes
under `Unreleased`, then move them into a dated version section when preparing
a store release. Store-facing release notes should be a concise adaptation of
the matching section.

This changelog starts with version 0.1.56. Earlier releases remain available
in the repository's Git history and tags.

## [Unreleased]

### Added

- Added the office dashboard for project/member management and keyboard-first
  report editing against the same mobile report model.
- Added a protected administration service-status view.

### Changed

- Separated the private administration console from the public website so it
  can be deployed and verified independently before the
  `admin.harpapro.com` cutover.

### Fixed

- Persisted mobile query data is now isolated by signed-in account.

## [0.1.65] - 2026-07-31

### Added

- Added a protected administration activity feed for reviewing important
  account, project, report, and note events.

### Changed

- Limited iOS photo access to in-app capture and camera-roll saves, and removed
  profile-photo controls that required photo-library browsing.
- Made report generation retries and uploads safer across repeated requests,
  server instances, and account changes.
- Strengthened project-member permissions so viewers remain read-only and
  editors cannot perform owner-only actions.

### Fixed

- Account deletion now removes associated stored files instead of leaving
  orphaned uploads.
- Hardened production deployment checks, database snapshots, storage-worker
  recovery, dependency review, and secret handling.

## [0.1.56] - 2026-07-28

### Added

- Added review comments to published reports so project members can discuss a
  report from its new Review tab.

### Changed

- Improved report-detail headers so long report titles wrap cleanly below the
  navigation controls.
- Aligned the Report and Review tabs with report actions and simplified the
  review comment composer.

[Unreleased]: https://github.com/patrickchin/harpa-pro/compare/v0.1.65...HEAD
[0.1.65]: https://github.com/patrickchin/harpa-pro/compare/v0.1.56...v0.1.65
[0.1.56]: https://github.com/patrickchin/harpa-pro/compare/v0.1.55...v0.1.56
