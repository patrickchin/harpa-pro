import { ScrollView, Text, View } from 'react-native';

import { Skeleton, SkeletonRow } from '../../../components/primitives/Skeleton';

export default function SkeletonShowcase() {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pt-6 pb-24 gap-8">
      <View>
        <Text className="mb-3 text-label text-muted-foreground">default block</Text>
        <Skeleton />
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">stacked rows</Text>
        <View className="gap-2">
          <Skeleton width="60%" height={20} />
          <Skeleton height={14} />
          <Skeleton width="80%" height={14} />
        </View>
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">avatar row</Text>
        <SkeletonRow>
          <Skeleton width={48} height={48} circle />
          <View className="flex-1 gap-2">
            <Skeleton width="50%" height={16} />
            <Skeleton height={14} />
          </View>
        </SkeletonRow>
      </View>
    </ScrollView>
  );
}
