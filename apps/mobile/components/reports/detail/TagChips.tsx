import { Text, View } from 'react-native';

interface TagChipsProps {
  tags: string[] | null | undefined;
}

export function TagChips({ tags }: TagChipsProps) {
  if (!tags || tags.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2">
      {tags.map((tag) => (
        <View
          key={tag}
          className="rounded-md border border-border bg-card px-2 py-1"
        >
          <Text className="text-xs font-medium text-muted-foreground">
            {`#${tag}`}
          </Text>
        </View>
      ))}
    </View>
  );
}
