/**
 * Projects index — placeholder for P2.7.
 *
 * Real projects list lands in P2.7 with:
 *   - ProjectsScreen body component (screen pattern)
 *   - useProjects() hook wiring the API contract
 *   - Dev mirror at (dev)/projects
 *   - Empty state + skeleton + pull-to-refresh
 */
import { Text, View } from 'react-native';

export default function ProjectsIndex() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-foreground text-title">Projects</Text>
      <Text className="text-muted-foreground mt-2">Coming in P2.7</Text>
    </View>
  );
}
