/**
 * Shared shadow / elevation tokens for primitives. Ported verbatim
 * from `../haru3-reports/apps/mobile/lib/surface-depth.ts` on branch
 * `dev` (the canonical port source — AGENTS.md hard rule #1).
 *
 * NativeWind has no first-class shadow utilities that match the
 * design system, so primitives apply these via inline `style=` props.
 * Tokens stay in one place to keep raised / floating surfaces
 * consistent across Button, Card, Input, StatTile, etc.
 */
import { colors } from './design-tokens/colors';

export type SurfaceDepth = 'flat' | 'raised' | 'floating';

const SURFACE_DEPTH_STYLES = {
  flat: {
    shadowColor: colors.surface.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  raised: {
    shadowColor: colors.surface.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: colors.surface.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
} as const;

export function getSurfaceDepthStyle(depth: SurfaceDepth = 'raised') {
  return SURFACE_DEPTH_STYLES[depth];
}
