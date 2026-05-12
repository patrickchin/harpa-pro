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

export const REGISTRY: readonly GalleryEntry[] = [];
