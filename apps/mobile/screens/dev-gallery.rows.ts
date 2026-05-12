/**
 * Pure transform from the dev-gallery registry to display rows.
 *
 * Kept separate from `dev-gallery.tsx` so it can be snapshot-tested
 * under the node-only Vitest environment without dragging in
 * react-native at test time.
 */

export type GalleryEntry = {
  /** Stable key + display label. Matches the screen file basename. */
  name: string;
  /** Route to push when tapped (e.g. `/(dev)/login`). */
  href: string;
  /** Optional grouping for the gallery (e.g. `auth`, `app`, `reports`). */
  group?: string;
  /** Optional one-line description shown beneath the name. */
  description?: string;
};

export type GalleryRow =
  | {
      kind: 'header';
      label: string;
    }
  | {
      kind: 'entry';
      name: string;
      href: string;
      description?: string;
    }
  | {
      kind: 'empty';
      label: string;
    };

const EMPTY_LABEL =
  'No screens registered yet. Add ports to apps/mobile/screens/ and ' +
  'register their dev mirror in apps/mobile/app/(dev)/registry.ts.';

export function buildGalleryRows(registry: readonly GalleryEntry[]): GalleryRow[] {
  if (registry.length === 0) {
    return [{ kind: 'empty', label: EMPTY_LABEL }];
  }

  // Sort first by group (undefined groups go last under "Misc"), then by name.
  const grouped = new Map<string, GalleryEntry[]>();
  for (const entry of registry) {
    const group = entry.group ?? 'misc';
    const bucket = grouped.get(group) ?? [];
    bucket.push(entry);
    grouped.set(group, bucket);
  }

  const groupOrder = [...grouped.keys()].sort((a, b) => {
    if (a === 'misc') return 1;
    if (b === 'misc') return -1;
    return a.localeCompare(b);
  });

  const rows: GalleryRow[] = [];
  for (const group of groupOrder) {
    rows.push({ kind: 'header', label: group });
    const entries = (grouped.get(group) ?? []).slice().sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      rows.push({
        kind: 'entry',
        name: entry.name,
        href: entry.href,
        description: entry.description,
      });
    }
  }
  return rows;
}
