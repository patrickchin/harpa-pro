/**
 * EditProjectSkeleton — loading state for the project edit screen.
 */
import { View } from 'react-native';
import { Skeleton } from '@/components/primitives/Skeleton';

export function EditProjectSkeleton() {
  return (
    <View className="px-5 pt-2 gap-5">
      <View className="gap-2">
        <Skeleton width={120} height={12} />
        <Skeleton width="100%" height={44} radius={8} />
      </View>
      <View className="gap-2">
        <Skeleton width={140} height={12} />
        <Skeleton width="100%" height={44} radius={8} />
      </View>
      <View className="gap-2">
        <Skeleton width={100} height={12} />
        <Skeleton width="100%" height={44} radius={8} />
      </View>
      <Skeleton width="100%" height={48} radius={8} />
    </View>
  );
}
