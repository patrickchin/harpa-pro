import { Inbox } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../../components/primitives/Button';
import { EmptyState } from '../../../components/primitives/EmptyState';
import { colors } from '../../../lib/design-tokens/colors';

export default function EmptyStateShowcase() {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-4 pt-6 pb-24 gap-8">
      <View>
        <Text className="mb-3 text-label text-muted-foreground">title + description</Text>
        <EmptyState title="No reports yet" description="Reports will appear here once generated." />
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">with icon</Text>
        <EmptyState
          icon={<Inbox size={28} color={colors.muted.foreground} />}
          title="Inbox zero"
          description="No new items today. Pull to refresh."
        />
      </View>

      <View>
        <Text className="mb-3 text-label text-muted-foreground">with action</Text>
        <EmptyState
          icon={<Inbox size={28} color={colors.muted.foreground} />}
          title="No projects yet"
          description="Create your first project to get started."
          action={
            <Button variant="default" size="default">
              Create project
            </Button>
          }
        />
      </View>
    </ScrollView>
  );
}
