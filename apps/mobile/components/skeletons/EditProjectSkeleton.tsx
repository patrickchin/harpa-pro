/**
 * EditProjectSkeleton — loading state for the project edit screen.
 *
 * Layout-shift policy (see docs/v4/arch-mobile-skeletons.md): this
 * skeleton mirrors the ScrollView layout used by `project-edit.tsx`
 * (`px-5`, `gap: 20`, `paddingBottom: 28`) so each landmark lands on
 * the same Y when content arrives. Heights are pinned to the real
 * primitives:
 *
 *   - `Input`     → `min-h-touch` = 44px (text-label label = 16px)
 *   - `Button` size="default" (delete) → `min-h-touch` = 44px
 *   - `Button` size="xl"      (save)   → `min-h-touch-lg` = 52px
 *   - All bordered surfaces use `rounded-md` = 6px
 *
 * The warning notice + delete + save buttons are duplicated here as
 * placeholders (rather than hidden) so the page does not jump when the
 * loaded tree replaces the skeleton — see Pitfall 13 in
 * `docs/v4/pitfalls.md`.
 */
import { View } from 'react-native';
import { Skeleton } from '@/components/primitives/Skeleton';
import { useLayoutShiftProbe } from '@/lib/layout-shift-probe';

function FieldSkeleton({
  labelWidth,
  probeId,
}: {
  labelWidth: number;
  probeId?: string;
}) {
  const onLayout = useLayoutShiftProbe(probeId ?? 'edit-project:field');
  return (
    <View className="gap-2" onLayout={probeId ? onLayout : undefined}>
      <Skeleton width={labelWidth} height={16} />
      <Skeleton width="100%" height={44} radius={6} />
    </View>
  );
}

export function EditProjectSkeleton() {
  const onSubmitLayout = useLayoutShiftProbe('edit-project:submit');
  return (
    <View
      testID="edit-project-skeleton"
      className="px-5"
      style={{ gap: 20, paddingBottom: 28 }}
    >
      <FieldSkeleton labelWidth={120} probeId="edit-project:first-field" />
      <FieldSkeleton labelWidth={140} />
      <FieldSkeleton labelWidth={100} probeId="edit-project:last-field" />

      {/* Warning InlineNotice placeholder — rounded-md border + px-4 py-3,
          mirrors title (text-sm/20 + mb-1) + ~3 lines body (text-sm/20). */}
      <View className="rounded-md border border-border bg-surface-muted px-4 py-3 gap-1">
        <Skeleton width="60%" height={20} />
        <Skeleton width="100%" height={20} />
        <Skeleton width="92%" height={20} />
        <Skeleton width="74%" height={20} />
      </View>

      {/* Delete button placeholder — size="default" = 44, self-start. */}
      <View className="self-start">
        <Skeleton width={160} height={44} radius={6} />
      </View>

      {/* Save button placeholder — size="xl" = 52, full width. */}
      <Skeleton
        width="100%"
        height={52}
        radius={6}
        onLayout={onSubmitLayout}
      />
    </View>
  );
}
