# components/

**Presentational UI only**, grouped by domain.

Goes here:
- React components that render UI.
- Domain-named widgets (note cards, report cards, file previews).
- Components owned by primitives/ (Card, Button, Input, …).

Does NOT go here:
- State machines, reducers, or Context providers with non-trivial
  logic → `features/<domain>/`.
- Cross-cutting utilities (date, env, api client) → `lib/<group>/`.

See `docs/v4/arch-mobile.md` for the full folder rule.
