/**
 * Short-URL resolver landing — /r/:reportSlug.
 *
 * Resolves the report slug to {projectSlug, reportNumber} then
 * `router.replace`s to the canonical long URL
 * `/projects/:projectSlug/reports/:number`. See
 * docs/v4/design-p30-ids-slugs.md §6.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useResolveReportSlugQuery } from '@/lib/api/hooks';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';

export default function ResolveReportSlugScreen() {
  const router = useRouter();
  const { reportSlug } = useLocalSearchParams<{ reportSlug: string }>();
  const result = useResolveReportSlugQuery({ params: { reportSlug } });

  useEffect(() => {
    if (result.data) {
      const { projectSlug, reportNumber } = result.data;
      router.replace(`/projects/${projectSlug}/reports/${reportNumber}` as never);
    }
  }, [result.data, router]);

  if (result.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <EmptyState
          title="Link not found"
          description="That report link is no longer valid, or you don't have access to it."
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
      <Text className="mt-3 text-base text-muted-foreground">Opening report…</Text>
    </View>
  );
}
