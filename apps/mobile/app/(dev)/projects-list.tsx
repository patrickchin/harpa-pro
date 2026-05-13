/**
 * Dev mirror for ProjectsList — inline mock data + loading states.
 *
 * Toggle between loading / empty / populated for visual review.
 */
import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { ProjectsList, type ProjectRow } from '@/screens/projects-list';

const MOCK_PROJECTS: ProjectRow[] = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Downtown Office Complex',
    role: 'owner',
    address: '123 Main St, San Francisco, CA 94102',
    updatedAt: '2024-05-12T15:30:00.000Z',
  },
  {
    id: '223e4567-e89b-12d3-a456-426614174001',
    name: 'Residential Tower B',
    role: 'admin',
    address: null,
    updatedAt: '2024-05-11T09:15:00.000Z',
  },
  {
    id: '323e4567-e89b-12d3-a456-426614174002',
    name: 'Highway 101 Bridge Expansion',
    role: 'viewer',
    address: 'Hwy 101 @ Shoreline Blvd, Mountain View, CA',
    updatedAt: '2024-05-08T11:45:00.000Z',
  },
];

type DevState = 'loading' | 'empty' | 'populated';

export default function ProjectsListDevMirror() {
  const [state, setState] = useState<DevState>('populated');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const projects = state === 'populated' ? MOCK_PROJECTS : [];

  return (
    <View className="flex-1 bg-background">
      {/* State toggle */}
      <View className="flex-row gap-2 px-5 py-3 bg-surface border-b border-border">
        {(['loading', 'empty', 'populated'] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setState(s)}
            className={`px-3 py-1.5 rounded-md ${
              state === s ? 'bg-primary' : 'bg-surface-emphasis'
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                state === s ? 'text-primary-foreground' : 'text-foreground'
              }`}
            >
              {s}
            </Text>
          </Pressable>
        ))}
      </View>

      <ProjectsList
        projects={projects}
        isLoading={state === 'loading'}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onPressProject={(id) => console.log('[dev] Press project:', id)}
        onPressNewProject={() => console.log('[dev] Press new project')}
      />
    </View>
  );
}
