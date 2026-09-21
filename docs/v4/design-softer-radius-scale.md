# Softer radius scale

**Status:** revised after visual review on 2026-09-19

**Applies to:** the mobile app and the shared dashboard visual language

## Goal

Make ordinary controls and surfaces feel slightly softer without changing
their size, spacing, hierarchy, or interaction. The adjustment belongs in the
shared radius scale rather than individual screens.

## Radius scale

After the first visual review, every finite radius receives one more 2 px
increase:

| Role | Previous | Updated |
| --- | ---: | ---: |
| Small/default | 6 px | 8 px |
| Control/medium | 8 px | 10 px |
| Card/large | 10 px | 12 px |
| Panel/extra-large | 14 px | 16 px |

Fully circular controls, avatars, status dots, waveform bars, and pill-shaped
controls remain fully rounded. Their geometry already follows the control's
height and should not use a finite radius.

## Implementation

- Mobile NativeWind utilities use the updated scale from
  `apps/mobile/tailwind.config.js`.
- Dashboard semantic radius variables use the matching values from
  `packages/design-tokens/src/tokens.css`.
- Skeleton placeholders use the equivalent finite radius so loading and loaded
  surfaces retain the same silhouette.
- No component gains a fixed height, new padding, or screen-specific radius.

## Acceptance

- Existing `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, and
  `rounded-xl` surfaces render another 2 px rounder.
- `rounded-full` controls remain unchanged.
- Mobile skeletons match the updated control and card shapes.
- Mobile and dashboard lint, typecheck, tests, and builds remain green.
