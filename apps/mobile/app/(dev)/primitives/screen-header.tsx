import { ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../../../components/primitives/ScreenHeader';
import { AppHeaderActions } from '../../../components/ui/AppHeaderActions';

export default function ScreenHeaderShowcase() {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pt-6 pb-24 gap-8">
      <View>
        <Text className="mb-3 text-label text-muted-foreground">title only</Text>
        <ScreenHeader title="Reports" />
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">title + subtitle</Text>
        <ScreenHeader title="Riverdale East" subtitle="3 reports • 12 photos" />
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">eyebrow + title + subtitle</Text>
        <ScreenHeader title="Week 14" eyebrow="REPORT" subtitle="Generated 2 hours ago" />
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">with back button</Text>
        <ScreenHeader title="Project detail" onBack={() => {}} backLabel="Projects" />
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">with profile actions</Text>
        <ScreenHeader title="Home" actions={<AppHeaderActions />} />
      </View>
    </ScrollView>
  );
}
