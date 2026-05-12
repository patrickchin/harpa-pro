/**
 * Dev-gallery body. Listed at `app/(dev)/index.tsx`.
 *
 * Pure presentational: renders rows produced by
 * `buildGalleryRows(registry)` from `./dev-gallery.rows`. The
 * `(dev)` route group is guarded by `__DEV__ || env.EXPO_PUBLIC_USE_FIXTURES`
 * in `app/(dev)/_layout.tsx` so this never reaches a production
 * bundle.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { GalleryRow } from './dev-gallery.rows.js';

export type DevGalleryProps = {
  rows: readonly GalleryRow[];
  onSelect: (href: string) => void;
};

export function DevGallery({ rows, onSelect }: DevGalleryProps) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-12 pb-24"
    >
      <Text className="mb-1 text-2xl font-semibold text-foreground">Dev gallery</Text>
      <Text className="mb-6 text-sm text-muted">
        Every shipped screen body, mounted with mock props for manual visual
        review against ../haru3-reports/apps/mobile@dev.
      </Text>

      {rows.map((row, index) => {
        if (row.kind === 'header') {
          return (
            <Text
              key={`h:${row.label}:${index}`}
              className="mt-6 mb-2 text-xs uppercase tracking-wider text-muted"
            >
              {row.label}
            </Text>
          );
        }
        if (row.kind === 'empty') {
          return (
            <View
              key={`e:${index}`}
              className="rounded-xl border border-muted/30 px-4 py-6"
            >
              <Text className="text-sm text-muted">{row.label}</Text>
            </View>
          );
        }
        return (
          <Pressable
            key={`r:${row.href}`}
            onPress={() => onSelect(row.href)}
            className="mb-2 rounded-xl bg-foreground/5 px-4 py-3 active:opacity-70"
          >
            <Text className="text-base text-foreground">{row.name}</Text>
            {row.description ? (
              <Text className="mt-1 text-xs text-muted">{row.description}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
