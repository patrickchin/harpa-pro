/**
 * Short-URL resolver landing — /p/:projectSlug.
 *
 * Resolves the slug via the API then `router.replace`s to the
 * canonical long URL `/projects/:projectSlug`. Uses `replace` so the
 * bounce doesn't pollute the back stack. Renders an error state
 * (never a stuck spinner) when the link is invalid or denied.
 * See docs/v4/design-p30-ids-slugs.md §6.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useResolveProjectSlugQuery } from '@/lib/api/hooks';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';

export default function ResolveProjectSlugScreen() {
  const router = useRouter();
  const { projectSlug } = useLocalSearchParams<{ projectSlug: string }>();
  const result = useResolveProjectSlugQuery({ params: { projectSlug } });

  useEffect(() => {
    if (result.data) {
      router.replace(`/projects/${result.data.projectSlug}` as never);
    }
  }, [result.data, router]);

  if (result.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <EmptyState
          title="Link not found"
          description="That project link is no longer valid, or you don't have access to it."
          action={
            <Button
              variant="default"
              onPress={() => router.replace('/projects' as never)}
            >
              Go to projects
            </Button>
          }
        />
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator />
      <Text className="mt-3 text-base text-muted-foreground">Opening project…</Text>
    </View>
  );
}
