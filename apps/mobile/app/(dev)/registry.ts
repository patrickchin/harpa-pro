/**
 * Dev-gallery registry.
 *
 * Add an entry here every time a new screen body lands in
 * `apps/mobile/screens/<name>.tsx` and a dev mirror lands at
 * `apps/mobile/app/(dev)/<name>.tsx`. The order is irrelevant —
 * `buildGalleryRows` groups + sorts at render time.
 *
 * Empty by design at the end of P2.0b. Populated incrementally
 * across P2.5–P2.7 (auth screens, app shell, projects list) and
 * throughout P3 (per-feature screens).
 */
import type { GalleryEntry } from '../../screens/dev-gallery.rows.js';

export const REGISTRY: readonly GalleryEntry[] = [
  {
    name: 'Button',
    href: '/(dev)/primitives/button',
    group: 'primitives',
    description: 'Variants, sizes, loading + disabled states',
  },
  {
    name: 'IconButton',
    href: '/(dev)/primitives/icon-button',
    group: 'primitives',
    description: 'Square / circle icon-only buttons (xs / sm / default)',
  },
  {
    name: 'Input',
    href: '/(dev)/primitives/input',
    group: 'primitives',
    description: 'Label / hint / error / read-only states',
  },
  {
    name: 'Card',
    href: '/(dev)/primitives/card',
    group: 'primitives',
    description: 'Surface container — variants + padding steps',
  },
  {
    name: 'ScreenHeader',
    href: '/(dev)/primitives/screen-header',
    group: 'primitives',
    description: 'Title / eyebrow / subtitle / back / actions',
  },
  {
    name: 'EmptyState',
    href: '/(dev)/primitives/empty-state',
    group: 'primitives',
    description: 'Muted-card zero state with icon / action slots',
  },
];
