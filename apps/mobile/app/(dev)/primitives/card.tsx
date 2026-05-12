import { ScrollView, Text, View } from 'react-native';

import { Card } from '../../../components/primitives/Card';

export default function CardShowcase() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-6 pb-24 gap-4"
    >
      <Text className="text-title-sm text-foreground">Card — variants</Text>
      <View className="gap-3">
        <Card><Text className="text-foreground">default</Text></Card>
        <Card variant="muted"><Text className="text-foreground">muted</Text></Card>
        <Card variant="emphasis"><Text className="text-foreground">emphasis</Text></Card>
        <Card variant="danger"><Text className="text-danger-text">danger</Text></Card>
      </View>

      <Text className="text-title-sm text-foreground">Card — padding</Text>
      <View className="gap-3">
        <Card padding="sm"><Text className="text-foreground">sm padding</Text></Card>
        <Card padding="md"><Text className="text-foreground">md padding</Text></Card>
        <Card padding="lg"><Text className="text-foreground">lg padding</Text></Card>
      </View>
    </ScrollView>
  );
}
