# features/

**Vertical slices** for domains that own a state machine, a
non-trivial Context+reducer provider, or a native/external adapter.

Goes here:
- Recorder / pipeline / adapter bundles (e.g. `voice/`).
- Providers + reducers (e.g. `generate/GenerateReportProvider`).

Does NOT go here:
- Plain presentational UI — even domain-named like `VoiceNoteCard`
  → those belong in `components/<domain>/`.
- Generic utilities → `lib/<group>/`.

See `docs/v4/arch-mobile.md` for the full folder rule.
