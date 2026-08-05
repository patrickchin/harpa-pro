# lib/

**Cross-cutting utilities**, grouped into subfolders by concern.
Nothing flat at the `lib/` root — a CI guard enforces this.

Subfolders:

- `api/`, `auth/`, `audio/`, `camera/`, `config/`, `dialogs/`,
  `files/`, `nav/`, `native/`, `notes/`, `projects/`,
  `reports/`, `telemetry/`, `uploads/`, `util/`, plus
  `ai/`, `design-tokens/`, `dev-fixtures/`.

Goes here:

- Pure helpers, hooks without their own UI, type definitions,
  client wrappers (api, dialogs).

Does NOT go here:

- Presentational UI → `components/<domain>/`.
- Anything with significant stateful coordination → `features/<domain>/`.

See `docs/v4/arch-mobile.md` for the full folder rule.
