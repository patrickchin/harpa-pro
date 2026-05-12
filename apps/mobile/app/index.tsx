import { Text, View } from 'react-native';

/**
 * P0.6 placeholder root screen. Real screens land in P3 against the
 * per-page specs in docs/legacy-v3/realignment/pages/.
 */
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-foreground">harpa-pro</Text>
    </View>
  );
}
