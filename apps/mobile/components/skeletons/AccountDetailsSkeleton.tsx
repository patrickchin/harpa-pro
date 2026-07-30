/**
 * AccountDetailsSkeleton — loading state for the account screen.
 *
 * Layout-shift policy (see docs/v4/arch-mobile-skeletons.md): this
 * skeleton mirrors the ScrollView content in `screens/account.tsx`
 * (px-5, gap: 20, paddingBottom: 40) so the info notice / form fields
 * land on the same Y when the profile arrives. Probes share
 * `account:*` ids with the loaded screen so `useLayoutShiftProbe`
 * records before/after frames for each landmark.
 */
import { View } from 'react-native';

import { Skeleton } from '@/components/primitives/Skeleton';
import { useLayoutShiftProbe } from '@/lib/util/layout-shift-probe';

export interface AccountDetailsSkeletonProps {
  /**
   * Mirror the loaded screen's Edit/Save affordance height when the
   * route has provided `onSaveProfile`. Routes that render a
   * read-only account screen leave this `false` so the placeholder
   * is omitted in both states.
   */
  canEdit?: boolean;
}

// Real Input primitive: `min-h-touch rounded-md border px-4 py-3`
// → 44px tall (Tailwind `touch` token, see tailwind.config.js).
const INPUT_HEIGHT = 44;
// Real text-label token: 0.8125rem / 1rem line height → 16px.
const LABEL_HEIGHT = 16;
// Real InlineNotice ("Email is managed through sign-in…") wraps to
// ~3 lines of text-sm (lh 20) + py-3 (24) + border (2) on typical
// phone widths. Set the placeholder to that combined height so the
// email field below doesn't slide up when content arrives.
const INFO_NOTICE_HEIGHT = 88;
// Button size=lg: min-h-touch (44) + py-3.5 (28) + border (2) +
// text-base lh (~24) clamps to ~54.
const BUTTON_HEIGHT = 54;

export function AccountDetailsSkeleton({
  canEdit = false,
}: AccountDetailsSkeletonProps = {}) {
  const onInfoNoticeLayout = useLayoutShiftProbe('account:info-notice');
  const onEmailFieldLayout = useLayoutShiftProbe('account:email-field');
  const onCompanyFieldLayout = useLayoutShiftProbe('account:company-field');

  return (
    <View
      testID="account-details-skeleton"
      className="flex-1 px-5"
      style={{ gap: 20, paddingBottom: 40 }}
    >
      <View onLayout={onInfoNoticeLayout}>
        <Skeleton width="100%" height={INFO_NOTICE_HEIGHT} radius={8} />
      </View>

      <View className="gap-2" onLayout={onEmailFieldLayout}>
        <Skeleton width={50} height={LABEL_HEIGHT} />
        <Skeleton width="100%" height={INPUT_HEIGHT} radius={8} />
      </View>

      <View className="gap-2">
        <Skeleton width={72} height={LABEL_HEIGHT} />
        <Skeleton width="100%" height={INPUT_HEIGHT} radius={8} />
      </View>

      <View className="gap-2" onLayout={onCompanyFieldLayout}>
        <Skeleton width={100} height={LABEL_HEIGHT} />
        <Skeleton width="100%" height={INPUT_HEIGHT} radius={8} />
      </View>

      {canEdit ? (
        <Skeleton width="100%" height={BUTTON_HEIGHT} radius={8} />
      ) : null}
    </View>
  );
}
