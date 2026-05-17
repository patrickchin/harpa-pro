/**
 * AccountDetailsSkeleton — loading state for the account screen.
 *
 * Ported verbatim from
 * `../haru3-reports/apps/mobile/components/skeletons/AccountDetailsSkeleton.tsx`
 * on branch `dev`.
 */
import { View } from 'react-native';

import { Skeleton } from '@/components/primitives/Skeleton';

export function AccountDetailsSkeleton() {
  return (
    <View className="flex-1 px-5 gap-5">
      {/* Avatar */}
      <View className="items-center pt-2">
        <Skeleton width={96} height={96} circle />
      </View>

      {/* Info notice */}
      <Skeleton width="100%" height={56} radius={8} />

      {/* Phone field */}
      <View className="gap-2">
        <Skeleton width={50} height={14} />
        <Skeleton width="100%" height={48} radius={8} />
      </View>

      {/* Full Name field */}
      <View className="gap-2">
        <Skeleton width={72} height={14} />
        <Skeleton width="100%" height={48} radius={8} />
      </View>

      {/* Company Name field */}
      <View className="gap-2">
        <Skeleton width={100} height={14} />
        <Skeleton width="100%" height={48} radius={8} />
      </View>
    </View>
  );
}
