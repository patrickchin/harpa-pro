import { ScrollView, Text, View } from 'react-native';

import { StatTile } from '../../../components/primitives/StatTile';

export default function StatTileShowcase() {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pt-6 pb-24 gap-8">
      <View>
        <Text className="mb-3 text-label text-muted-foreground">all tones</Text>
        <View className="flex-row gap-3">
          <StatTile value={12} label="reports" />
          <StatTile value={3} label="overdue" tone="warning" />
        </View>
        <View className="mt-3 flex-row gap-3">
          <StatTile value={0} label="failed" tone="danger" />
          <StatTile value={42} label="done" tone="success" />
        </View>
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">compact</Text>
        <View className="flex-row gap-3">
          <StatTile value={5} label="open" compact />
          <StatTile value={9} label="closed" compact tone="success" />
        </View>
      </View>
    </ScrollView>
  );
}
